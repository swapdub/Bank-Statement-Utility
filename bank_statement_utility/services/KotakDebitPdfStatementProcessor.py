"""
Processor for Kotak Bank Savings / Current account statements in PDF format.

Expected column layout in the PDF:
    #  |  Date  |  Description  |  Chq/Ref. No.  |  Withdrawal (Dr.)  |  Deposit (Cr.)  |  Balance

Date format supplied to map_record: "DD MMM YYYY"  (e.g. "15 Jul 2024")
"""

from datetime import datetime

from .BankStatementInterface import BankStatementInterface
from .Utils import remove_comma
from ..model.StatementDB import StatementDB
from ..parser.KotakDebitPdfParser import KotakDebitPdfParser


class KotakDebitPdfStatementProcessor(BankStatementInterface):

    def __init__(self, filepath: str, source: str):
        self.name = "KOTAK"
        self.source = source
        self.filepath = filepath
        self.parser = KotakDebitPdfParser(filepath)

    def get_record(self):
        value_dict = self.parser.get_next_data()
        if value_dict == -1:
            self.parser.close()
            return -1
        return value_dict

    def map_record(self, value_dict: dict):
        def _parse(s: str) -> float | None:
            s = remove_comma(s.strip())
            if not s:
                return None
            try:
                return round(float(s), 2)
            except ValueError:
                return None

        withdrawal = _parse(value_dict.get("Withdrawal (Dr.)", ""))
        deposit    = _parse(value_dict.get("Deposit (Cr.)",    ""))
        balance    = _parse(value_dict.get("Balance",           "")) or 0.0

        try:
            trans_date = datetime.strptime(value_dict["Date"].strip(), "%d %b %Y")
        except ValueError as exc:
            raise ValueError(
                f"Cannot parse date '{value_dict['Date']}' — expected format DD MMM YYYY "
                f"(e.g. '15 Jul 2024')"
            ) from exc

        description = value_dict.get("Description", "").strip()
        ref_no      = value_dict.get("Chq/Ref. No.", "").strip()

        record = StatementDB(
            self.name,
            self.source,
            trans_date,
            description,
            withdrawal,   # debit_amount
            deposit,      # credit_amount
            ref_no,
            balance,
            trans_date,   # value_date (same as trans_date; PDF doesn't carry separate value date)
            None,
        )
        return record
