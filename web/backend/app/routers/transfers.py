"""
Transfer-link endpoints: detect, review, confirm, deny, manual link, restore.
"""

from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Transaction, TransferLink, Category
from ..schemas import TransferLinkOut, ManualLinkRequest
from ..services.transfer_detector import detect_transfer_candidates

router = APIRouter(prefix="/api/transfers", tags=["transfers"])


def _get_transfers_category_id(db: Session) -> int | None:
    """Return the ID of the 'Transfers' category, or None if it doesn't exist."""
    cat = db.query(Category).filter(Category.name == "Transfers").first()
    return cat.id if cat else None


def _set_transfer_flags(db: Session, txn_ids: list[int], is_transfer: bool, auto_category: bool = False):
    """Set is_transfer on transactions. Optionally auto-assign 'Transfers' category."""
    txns = db.query(Transaction).filter(Transaction.id.in_(txn_ids)).all()
    transfers_cat_id = _get_transfers_category_id(db) if auto_category else None

    for txn in txns:
        txn.is_transfer = is_transfer
        if auto_category and is_transfer and transfers_cat_id and txn.category_id is None:
            txn.category_id = transfers_cat_id
        elif not is_transfer:
            # On unlink, clear to null so keyword-apply can re-categorize
            txn.category_id = None


# ── Detection ─────────────────────────────────────────────────────────────────

@router.post("/detect")
def run_detection(db: Session = Depends(get_db)):
    """Scan all transactions and create new transfer suggestions."""
    count = detect_transfer_candidates(db)
    return {"status": "ok", "new_suggestions": count}


# ── List suggestions / denied ─────────────────────────────────────────────────

@router.get("/suggestions", response_model=list[TransferLinkOut])
def list_suggestions(db: Session = Depends(get_db)):
    """Return all pending (suggested) transfer links."""
    links = (
        db.query(TransferLink)
        .filter(TransferLink.status == "suggested")
        .order_by(TransferLink.confidence.desc())
        .all()
    )
    return links


@router.get("/confirmed", response_model=list[TransferLinkOut])
def list_confirmed(db: Session = Depends(get_db)):
    """Return all confirmed transfer links."""
    links = (
        db.query(TransferLink)
        .filter(TransferLink.status == "confirmed")
        .order_by(TransferLink.confirmed_at.desc())
        .all()
    )
    return links


@router.get("/denied", response_model=list[TransferLinkOut])
def list_denied(db: Session = Depends(get_db)):
    """Return all denied transfer links (for recovery UI)."""
    links = (
        db.query(TransferLink)
        .filter(TransferLink.status == "denied")
        .order_by(TransferLink.created_at.desc())
        .all()
    )
    return links


@router.get("/count")
def transfer_counts(db: Session = Depends(get_db)):
    """Quick counts for badge display."""
    suggested = db.query(TransferLink).filter(TransferLink.status == "suggested").count()
    confirmed = db.query(TransferLink).filter(TransferLink.status == "confirmed").count()
    denied = db.query(TransferLink).filter(TransferLink.status == "denied").count()
    return {"suggested": suggested, "confirmed": confirmed, "denied": denied}


# ── Actions on individual links ──────────────────────────────────────────────

@router.post("/{link_id}/confirm")
def confirm_link(link_id: int, db: Session = Depends(get_db)):
    """Confirm a suggested transfer link."""
    link = db.query(TransferLink).get(link_id)
    if not link:
        raise HTTPException(404, "Transfer link not found")
    if link.status not in ("suggested", "denied"):
        raise HTTPException(400, f"Cannot confirm a link with status '{link.status}'")

    link.status = "confirmed"
    link.confirmed_at = datetime.datetime.utcnow()
    _set_transfer_flags(db, [link.debit_txn_id, link.credit_txn_id], True, auto_category=True)
    db.commit()
    return {"status": "ok"}


@router.post("/{link_id}/deny")
def deny_link(link_id: int, db: Session = Depends(get_db)):
    """Deny a suggested transfer link (hide it)."""
    link = db.query(TransferLink).get(link_id)
    if not link:
        raise HTTPException(404, "Transfer link not found")

    # If it was previously confirmed, undo the transfer flags
    if link.status == "confirmed":
        _set_transfer_flags(db, [link.debit_txn_id, link.credit_txn_id], False)

    link.status = "denied"
    db.commit()
    return {"status": "ok"}


@router.post("/{link_id}/restore")
def restore_link(link_id: int, db: Session = Depends(get_db)):
    """Restore a denied link back to suggested (misclick recovery)."""
    link = db.query(TransferLink).get(link_id)
    if not link:
        raise HTTPException(404, "Transfer link not found")
    if link.status != "denied":
        raise HTTPException(400, "Can only restore denied links")

    link.status = "suggested"
    db.commit()
    return {"status": "ok"}


@router.post("/{link_id}/unlink")
def unlink(link_id: int, db: Session = Depends(get_db)):
    """Remove a confirmed transfer link entirely."""
    link = db.query(TransferLink).get(link_id)
    if not link:
        raise HTTPException(404, "Transfer link not found")

    _set_transfer_flags(db, [link.debit_txn_id, link.credit_txn_id], False)
    db.delete(link)
    db.commit()
    return {"status": "ok"}


# ── Manual linking ────────────────────────────────────────────────────────────

@router.post("/link", response_model=TransferLinkOut)
def manual_link(body: ManualLinkRequest, db: Session = Depends(get_db)):
    """Manually link two transactions as a transfer pair."""
    debit_txn = db.query(Transaction).get(body.debit_txn_id)
    credit_txn = db.query(Transaction).get(body.credit_txn_id)
    if not debit_txn or not credit_txn:
        raise HTTPException(404, "One or both transactions not found")

    # Check if already linked
    existing = db.query(TransferLink).filter(
        or_(
            (TransferLink.debit_txn_id == body.debit_txn_id) & (TransferLink.credit_txn_id == body.credit_txn_id),
            (TransferLink.debit_txn_id == body.credit_txn_id) & (TransferLink.credit_txn_id == body.debit_txn_id),
        )
    ).first()
    if existing:
        raise HTTPException(400, "These transactions are already linked")

    link = TransferLink(
        debit_txn_id=body.debit_txn_id,
        credit_txn_id=body.credit_txn_id,
        status="confirmed",
        confidence=1.0,
        confirmed_at=datetime.datetime.utcnow(),
    )
    db.add(link)
    _set_transfer_flags(db, [body.debit_txn_id, body.credit_txn_id], True, auto_category=True)
    db.commit()
    db.refresh(link)
    return link
