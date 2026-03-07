"""
SQLite database setup for the web app.
Uses SQLAlchemy with a local SQLite file stored alongside the backend.
"""

import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "bank_statements.db")

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables if they don't exist, and apply lightweight migrations."""
    Base.metadata.create_all(bind=engine)
    _apply_migrations()


def _apply_migrations():
    """Add columns/indexes that create_all won't add to existing tables."""
    insp = inspect(engine)

    # Migration: add is_transfer column to transactions
    if "transactions" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("transactions")}
        if "is_transfer" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE transactions ADD COLUMN is_transfer BOOLEAN NOT NULL DEFAULT 0"
                ))

    # Migration: add user_id columns for multi-user support
    if "upload_sessions" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("upload_sessions")}
        if "user_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE upload_sessions ADD COLUMN user_id INTEGER REFERENCES users(id)"
                ))

    if "transactions" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("transactions")}
        if "user_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(id)"
                ))


def assign_orphan_data_to_user(user_id: int):
    """Assign any existing data with no user_id to the given user (first-user migration)."""
    with engine.begin() as conn:
        conn.execute(text(
            "UPDATE upload_sessions SET user_id = :uid WHERE user_id IS NULL"
        ), {"uid": user_id})
        conn.execute(text(
            "UPDATE transactions SET user_id = :uid WHERE user_id IS NULL"
        ), {"uid": user_id})
