"""
Keyword management — listing, CRUD, category/tag assignment, and bulk operations.
Also handles applying keyword→category mappings to transactions.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Keyword, Tag, Transaction, keyword_tags
from ..schemas import (
    KeywordOut, KeywordCreate, KeywordCategoryAssign,
    BulkKeywordTagUpdate, BulkKeywordCategoryAssign, TagOut,
)
from ..services.keyword_extractor import match_transaction_keywords

from typing import Optional

router = APIRouter(prefix="/api/keywords", tags=["keywords"])


def _keyword_to_out(kw: Keyword) -> KeywordOut:
    out = KeywordOut(
        id=kw.id,
        keyword=kw.keyword,
        frequency=kw.frequency,
        is_noise=kw.is_noise,
        is_user_added=kw.is_user_added,
        category_id=kw.category_id,
        category_name=kw.category.name if kw.category else None,
        tags=[TagOut.model_validate(t) for t in kw.tags],
    )
    return out


@router.get("/", response_model=list[KeywordOut])
def list_keywords(
    category_id: Optional[int] = Query(None),
    uncategorized: Optional[bool] = Query(None),
    has_tag: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    min_frequency: int = Query(1, ge=1),
    show_noise: bool = Query(False),
    db: Session = Depends(get_db),
):
    q = db.query(Keyword)

    if not show_noise:
        q = q.filter(Keyword.is_noise == False)

    if search:
        q = q.filter(Keyword.keyword.ilike(f"%{search}%"))

    if uncategorized:
        q = q.filter(Keyword.category_id.is_(None))
    elif category_id is not None:
        q = q.filter(Keyword.category_id == category_id)

    if has_tag is not None:
        q = q.join(Keyword.tags).filter(Tag.id == has_tag)

    q = q.filter(Keyword.frequency >= min_frequency)
    q = q.order_by(Keyword.frequency.desc())

    return [_keyword_to_out(kw) for kw in q.all()]


@router.post("/", response_model=KeywordOut)
def create_keyword(body: KeywordCreate, db: Session = Depends(get_db)):
    normalised = body.keyword.strip().upper()
    existing = db.query(Keyword).filter(Keyword.keyword == normalised).first()
    if existing:
        raise HTTPException(400, f"Keyword '{normalised}' already exists")
    kw = Keyword(keyword=normalised, frequency=0, is_user_added=True)
    db.add(kw)
    db.commit()
    db.refresh(kw)
    return _keyword_to_out(kw)


@router.delete("/{keyword_id}")
def delete_keyword(keyword_id: int, db: Session = Depends(get_db)):
    kw = db.query(Keyword).get(keyword_id)
    if not kw:
        raise HTTPException(404, "Keyword not found")
    db.delete(kw)
    db.commit()
    return {"status": "deleted"}


@router.put("/{keyword_id}/noise")
def toggle_noise(keyword_id: int, db: Session = Depends(get_db)):
    kw = db.query(Keyword).get(keyword_id)
    if not kw:
        raise HTTPException(404, "Keyword not found")
    kw.is_noise = not kw.is_noise
    db.commit()
    return {"status": "ok", "is_noise": kw.is_noise}


@router.put("/{keyword_id}/category")
def assign_category(keyword_id: int, body: KeywordCategoryAssign, db: Session = Depends(get_db)):
    kw = db.query(Keyword).get(keyword_id)
    if not kw:
        raise HTTPException(404, "Keyword not found")
    kw.category_id = body.category_id
    db.commit()
    return {"status": "ok"}


# ── Bulk operations ───────────────────────────────────────────────────────────

@router.put("/bulk/category")
def bulk_assign_category(body: BulkKeywordCategoryAssign, db: Session = Depends(get_db)):
    db.query(Keyword).filter(Keyword.id.in_(body.keyword_ids)).update(
        {"category_id": body.category_id}, synchronize_session="fetch"
    )
    db.commit()
    return {"status": "ok", "updated": len(body.keyword_ids)}


@router.put("/bulk/tags")
def bulk_update_tags(body: BulkKeywordTagUpdate, db: Session = Depends(get_db)):
    keywords = db.query(Keyword).filter(Keyword.id.in_(body.keyword_ids)).all()

    add_tags = db.query(Tag).filter(Tag.id.in_(body.add_tag_ids)).all() if body.add_tag_ids else []
    remove_tags = db.query(Tag).filter(Tag.id.in_(body.remove_tag_ids)).all() if body.remove_tag_ids else []

    for kw in keywords:
        for tag in add_tags:
            if tag not in kw.tags:
                kw.tags.append(tag)
        for tag in remove_tags:
            if tag in kw.tags:
                kw.tags.remove(tag)

    db.commit()
    return {"status": "ok", "updated": len(keywords)}


# ── Apply keyword→category mappings to transactions ──────────────────────────

@router.post("/apply-categories")
def apply_keyword_categories(db: Session = Depends(get_db)):
    """
    Re-scan all transactions and assign categories based on keyword mappings.
    Returns count of transactions updated.

    Logic:
    - For each transaction, find which categorized keywords match its description.
    - If exactly one category matches → assign it.
    - If multiple categories match → flag as conflict (leave unchanged or use highest-frequency keyword's category).
    - If no keywords match → leave as uncategorized.
    """
    # Get all keywords that have a category assigned
    categorized_keywords = (
        db.query(Keyword)
        .filter(Keyword.category_id.isnot(None), Keyword.is_noise == False)
        .all()
    )

    if not categorized_keywords:
        return {"status": "ok", "updated": 0, "conflicts": 0}

    # Build a lookup: keyword_str → (category_id, frequency)
    kw_map: dict[str, tuple[int, int]] = {}
    kw_set: set[str] = set()
    for kw in categorized_keywords:
        kw_map[kw.keyword] = (kw.category_id, kw.frequency)
        kw_set.add(kw.keyword)

    transactions = db.query(Transaction).all()
    updated = 0
    conflicts = 0

    for txn in transactions:
        matched = match_transaction_keywords(txn.description, kw_set)
        if not matched:
            continue

        # Collect distinct categories from matched keywords
        categories: dict[int, int] = {}  # category_id → max frequency
        for m in matched:
            cat_id, freq = kw_map[m]
            if cat_id not in categories or freq > categories[cat_id]:
                categories[cat_id] = freq

        if len(categories) == 1:
            cat_id = next(iter(categories))
            if txn.category_id != cat_id:
                txn.category_id = cat_id
                updated += 1
        elif len(categories) > 1:
            # Conflict: pick the category whose keyword has the highest frequency
            best_cat = max(categories, key=categories.get)
            if txn.category_id != best_cat:
                txn.category_id = best_cat
                updated += 1
            conflicts += 1

    db.commit()
    return {"status": "ok", "updated": updated, "conflicts": conflicts}
