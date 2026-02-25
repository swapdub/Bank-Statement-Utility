"""
FastAPI application entry point.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, SessionLocal
from .models import seed_default_categories
from .routers import upload, transactions, categories, tags, keywords, analytics


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

# CORS — allow the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(upload.router)
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(tags.router)
app.include_router(keywords.router)
app.include_router(analytics.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
