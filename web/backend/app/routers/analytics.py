"""
Analytics and spending insights.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case, extract
from sqlalchemy.orm import Session

from datetime import date
from typing import Optional

from ..database import get_db
from ..models import Transaction, Category, Keyword
from ..schemas import (
    AnalyticsSummary, CategorySpending, MonthlyTrend, KeywordOut, TagOut,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
def get_analytics_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    bank_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return a full analytics summary for the dashboard."""

    # Base query with optional filters
    base = db.query(Transaction)
    if date_from:
        base = base.filter(Transaction.transaction_date >= date_from)
    if date_to:
        base = base.filter(Transaction.transaction_date <= date_to)
    if bank_name:
        base = base.filter(Transaction.bank_name == bank_name.upper())

    # ── Totals ────────────────────────────────────────────────────────────
    totals = base.with_entities(
        func.coalesce(func.sum(Transaction.debit_amount), 0).label("total_debit"),
        func.coalesce(func.sum(Transaction.credit_amount), 0).label("total_credit"),
        func.count(Transaction.id).label("count"),
        func.count(Transaction.category_id).label("categorized"),
    ).first()

    total_debit = float(totals.total_debit)
    total_credit = float(totals.total_credit)
    txn_count = totals.count
    categorized = totals.categorized
    uncategorized = txn_count - categorized

    # ── Category spending breakdown ───────────────────────────────────────
    cat_rows = (
        base.with_entities(
            Transaction.category_id,
            func.coalesce(func.sum(Transaction.debit_amount), 0).label("debit"),
            func.coalesce(func.sum(Transaction.credit_amount), 0).label("credit"),
            func.count(Transaction.id).label("cnt"),
        )
        .group_by(Transaction.category_id)
        .all()
    )

    # Fetch all categories for name/color lookup
    cat_lookup = {c.id: c for c in db.query(Category).all()}

    category_spending = []
    for row in cat_rows:
        cat = cat_lookup.get(row.category_id)
        category_spending.append(CategorySpending(
            category_id=row.category_id,
            category_name=cat.name if cat else "Uncategorized",
            color=cat.color if cat else "#9ca3af",
            total_debit=float(row.debit),
            total_credit=float(row.credit),
            transaction_count=row.cnt,
        ))

    # Sort by total_debit descending
    category_spending.sort(key=lambda x: x.total_debit, reverse=True)

    # ── Monthly trends ────────────────────────────────────────────────────
    # SQLite strftime for month extraction
    month_rows = (
        base.with_entities(
            func.strftime("%Y-%m", Transaction.transaction_date).label("month"),
            func.coalesce(func.sum(Transaction.debit_amount), 0).label("debit"),
            func.coalesce(func.sum(Transaction.credit_amount), 0).label("credit"),
        )
        .group_by(func.strftime("%Y-%m", Transaction.transaction_date))
        .order_by(func.strftime("%Y-%m", Transaction.transaction_date))
        .all()
    )

    monthly_trends = [
        MonthlyTrend(month=row.month, total_debit=float(row.debit), total_credit=float(row.credit))
        for row in month_rows
    ]

    # ── Top keywords ──────────────────────────────────────────────────────
    top_keywords_raw = (
        db.query(Keyword)
        .filter(Keyword.is_noise == False)
        .order_by(Keyword.frequency.desc())
        .limit(20)
        .all()
    )

    top_keywords = [
        KeywordOut(
            id=kw.id,
            keyword=kw.keyword,
            frequency=kw.frequency,
            is_noise=kw.is_noise,
            is_user_added=kw.is_user_added,
            category_id=kw.category_id,
            category_name=kw.category.name if kw.category else None,
            tags=[TagOut.model_validate(t) for t in kw.tags],
        )
        for kw in top_keywords_raw
    ]

    return AnalyticsSummary(
        total_debit=total_debit,
        total_credit=total_credit,
        transaction_count=txn_count,
        categorized_count=categorized,
        uncategorized_count=uncategorized,
        category_spending=category_spending,
        monthly_trends=monthly_trends,
        top_keywords=top_keywords,
    )
