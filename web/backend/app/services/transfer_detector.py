"""
Auto-detection of transfer pairs between accounts.

Scoring weights:
  - Amount match:       0.40  (debit on one side ≈ credit on other)
  - Date proximity:     0.25  (0–3 days apart)
  - Cross-account:      0.15  (different bank or account type)
  - Description hints:  0.20  (keywords like NEFT, IMPS, transfer, etc.)

Threshold: score ≥ 0.80 → create suggestion.  Never auto-confirm.
"""

from __future__ import annotations

import re
import datetime
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Transaction, TransferLink

# ── Keywords that hint at inter-account transfers ─────────────────────────────
_TRANSFER_PATTERNS = re.compile(
    r"(?i)\b("
    r"neft|rtgs|imps|upi|transfer|trf|sweep|fund\s*transfer|"
    r"cc\s*payment|credit\s*card\s*payment|bill\s*pay(?:ment)?|"
    r"self|own\s*a/?c|a/?c\s*transfer|int(?:ernet)?\s*bank"
    r")\b"
)

# Amount tolerance: 0.5% or ₹1, whichever is larger
_AMOUNT_TOLERANCE_PCT = 0.005
_AMOUNT_TOLERANCE_ABS = 1.0


def _amounts_match(debit: float, credit: float) -> bool:
    tol = max(debit * _AMOUNT_TOLERANCE_PCT, _AMOUNT_TOLERANCE_ABS)
    return abs(debit - credit) <= tol


def _score_pair(debit_txn: Transaction, credit_txn: Transaction) -> float:
    """Return a confidence score in [0, 1] for this pair."""
    score = 0.0

    # 1. Amount match (0.40)
    d_amt = debit_txn.debit_amount or 0.0
    c_amt = credit_txn.credit_amount or 0.0
    if d_amt > 0 and c_amt > 0 and _amounts_match(d_amt, c_amt):
        score += 0.40

    # 2. Date proximity (0.25) — 0 days = full, 1 day = 0.20, 2 = 0.15, 3 = 0.10
    day_diff = abs((debit_txn.transaction_date - credit_txn.transaction_date).days)
    if day_diff == 0:
        score += 0.25
    elif day_diff == 1:
        score += 0.20
    elif day_diff == 2:
        score += 0.15
    elif day_diff == 3:
        score += 0.10

    # 3. Cross-account (0.15)
    diff_bank = debit_txn.bank_name != credit_txn.bank_name
    diff_acct = debit_txn.account_type != credit_txn.account_type
    if diff_bank or diff_acct:
        score += 0.15

    # 4. Description hints (0.20) — match on EITHER side
    desc_combined = f"{debit_txn.description} {credit_txn.description}"
    if _TRANSFER_PATTERNS.search(desc_combined):
        score += 0.20

    return score


def detect_transfer_candidates(db: Session) -> int:
    """
    Scan all transactions and create TransferLink suggestions for likely pairs.
    Returns the number of new suggestions created.
    """
    # Get existing link pairs (any status) to skip
    existing_pairs: set[tuple[int, int]] = set()
    for link in db.query(TransferLink).all():
        pair = (min(link.debit_txn_id, link.credit_txn_id),
                max(link.debit_txn_id, link.credit_txn_id))
        existing_pairs.add(pair)

    # Fetch all debit transactions (debit_amount > 0) and credit transactions (credit_amount > 0)
    debit_txns = (
        db.query(Transaction)
        .filter(Transaction.debit_amount > 0)
        .order_by(Transaction.transaction_date)
        .all()
    )
    credit_txns = (
        db.query(Transaction)
        .filter(Transaction.credit_amount > 0)
        .order_by(Transaction.transaction_date)
        .all()
    )

    # Build lookup by approximate amount for credit txns (bucket by rounded amount)
    from collections import defaultdict
    credit_by_amount: dict[int, list[Transaction]] = defaultdict(list)
    for ct in credit_txns:
        # Round to nearest integer for bucketing
        bucket = round(ct.credit_amount or 0)
        credit_by_amount[bucket].append(ct)

    new_count = 0
    already_matched_credits: set[int] = set()  # each credit txn can only match once

    for dt in debit_txns:
        d_amt = dt.debit_amount or 0
        if d_amt <= 0:
            continue

        bucket = round(d_amt)
        # Check nearby buckets (±1 for rounding)
        candidates = []
        for b in [bucket - 1, bucket, bucket + 1]:
            candidates.extend(credit_by_amount.get(b, []))

        best_score = 0.0
        best_credit = None

        for ct in candidates:
            if ct.id == dt.id:
                continue
            if ct.id in already_matched_credits:
                continue
            pair_key = (min(dt.id, ct.id), max(dt.id, ct.id))
            if pair_key in existing_pairs:
                continue
            if not _amounts_match(d_amt, ct.credit_amount or 0):
                continue

            score = _score_pair(dt, ct)
            if score > best_score:
                best_score = score
                best_credit = ct

        if best_credit and best_score >= 0.80:
            link = TransferLink(
                debit_txn_id=dt.id,
                credit_txn_id=best_credit.id,
                status="suggested",
                confidence=round(best_score, 3),
            )
            db.add(link)
            pair_key = (min(dt.id, best_credit.id), max(dt.id, best_credit.id))
            existing_pairs.add(pair_key)
            already_matched_credits.add(best_credit.id)
            new_count += 1

    db.commit()
    return new_count
