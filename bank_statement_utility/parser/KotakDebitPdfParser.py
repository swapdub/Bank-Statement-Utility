"""
PDF parser for Kotak Bank Savings / Current account statements.

Expected table layout (columns as they appear in the PDF):
    #  |  Date  |  Description  |  Chq/Ref. No.  |  Withdrawal (Dr.)  |  Deposit (Cr.)  |  Balance

Date format: DD MMM YYYY (e.g. "15 Jul 2024")

Strategy
--------
pypdf text extraction does not preserve blank table cells, so a row with
no withdrawal becomes:  <date> <desc> <ref> <deposit>  <balance>   (2 amounts)
and a row with no deposit becomes: <date> <desc> <ref> <withdrawal> <balance> (2 amounts)

To distinguish withdrawals from deposits when only one amount is present,
we use balance progression: if the balance rose, the amount is a deposit;
if it fell, it is a withdrawal.

When a row contains 3 amounts (rare; both columns populated or balance
rolls over mid-row), the order withdrawal → deposit → balance is assumed.
"""

import re

from pypdf import PdfReader

from .IParser import IParser
from ..logger import log

# -------------------------------------------------------------------
_MONTHS = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
_DATE_PAT = re.compile(rf"\b(\d{{1,2}}\s+{_MONTHS}\s+\d{{4}})\b")
# Amount: optional leading sign, digits-with-commas, mandatory decimal part
_AMOUNT_PAT = re.compile(r"\b([\d,]+\.\d{2})\b")


def _to_float(s: str) -> float:
    """Remove commas and return float; raise on empty / non-numeric."""
    return float(s.replace(",", ""))


class KotakDebitPdfParser(IParser):
    """Self-contained PDF parser for Kotak Savings / Current statements."""

    def __init__(self, filename: str):
        self._records: list[dict] = []
        self._index = 0

        reader = PdfReader(filename)
        pages_text = [page.extract_text() or "" for page in reader.pages]
        reader.stream.close()

        self._parse("\n".join(pages_text))
        self._infer_debit_credit()

        if not self._records:
            log.warning(
                "KotakDebitPdfParser: no records parsed. "
                "Check that the PDF is a Kotak Savings account statement and "
                "that pypdf can extract its text (scanned/image PDFs are not supported)."
            )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _parse(self, text: str) -> None:
        """
        Walk lines; when a date is found accumulate text until the next
        date (or blank gap), then hand the chunk to _extract_row().
        """
        lines = [ln.strip() for ln in text.splitlines()]
        i = 0
        while i < len(lines):
            line = lines[i]
            dm = _DATE_PAT.search(line)
            if dm:
                row_text = line
                j = i + 1
                # Consume continuation lines until the next date starts
                while j < len(lines):
                    nxt = lines[j]
                    if not nxt:              # blank separator → end of row
                        j += 1
                        break
                    if _DATE_PAT.search(nxt):  # next transaction row
                        break
                    row_text += " " + nxt
                    j += 1
                    # Stop early once we have ≥ 2 amounts (enough for parsing)
                    if len(_AMOUNT_PAT.findall(row_text)) >= 2:
                        break

                rec = self._extract_row(row_text)
                if rec is not None:
                    self._records.append(rec)
                i = j
            else:
                i += 1

    def _extract_row(self, row_text: str) -> dict | None:
        """
        Extract fields from a single (possibly multi-line-merged) row string.

        Returns a dict with keys:
            Date, Description, Chq/Ref. No.,
            Withdrawal (Dr.), Deposit (Cr.), Balance
        or None if the row cannot be parsed.
        """
        dm = _DATE_PAT.search(row_text)
        if not dm:
            return None

        date_str = dm.group(1)
        amounts = _AMOUNT_PAT.findall(row_text)

        if len(amounts) < 2:
            log.debug("KotakDebitPdfParser: skipping row with < 2 amounts: %r", row_text)
            return None

        balance = amounts[-1]

        # Everything between end-of-date and before the first amount
        # is description + ref number.
        after_date = row_text[dm.end():].strip()
        # Strip trailing amounts right-to-left
        tail = after_date
        for amt in reversed(amounts):
            idx = tail.rfind(amt)
            if idx != -1:
                tail = tail[:idx].strip()

        # Last whitespace-delimited token in tail → ref number
        tail_parts = tail.rsplit(None, 1)
        if len(tail_parts) == 2:
            description, ref_no = tail_parts
        else:
            description = tail_parts[0] if tail_parts else ""
            ref_no = ""

        # Amounts: may be 2 (one column blank) or 3 (both + balance)
        raw_withdrawal = ""
        raw_deposit = ""
        if len(amounts) >= 3:
            raw_withdrawal = amounts[-3]
            raw_deposit = amounts[-2]
            # Balance is amounts[-1] (already set)
        else:
            # Ambiguous — resolved later by _infer_debit_credit()
            raw_withdrawal = "__UNKNOWN__"
            raw_deposit = "__UNKNOWN__"
            return {
                "Date": date_str,
                "Description": description.strip(),
                "Chq/Ref. No.": ref_no.strip(),
                "_raw_amount": amounts[-2],  # the non-balance amount
                "Withdrawal (Dr.)": "",
                "Deposit (Cr.)": "",
                "Balance": balance,
            }

        return {
            "Date": date_str,
            "Description": description.strip(),
            "Chq/Ref. No.": ref_no.strip(),
            "Withdrawal (Dr.)": raw_withdrawal,
            "Deposit (Cr.)": raw_deposit,
            "Balance": balance,
        }

    def _infer_debit_credit(self) -> None:
        """
        For rows where we could not determine debit vs credit (2-amount case),
        use consecutive balance differences to resolve.
        """
        prev_balance: float | None = None

        for i, rec in enumerate(self._records):
            if "_raw_amount" not in rec:
                # 3-amount row already resolved; just update prev_balance
                try:
                    prev_balance = _to_float(rec["Balance"])
                except (ValueError, KeyError):
                    pass
                continue

            raw = rec.pop("_raw_amount")
            try:
                curr_balance = _to_float(rec["Balance"])
                raw_float = _to_float(raw)
            except ValueError:
                # Can't parse; default to withdrawal
                rec["Withdrawal (Dr.)"] = raw
                rec["Deposit (Cr.)"] = ""
                prev_balance = None
                continue

            if prev_balance is None:
                # First record — can't use balance diff; default to withdrawal.
                # If this is wrong for your statement, the net spending total
                # will be off but individual rows are otherwise correct.
                log.debug(
                    "KotakDebitPdfParser: first record ambiguous; defaulting to withdrawal: %r",
                    rec,
                )
                rec["Withdrawal (Dr.)"] = raw
                rec["Deposit (Cr.)"] = ""
            else:
                diff = curr_balance - prev_balance
                # diff ≈ +raw  → deposit; diff ≈ -raw → withdrawal
                if abs(diff - raw_float) < 1.0:   # balance rose ≈ raw
                    rec["Withdrawal (Dr.)"] = ""
                    rec["Deposit (Cr.)"] = raw
                elif abs(diff + raw_float) < 1.0:  # balance fell ≈ raw
                    rec["Withdrawal (Dr.)"] = raw
                    rec["Deposit (Cr.)"] = ""
                else:
                    # Rounding or fees don't add up exactly; use diff sign
                    if diff > 0:
                        rec["Withdrawal (Dr.)"] = ""
                        rec["Deposit (Cr.)"] = raw
                    else:
                        rec["Withdrawal (Dr.)"] = raw
                        rec["Deposit (Cr.)"] = ""

            prev_balance = curr_balance

    # ------------------------------------------------------------------
    # IParser interface
    # ------------------------------------------------------------------

    def get_next_data(self) -> dict | int:
        if self._index >= len(self._records):
            return -1
        rec = self._records[self._index]
        self._index += 1
        return rec

    def close(self) -> None:
        pass  # no open file handle (closed after reading in __init__)
