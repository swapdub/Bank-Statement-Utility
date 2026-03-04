"""
Pydantic schemas for request/response validation.
"""

from __future__ import annotations
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Upload ────────────────────────────────────────────────────────────────────
class UploadResponse(BaseModel):
    session_id: int
    filename: str
    bank_name: str
    account_type: str
    record_count: int
    failed_count: int
    duplicate_count: int = 0
    status: str
    message: str
    error_details: Optional[list[str]] = None


# ── Transaction ───────────────────────────────────────────────────────────────
class TransactionOut(BaseModel):
    id: int
    upload_session_id: int
    bank_name: str
    account_type: str
    transaction_date: date
    description: str
    debit_amount: Optional[float] = None
    credit_amount: Optional[float] = None
    cheque_ref_number: Optional[str] = None
    closing_balance: Optional[float] = None
    value_date: Optional[date] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    is_transfer: bool = False
    transfer_link_id: Optional[int] = None
    transfer_counterpart_id: Optional[int] = None
    tags: list["TagOut"] = []

    model_config = {"from_attributes": True}


class TransactionListResponse(BaseModel):
    transactions: list[TransactionOut]
    total: int
    page: int
    page_size: int


class TransactionFilterParams(BaseModel):
    search: Optional[str] = None
    bank_name: Optional[str] = None
    account_type: Optional[str] = None
    category_id: Optional[int] = None
    uncategorized: Optional[bool] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    amount_type: Optional[str] = None  # "debit" | "credit" | "all"
    page: int = 1
    page_size: int = 50
    sort_by: str = "transaction_date"
    sort_order: str = "desc"


# ── Category ──────────────────────────────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class CategoryOut(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    is_default: bool
    keyword_count: int = 0
    transaction_count: int = 0

    model_config = {"from_attributes": True}


# ── Tag ───────────────────────────────────────────────────────────────────────
class TagCreate(BaseModel):
    name: str
    color: Optional[str] = None


class TagOut(BaseModel):
    id: int
    name: str
    color: Optional[str] = None

    model_config = {"from_attributes": True}


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

# ── Keyword ───────────────────────────────────────────────────────────────────
class KeywordOut(BaseModel):
    id: int
    keyword: str
    frequency: int
    is_noise: bool
    is_user_added: bool
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    tags: list[TagOut] = []

    model_config = {"from_attributes": True}


class KeywordCreate(BaseModel):
    keyword: str


class KeywordCategoryAssign(BaseModel):
    category_id: Optional[int] = None  # None to unassign


class BulkTransactionCategoryAssign(BaseModel):
    transaction_ids: list[int]
    category_id: Optional[int] = None


class BulkTransactionTagUpdate(BaseModel):
    transaction_ids: list[int]
    add_tag_ids: list[int] = []
    remove_tag_ids: list[int] = []


class BulkKeywordTagUpdate(BaseModel):
    keyword_ids: list[int]
    add_tag_ids: list[int] = []
    remove_tag_ids: list[int] = []


class BulkKeywordCategoryAssign(BaseModel):
    keyword_ids: list[int]
    category_id: Optional[int] = None


# ── Analytics ─────────────────────────────────────────────────────────────────
class CategorySpending(BaseModel):
    category_id: Optional[int]
    category_name: str
    color: Optional[str]
    total_debit: float
    total_credit: float
    transaction_count: int


class TagSpending(BaseModel):
    tag_id: int
    tag_name: str
    color: Optional[str]
    total_debit: float
    total_credit: float
    transaction_count: int


class MonthlyTrend(BaseModel):
    month: str  # YYYY-MM
    total_debit: float
    total_credit: float


class AnalyticsSummary(BaseModel):
    total_debit: float
    total_credit: float
    transaction_count: int
    categorized_count: int
    uncategorized_count: int
    category_spending: list[CategorySpending]
    tag_spending: list[TagSpending] = []
    monthly_trends: list[MonthlyTrend]
    top_keywords: list[KeywordOut]


# ── Supported formats info ────────────────────────────────────────────────────
class AccountTypeInfo(BaseModel):
    type: str
    formats: list[str]


class BankInfo(BaseModel):
    name: str
    account_types: list[AccountTypeInfo]


class SupportedFormatsResponse(BaseModel):
    banks: list[BankInfo]


# ── Transfer links ────────────────────────────────────────────────────────────
class TransferLinkTransaction(BaseModel):
    """Compact transaction info for transfer link display."""
    id: int
    bank_name: str
    account_type: str
    transaction_date: date
    description: str
    debit_amount: Optional[float] = None
    credit_amount: Optional[float] = None

    model_config = {"from_attributes": True}


class TransferLinkOut(BaseModel):
    id: int
    debit_txn: TransferLinkTransaction
    credit_txn: TransferLinkTransaction
    status: str
    confidence: Optional[float] = None
    created_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ManualLinkRequest(BaseModel):
    debit_txn_id: int
    credit_txn_id: int
