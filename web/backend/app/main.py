
"""
FastAPI application entry point.
"""

import os
from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, SessionLocal
from .models import seed_default_categories
from .routers import upload, transactions, categories, tags, keywords, analytics, transfers, auth, export


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables and seed defaults
    init_db()
    db = SessionLocal()
    try:
        seed_default_categories(db)
    finally:
        db.close()
    yield
    # Shutdown: nothing to clean up for SQLite


app = FastAPI(
    title="Bank Statement Expense Analyzer",
    version="1.0.0",
    description="Upload bank statements, categorize expenses, and visualize spending habits.",
    lifespan=lifespan,
)

# CORS — open for self-hosting; restrict ALLOWED_ORIGINS in .env for stricter setups
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(tags.router)
app.include_router(keywords.router)
app.include_router(analytics.router)
app.include_router(transfers.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
