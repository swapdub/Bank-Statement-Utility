
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

# CORS — allow the React dev server
# Accept FRONTEND_PORTS as comma-separated ports (e.g. "5173,3000") or full URLs
frontend_ports = os.getenv("FRONTEND_PORTS", "5173").split(",")
frontend_ports = [p.strip() for p in frontend_ports if p.strip()]
allowed_origins = set()
for p in frontend_ports:
    if p.isdigit():
        allowed_origins.add(f"http://localhost:{p}")
        allowed_origins.add(f"http://127.0.0.1:{p}")
    elif p.startswith("http://") or p.startswith("https://"):
        allowed_origins.add(p)
    else:
        # fallback: treat as port
        allowed_origins.add(f"http://localhost:{p}")
        allowed_origins.add(f"http://127.0.0.1:{p}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins),
    allow_credentials=True,
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
