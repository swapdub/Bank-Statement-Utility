"""
Category CRUD and keyword-to-category assignment.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Category, Keyword, Transaction
from ..schemas import CategoryCreate, CategoryUpdate, CategoryOut

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    cats = db.query(Category).order_by(Category.name).all()
    result = []
    for c in cats:
        kw_count = db.query(Keyword).filter(Keyword.category_id == c.id).count()
        txn_count = db.query(Transaction).filter(Transaction.category_id == c.id).count()
        out = CategoryOut.model_validate(c)
        out.keyword_count = kw_count
        out.transaction_count = txn_count
        result.append(out)
    return result


@router.post("/", response_model=CategoryOut)
def create_category(body: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(Category).filter(Category.name == body.name).first()
    if existing:
        raise HTTPException(400, f"Category '{body.name}' already exists")
    cat = Category(name=body.name, color=body.color, icon=body.icon)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(Category).get(category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    if body.name is not None:
        cat.name = body.name
    if body.color is not None:
        cat.color = body.color
    if body.icon is not None:
        cat.icon = body.icon
    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).get(category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    # Unlink keywords and transactions before deleting
    db.query(Keyword).filter(Keyword.category_id == category_id).update({"category_id": None})
    db.query(Transaction).filter(Transaction.category_id == category_id).update({"category_id": None})
    db.delete(cat)
    db.commit()
    return {"status": "deleted"}
