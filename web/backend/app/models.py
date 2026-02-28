"""
SQLAlchemy models for the expense analysis web app.
"""

import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Text,
    ForeignKey, Table, UniqueConstraint, Index, Boolean, func
)
from sqlalchemy.orm import relationship

from .database import Base

# ── Association table: keyword ↔ tag (M:M) ──────────────────────────────────
keyword_tags = Table(
    "keyword_tags",
    Base.metadata,
    Column("keyword_id", Integer, ForeignKey("keywords.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

# ── Association table: transaction ↔ tag (M:M) ───────────────────────────────
transaction_tags = Table(
    "transaction_tags",
    Base.metadata,
    Column("transaction_id", Integer, ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class UploadSession(Base):
    """Tracks each file upload."""
    __tablename__ = "upload_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(512), nullable=False)
    bank_name = Column(String(50), nullable=False)
    account_type = Column(String(50), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)
    record_count = Column(Integer, default=0)
    status = Column(String(20), default="success")  # success | partial | failed
    error_message = Column(Text, nullable=True)

    transactions = relationship("Transaction", back_populates="upload_session", cascade="all, delete-orphan")


class Transaction(Base):
    """Parsed bank statement transaction."""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    upload_session_id = Column(Integer, ForeignKey("upload_sessions.id", ondelete="CASCADE"), nullable=False)
    bank_name = Column(String(50), nullable=False)
    account_type = Column(String(50), nullable=False)
    transaction_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    debit_amount = Column(Float, nullable=True)
    credit_amount = Column(Float, nullable=True)
    cheque_ref_number = Column(String(100), nullable=True)
    closing_balance = Column(Float, nullable=True)
    value_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Category assigned (through keyword match or manual override)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)

    # Transfer linking — denormalized flag for fast analytics exclusion
    is_transfer = Column(Boolean, default=False, server_default="0", nullable=False)

    upload_session = relationship("UploadSession", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    tags = relationship("Tag", secondary="transaction_tags", back_populates="transactions")

    __table_args__ = (
        Index("idx_txn_date", "transaction_date"),
        Index("idx_txn_bank", "bank_name", "account_type"),
        Index("idx_txn_category", "category_id"),
        Index("idx_txn_transfer", "is_transfer"),
    )


class Category(Base):
    """Expense category (e.g. Food, Transport, Utilities)."""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    color = Column(String(7), nullable=True)   # hex color for UI charts
    icon = Column(String(50), nullable=True)    # optional icon name
    is_default = Column(Boolean, default=False) # pre-seeded categories
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    keywords = relationship("Keyword", back_populates="category")
    transactions = relationship("Transaction", back_populates="category")


class Tag(Base):
    """Free-form labels that can be attached to keywords."""
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    color = Column(String(7), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    keywords = relationship("Keyword", secondary=keyword_tags, back_populates="tags")
    transactions = relationship("Transaction", secondary="transaction_tags", back_populates="tags")


class Keyword(Base):
    """
    Extracted or user-defined keyword from transaction descriptions.
    Each keyword belongs to exactly one category (or none).
    """
    __tablename__ = "keywords"

    id = Column(Integer, primary_key=True, autoincrement=True)
    keyword = Column(String(255), nullable=False, unique=True)
    frequency = Column(Integer, default=1)       # how many transactions contain this keyword
    is_noise = Column(Boolean, default=False)     # user marked as noise / stopword
    is_user_added = Column(Boolean, default=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    category = relationship("Category", back_populates="keywords")
    tags = relationship("Tag", secondary=keyword_tags, back_populates="keywords")

    __table_args__ = (
        Index("idx_keyword_freq", "frequency"),
        Index("idx_keyword_category", "category_id"),
    )


class TransferLink(Base):
    """
    Links two transactions that represent the same money moving between accounts.
    debit_txn = money going out, credit_txn = money coming in.
    status: suggested | confirmed | denied
    """
    __tablename__ = "transfer_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    debit_txn_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    credit_txn_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), nullable=False, default="suggested")  # suggested | confirmed | denied
    confidence = Column(Float, nullable=True)  # 0.0 – 1.0 detection score
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    confirmed_at = Column(DateTime, nullable=True)

    debit_txn = relationship("Transaction", foreign_keys=[debit_txn_id], backref="transfer_links_as_debit")
    credit_txn = relationship("Transaction", foreign_keys=[credit_txn_id], backref="transfer_links_as_credit")

    __table_args__ = (
        UniqueConstraint("debit_txn_id", "credit_txn_id", name="uq_transfer_pair"),
        Index("idx_transfer_status", "status"),
    )


# ── Default categories to seed ───────────────────────────────────────────────
DEFAULT_CATEGORIES = [
    {"name": "Food & Dining",     "color": "#ef4444", "icon": "utensils"},
    {"name": "Transport",         "color": "#f97316", "icon": "car"},
    {"name": "Utilities",         "color": "#eab308", "icon": "zap"},
    {"name": "Shopping",          "color": "#84cc16", "icon": "shopping-bag"},
    {"name": "Investments",       "color": "#22c55e", "icon": "trending-up"},
    {"name": "Salary & Income",   "color": "#14b8a6", "icon": "wallet"},
    {"name": "EMI & Loans",       "color": "#06b6d4", "icon": "landmark"},
    {"name": "Entertainment",     "color": "#8b5cf6", "icon": "film"},
    {"name": "Health & Medical",  "color": "#ec4899", "icon": "heart-pulse"},
    {"name": "Insurance",         "color": "#6366f1", "icon": "shield"},
    {"name": "Transfers",         "color": "#64748b", "icon": "arrow-left-right"},
    {"name": "Subscriptions",     "color": "#a855f7", "icon": "repeat"},
    {"name": "Others",            "color": "#9ca3af", "icon": "circle-dot"},
]


def seed_default_categories(db):
    """Insert default categories if the table is empty."""
    existing = db.query(Category).count()
    if existing == 0:
        for cat_data in DEFAULT_CATEGORIES:
            db.add(Category(**cat_data, is_default=True))
        db.commit()
