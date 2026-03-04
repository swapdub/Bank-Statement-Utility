"""
Transaction listing with filtering, search, and pagination.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import or_, func, case
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Transaction, Category, Tag, transaction_tags, TransferLink
from ..schemas import TransactionOut, TransactionListResponse, BulkTransactionCategoryAssign, BulkTransactionTagUpdate, TagOut, TransactionUpdate

from datetime import date
from typing import Optional

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("/banks")
def get_banks(db: Session = Depends(get_db)):
    """Return distinct bank names present in the transactions table."""
    rows = db.query(Transaction.bank_name).distinct().filter(Transaction.bank_name.isnot(None)).all()
    return [r[0] for r in rows if r[0]]


def _apply_filters(
    q,
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
    bank_names: Optional[str] = None,
    category_ids: Optional[str] = None,
    untagged: Optional[bool] = None,
):

    if search:
        q = q.filter(Transaction.description.ilike(f"%{search}%"))

    # Multi-value bank filter takes precedence over single
    if bank_names:
        names = [n.strip().upper() for n in bank_names.split(",") if n.strip()]
        if names:
            q = q.filter(Transaction.bank_name.in_(names))
    elif bank_name:
        q = q.filter(Transaction.bank_name == bank_name.upper())

    if account_type:
        q = q.filter(Transaction.account_type == account_type.capitalize())

    # Multi-value category filter takes precedence over single
    if uncategorized:
        q = q.filter(Transaction.category_id.is_(None))
    elif category_ids:
        ids = [int(x) for x in category_ids.split(",") if x.strip()]
        if ids:
            q = q.filter(Transaction.category_id.in_(ids))
    elif category_id is not None:
        q = q.filter(Transaction.category_id == category_id)

    if untagged:
        # Transactions with NO tags at all
        has_tag_sq = db.query(transaction_tags.c.transaction_id).distinct().subquery()
        q = q.filter(~Transaction.id.in_(has_tag_sq))
    elif tag_ids:
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
    bank_names: Optional[str] = None,
    category_ids: Optional[str] = None,
    untagged: Optional[bool] = None,
):
    q = db.query(Transaction).options(selectinload(Transaction.tags))
    return _apply_filters(q, db, search, bank_name, account_type, category_id, uncategorized,
                          tag_ids, date_from, date_to, min_amount, max_amount, amount_type,
                          bank_names, category_ids, untagged)


@router.get("/aggregate")
def get_transaction_aggregate(
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
    bank_names: Optional[str] = Query(None),
    category_ids: Optional[str] = Query(None),
    untagged: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    """Return aggregate debit/credit sums for the current filter set."""
    base = db.query(Transaction)
    q = _apply_filters(base, db, search, bank_name, account_type, category_id, uncategorized,
                       tag_ids, date_from, date_to, min_amount, max_amount, amount_type,
                       bank_names, category_ids, untagged)
    result = q.with_entities(
        func.coalesce(func.sum(Transaction.debit_amount), 0).label("debit_sum"),
        func.coalesce(func.sum(Transaction.credit_amount), 0).label("credit_sum"),
        func.count(Transaction.id).label("count"),
    ).one()
    debit = float(result.debit_sum)
    credit = float(result.credit_sum)
    return {"debit_sum": debit, "credit_sum": credit, "net": credit - debit, "count": result.count}


@router.put("/{transaction_id}")
def update_transaction_fields(
    transaction_id: int,
    body: TransactionUpdate,
    db: Session = Depends(get_db),
):
    """Update editable fields of a single transaction."""
    txn = db.query(Transaction).options(selectinload(Transaction.tags)).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    if body.transaction_date is not None:
        txn.transaction_date = body.transaction_date
    if body.description is not None:
        txn.description = body.description
    if body.debit_amount is not None or body.clear_debit:
        txn.debit_amount = body.debit_amount
    if body.credit_amount is not None or body.clear_credit:
        txn.credit_amount = body.credit_amount
    if body.closing_balance is not None or body.clear_balance:
        txn.closing_balance = body.closing_balance
    if body.value_date is not None or body.clear_value_date:
        txn.value_date = body.value_date
    if body.cheque_ref_number is not None or body.clear_cheque_ref:
        txn.cheque_ref_number = body.cheque_ref_number
    db.commit()
    db.refresh(txn)
    t = TransactionOut.model_validate(txn)
    if txn.category:
        t.category_name = txn.category.name
    t.tags = [TagOut.model_validate(tag) for tag in txn.tags]
    return t


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Return a single transaction by ID."""
    txn = db.query(Transaction).options(selectinload(Transaction.tags)).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    t = TransactionOut.model_validate(txn)
    if txn.category:
        t.category_name = txn.category.name
    t.tags = [TagOut.model_validate(tag) for tag in txn.tags]
    return t


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
    bank_names: Optional[str] = Query(None),
    category_ids: Optional[str] = Query(None),
    untagged: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: str = Query("transaction_date"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
):
    q = _build_query(
        db, search, bank_name, account_type, category_id, uncategorized, tag_ids,
        date_from, date_to, min_amount, max_amount, amount_type, bank_names, category_ids, untagged,
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

    # Build response with category names, tags, and transfer link IDs
    txn_ids = [row.id for row in rows]
    # Batch-fetch transfer links for all transactions on this page
    link_map: dict[int, int] = {}
    counterpart_map: dict[int, int] = {}
    if txn_ids:
        links = db.query(TransferLink).filter(
            TransferLink.status.in_(["suggested", "confirmed"]),
            or_(
                TransferLink.debit_txn_id.in_(txn_ids),
                TransferLink.credit_txn_id.in_(txn_ids),
            ),
        ).all()
        for lnk in links:
            link_map.setdefault(lnk.debit_txn_id, lnk.id)
            link_map.setdefault(lnk.credit_txn_id, lnk.id)
            counterpart_map[lnk.debit_txn_id] = lnk.credit_txn_id
            counterpart_map[lnk.credit_txn_id] = lnk.debit_txn_id

    txns = []
    for row in rows:
        t = TransactionOut.model_validate(row)
        if row.category:
            t.category_name = row.category.name
        t.tags = [TagOut.model_validate(tag) for tag in row.tags]
        t.transfer_link_id = link_map.get(row.id)
        t.transfer_counterpart_id = counterpart_map.get(row.id)
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
