"""
Upload & parse bank statement files.
"""

from __future__ import annotations

import os
import shutil
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import UploadSession, Transaction, Keyword, keyword_tags
from ..schemas import UploadResponse, SupportedFormatsResponse, BankInfo
from ..services.parser_bridge import parse_statement, SUPPORTED_BANKS
from ..services.keyword_extractor import extract_keywords

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.get("/supported-formats", response_model=SupportedFormatsResponse)
def get_supported_formats():
    """Return the list of supported banks, account types, and file formats."""
    return SupportedFormatsResponse(
        banks=[BankInfo(**b) for b in SUPPORTED_BANKS]
    )


@router.post("/", response_model=UploadResponse)
def upload_statement(
    file: UploadFile = File(...),
    bank_name: str = Form(...),
    account_type: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Upload a bank statement file, parse it, store transactions, and extract keywords.
    """
    # Validate bank / account type
    valid_bank = next((b for b in SUPPORTED_BANKS if b["name"] == bank_name.upper()), None)
    if not valid_bank:
        raise HTTPException(400, f"Unsupported bank: {bank_name}")
    if account_type.capitalize() not in [a["type"] for a in valid_bank["account_types"]]:
        raise HTTPException(400, f"Unsupported account type '{account_type}' for {bank_name}")

    # Save uploaded file to a temp location
    suffix = os.path.splitext(file.filename or "")[1]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()

        # Parse using the bridge
        result = parse_statement(bank_name.upper(), account_type.capitalize(), tmp.name)
    finally:
        os.unlink(tmp.name)

    if result["error"]:
        raise HTTPException(400, result["error"])

    # ── Duplicate detection ───────────────────────────────────────────────────
    # Build a set of fingerprints from existing transactions for this bank
    existing_rows = db.query(
        Transaction.bank_name,
        Transaction.account_type,
        Transaction.transaction_date,
        Transaction.description,
        Transaction.debit_amount,
        Transaction.credit_amount,
    ).filter(
        Transaction.bank_name == bank_name.upper(),
        Transaction.account_type == account_type.capitalize(),
    ).all()

    existing_fps: set[tuple] = {
        (r.bank_name, r.account_type, str(r.transaction_date), r.description, r.debit_amount, r.credit_amount)
        for r in existing_rows
    }

    def _fp(rec: dict) -> tuple:
        return (
            rec["bank_name"].upper(),
            rec["account_type"].capitalize(),
            str(rec["transaction_date"]),
            rec["description"],
            rec["debit_amount"],
            rec["credit_amount"],
        )

    new_records: list[dict] = []
    duplicate_count = 0
    for rec in result["records"]:
        fp = _fp(rec)
        if fp in existing_fps:
            duplicate_count += 1
        else:
            new_records.append(rec)
            existing_fps.add(fp)  # prevent intra-file duplicates too

    # Create upload session
    session = UploadSession(
        filename=file.filename or "unknown",
        bank_name=bank_name.upper(),
        account_type=account_type.capitalize(),
        record_count=len(new_records),
        status="success" if not result["failed_records"] else "partial",
        error_message="; ".join(result["failed_records"][:5]) if result["failed_records"] else None,
    )
    db.add(session)
    db.flush()  # get session.id

    # Insert transactions
    for rec in new_records:
        txn = Transaction(
            upload_session_id=session.id,
            bank_name=rec["bank_name"],
            account_type=rec["account_type"],
            transaction_date=rec["transaction_date"],
            description=rec["description"],
            debit_amount=rec["debit_amount"],
            credit_amount=rec["credit_amount"],
            cheque_ref_number=rec["cheque_ref_number"],
            closing_balance=rec["closing_balance"],
            value_date=rec["value_date"],
        )
        db.add(txn)

    db.commit()

    # Extract keywords from the new transactions and merge into DB
    descriptions = [r["description"] for r in new_records]
    new_keywords = extract_keywords(descriptions, min_frequency=1)

    for kw_data in new_keywords:
        existing = db.query(Keyword).filter(Keyword.keyword == kw_data["keyword"]).first()
        if existing:
            # Recount frequency across ALL transactions
            pass  # will be updated in bulk below
        else:
            db.add(Keyword(keyword=kw_data["keyword"], frequency=kw_data["frequency"]))

    db.commit()

    # Recount keyword frequencies across the full transaction set
    _recount_keyword_frequencies(db)

    # Dedupe error messages for the response
    unique_errors = list(dict.fromkeys(result["failed_records"]))[:5]

    # Build human-readable message
    msg_parts = [f"Imported {len(new_records)} transaction{'s' if len(new_records) != 1 else ''}"]
    if duplicate_count:
        msg_parts.append(f"{duplicate_count} duplicate{'s' if duplicate_count != 1 else ''} skipped")
    if result["failed_records"]:
        msg_parts.append(f"{len(result['failed_records'])} failed to parse")
    message = msg_parts[0] + (" (" + ", ".join(msg_parts[1:]) + ")" if msg_parts[1:] else "")

    return UploadResponse(
        session_id=session.id,
        filename=session.filename,
        bank_name=session.bank_name,
        account_type=session.account_type,
        record_count=len(new_records),
        failed_count=len(result["failed_records"]),
        duplicate_count=duplicate_count,
        status=session.status,
        message=message,
        error_details=unique_errors if unique_errors else None,
    )


def _recount_keyword_frequencies(db: Session):
    """
    Recount keyword frequencies across ALL transaction descriptions.
    This is called after each upload to keep frequencies accurate.
    """
    all_descriptions = [d for (d,) in db.query(Transaction.description).all()]
    fresh = extract_keywords(all_descriptions, min_frequency=1)
    freq_map = {kw["keyword"]: kw["frequency"] for kw in fresh}

    for keyword_obj in db.query(Keyword).all():
        new_freq = freq_map.get(keyword_obj.keyword, 0)
        if keyword_obj.frequency != new_freq:
            keyword_obj.frequency = new_freq

    db.commit()
