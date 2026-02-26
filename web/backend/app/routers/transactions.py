"""
Transaction listing with filtering, search, and pagination.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import or_, func, case
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Transaction, Category, Tag, transaction_tags
from ..schemas import TransactionOut, TransactionListResponse, BulkTransactionCategoryAssign, BulkTransactionTagUpdate, TagOut

from datetime import date
from typing import Optional

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("/banks")
def get_banks(db: Session = Depends(get_db)):
    """Return distinct bank names present in the transactions table."""
    rows = db.query(Transaction.bank_name).distinct().filter(Transaction.bank_name.isnot(None)).all()
    return [r[0] for r in rows if r[0]]


def _build_query(
    db: Session,
    search: Optional[str] = None,
    bank_name: Optional[str] = None,
    account_type: Optional[str] = None,
    category_id: Optional[int] = None,
    uncategorized: Optional[bool] = None,
    tag_ids: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    amount_type: Optional[str] = None,
):
    q = db.query(Transaction).options(selectinload(Transaction.tags))

    if search:
        q = q.filter(Transaction.description.ilike(f"%{search}%"))

    if bank_name:
        q = q.filter(Transaction.bank_name == bank_name.upper())

    if account_type:
        q = q.filter(Transaction.account_type == account_type.capitalize())

    if uncategorized:
        q = q.filter(Transaction.category_id.is_(None))
    elif category_id is not None:
        q = q.filter(Transaction.category_id == category_id)

    if tag_ids:
        ids = [int(x) for x in tag_ids.split(",") if x.strip()]
        if ids:
            tagged_sq = (
                db.query(transaction_tags.c.transaction_id)
                .filter(transaction_tags.c.tag_id.in_(ids))
                .distinct()
                .subquery()
            )
            q = q.filter(Transaction.id.in_(tagged_sq))

    if date_from:
        q = q.filter(Transaction.transaction_date >= date_from)
    if date_to:
        q = q.filter(Transaction.transaction_date <= date_to)

    if min_amount is not None or max_amount is not None:
        # Determine which amount column(s) to filter
        if amount_type == "credit":
            amt_col = Transaction.credit_amount
        elif amount_type == "debit":
            amt_col = Transaction.debit_amount
        else:
            # Use whichever is not null (net amount)
            amt_col = func.coalesce(Transaction.debit_amount, Transaction.credit_amount)

        if min_amount is not None:
            q = q.filter(amt_col >= min_amount)
        if max_amount is not None:
            q = q.filter(amt_col <= max_amount)

    return q


@router.get("/", response_model=TransactionListResponse)
def list_transactions(
    search: Optional[str] = Query(None),
    bank_name: Optional[str] = Query(None),
    account_type: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    uncategorized: Optional[bool] = Query(None),
    tag_ids: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None),
    amount_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: str = Query("transaction_date"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
):
    q = _build_query(
        db, search, bank_name, account_type, category_id, uncategorized, tag_ids,
        date_from, date_to, min_amount, max_amount, amount_type,
    )

    total = q.count()

    # Sorting
    sort_col = getattr(Transaction, sort_by, Transaction.transaction_date)
    if sort_order == "asc":
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())

    offset = (page - 1) * page_size
    rows = q.offset(offset).limit(page_size).all()

    # Build response with category names and tags
    txns = []
    for row in rows:
        t = TransactionOut.model_validate(row)
        if row.category:
            t.category_name = row.category.name
        t.tags = [TagOut.model_validate(tag) for tag in row.tags]
        txns.append(t)

    return TransactionListResponse(
        transactions=txns,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.put("/bulk/category")
def bulk_set_transaction_category(
    body: BulkTransactionCategoryAssign,
    db: Session = Depends(get_db),
):
    """Assign a category to multiple transactions at once."""
    db.query(Transaction).filter(Transaction.id.in_(body.transaction_ids)).update(
        {"category_id": body.category_id}, synchronize_session="fetch"
    )
    db.commit()
    return {"status": "ok", "updated": len(body.transaction_ids)}


@router.put("/{transaction_id}/category")
def set_transaction_category(
    transaction_id: int,
    category_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Manually override the category for a single transaction."""
    txn = db.query(Transaction).get(transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    txn.category_id = category_id
    db.commit()
    return {"status": "ok"}


@router.put("/bulk/tags")
def bulk_update_transaction_tags(body: BulkTransactionTagUpdate, db: Session = Depends(get_db)):
    """Add or remove tags from multiple transactions at once."""
    txns = db.query(Transaction).options(selectinload(Transaction.tags)).filter(
        Transaction.id.in_(body.transaction_ids)
    ).all()

    add_tags = db.query(Tag).filter(Tag.id.in_(body.add_tag_ids)).all() if body.add_tag_ids else []
    remove_tags = db.query(Tag).filter(Tag.id.in_(body.remove_tag_ids)).all() if body.remove_tag_ids else []

    for txn in txns:
        for tag in add_tags:
            if tag not in txn.tags:
                txn.tags.append(tag)
        for tag in remove_tags:
            if tag in txn.tags:
                txn.tags.remove(tag)

    db.commit()
    return {"status": "ok", "updated": len(txns)}


@router.put("/{transaction_id}/tags")
def update_transaction_tags(
    transaction_id: int,
    body: BulkTransactionTagUpdate,
    db: Session = Depends(get_db),
):
    """Add or remove tags from a single transaction."""
    txn = db.query(Transaction).options(selectinload(Transaction.tags)).get(transaction_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")

    add_tags = db.query(Tag).filter(Tag.id.in_(body.add_tag_ids)).all() if body.add_tag_ids else []
    remove_tags = db.query(Tag).filter(Tag.id.in_(body.remove_tag_ids)).all() if body.remove_tag_ids else []

    for tag in add_tags:
        if tag not in txn.tags:
            txn.tags.append(tag)
    for tag in remove_tags:
        if tag in txn.tags:
            txn.tags.remove(tag)

    db.commit()
    db.refresh(txn)
    return [TagOut.model_validate(t) for t in txn.tags]
