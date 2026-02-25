"""
Transaction listing with filtering, search, and pagination.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, func, case
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Transaction, Category
from ..schemas import TransactionOut, TransactionListResponse, BulkTransactionCategoryAssign

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
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    amount_type: Optional[str] = None,
):
    q = db.query(Transaction)

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
        db, search, bank_name, account_type, category_id, uncategorized,
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

    # Build response with category names
    txns = []
    for row in rows:
        t = TransactionOut.model_validate(row)
        if row.category:
            t.category_name = row.category.name
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
        from fastapi import HTTPException
        raise HTTPException(404, "Transaction not found")
    txn.category_id = category_id
    db.commit()
    return {"status": "ok"}
