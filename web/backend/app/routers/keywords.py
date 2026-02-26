"""
Keyword management — listing, CRUD, category/tag assignment, and bulk operations.
Also handles applying keyword→category mappings to transactions.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Keyword, Tag, Transaction, keyword_tags, transaction_tags
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


# ── Apply keyword→category mappings to transactions ──────────────────────────

@router.post("/apply-categories")
def apply_keyword_categories(db: Session = Depends(get_db)):
    """
    Re-scan all transactions, assign categories, and inherit tags from matched keywords.
    """
    # Get all non-noise keywords that have a category
    all_kws = (
        db.query(Keyword)
        .filter(Keyword.is_noise == False)
        .all()
    )
    # Also include keywords with tags but no category
    kw_with_tags = [kw for kw in all_kws if kw.tags]
    categorized_keywords = [kw for kw in all_kws if kw.category_id is not None]

    kw_set: set[str] = {kw.keyword for kw in all_kws if kw.category_id is not None or kw.tags}
    # Maps: keyword_str -> (category_id | None, frequency, set[tag_ids])
    kw_meta: dict[str, tuple[int | None, int, set[int]]] = {
        kw.keyword: (kw.category_id, kw.frequency, {t.id for t in kw.tags})
        for kw in all_kws
        if kw.category_id is not None or kw.tags
    }

    if not kw_set:
        return {"status": "ok", "updated": 0, "conflicts": 0}

    # Pre-load all Tag objects for efficient lookup
    tag_lookup: dict[int, Tag] = {t.id: t for t in db.query(Tag).all()}

    transactions = db.query(Transaction).all()
    updated = 0
    conflicts = 0

    for txn in transactions:
        matched = match_transaction_keywords(txn.description, kw_set)
        if not matched:
            continue

        # ── Category assignment ───────────────────────────────────────────
        categories: dict[int, int] = {}  # category_id → max frequency
        inherited_tag_ids: set[int] = set()

        for m in matched:
            cat_id, freq, tag_ids = kw_meta[m]
            inherited_tag_ids |= tag_ids
            if cat_id is not None:
                if cat_id not in categories or freq > categories[cat_id]:
                    categories[cat_id] = freq

        if len(categories) == 1:
            cat_id = next(iter(categories))
            if txn.category_id != cat_id:
                txn.category_id = cat_id
                updated += 1
        elif len(categories) > 1:
            best_cat = max(categories, key=categories.get)
            if txn.category_id != best_cat:
                txn.category_id = best_cat
                updated += 1
            conflicts += 1

        # ── Tag inheritance (additive — never removes manual tags) ────────
        existing_tag_ids = {t.id for t in txn.tags}
        for tid in inherited_tag_ids - existing_tag_ids:
            if tid in tag_lookup:
                txn.tags.append(tag_lookup[tid])

    db.commit()
    return {"status": "ok", "updated": updated, "conflicts": conflicts}
