"""
Tag CRUD endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Tag
from ..schemas import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).order_by(Tag.name).all()


@router.post("/", response_model=TagOut)
def create_tag(body: TagCreate, db: Session = Depends(get_db)):
    existing = db.query(Tag).filter(Tag.name == body.name).first()
    if existing:
        raise HTTPException(400, f"Tag '{body.name}' already exists")
    tag = Tag(name=body.name, color=body.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return TagOut.model_validate(tag)


@router.put("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, body: TagUpdate, db: Session = Depends(get_db)):
    tag = db.query(Tag).get(tag_id)
    if not tag:
        raise HTTPException(404, "Tag not found")
    if body.name is not None:
        existing = db.query(Tag).filter(Tag.name == body.name, Tag.id != tag_id).first()
        if existing:
            raise HTTPException(400, f"Tag '{body.name}' already exists")
        tag.name = body.name
    if body.color is not None:
        tag.color = body.color
    db.commit()
    db.refresh(tag)
    return TagOut.model_validate(tag)


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).get(tag_id)
    if not tag:
        raise HTTPException(404, "Tag not found")
    db.delete(tag)
    db.commit()
    return {"status": "deleted"}
