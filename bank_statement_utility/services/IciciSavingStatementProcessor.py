from datetime import datetime

from .BankStatementInterface import BankStatementInterface
from .Utils import remove_comma
from ..model.StatementDB import StatementDB
from ..parser.XlsParserWithHeader import XlsParserWithHeader


class IciciSavingStatementProcessor(BankStatementInterface):
    """
    Processor for ICICI Savings account XLS statements.

    Expected XLS layout (1-indexed):
      Row 13 : Header row
      Row 14+: Data rows
    Columns : S No., Value Date, Transaction Date, Cheque Number,
              Transaction Remarks, Withdrawal Amount (INR ),
              Deposit Amount (INR ), Balance (INR )
    Date fmt: DD/MM/YYYY  (the parser auto-strips commas from cell values)
    """

    def __init__(self, filepath, source):
        super().__init__()
        self.name = "ICICI"
        self.source = source
        self.filepath = filepath
        # XlsParserWithHeader: record_start_with is 1-indexed, reads header
        # from that row and data from the next.
        self.parser = XlsParserWithHeader(filepath, 0, "13")

    def get_record(self):
        value_dict = self.parser.get_next_data()
        if value_dict == -1:
            self.parser.close()
            return -1
        return value_dict

    def map_record(self, value_dict):
        # ── Parse date ─────────────────────────────────────────────────────
        raw_date = str(value_dict.get("Transaction Date", "")).strip()
        # ICICI uses DD/MM/YYYY but some exports use DD,MM,YYYY (commas)
        # Normalise commas → slashes, then parse
        normalised = raw_date.replace(",", "/")
        trans_date = datetime.strptime(normalised, "%d/%m/%Y")

        raw_value_date = str(value_dict.get("Value Date", "")).strip()
        normalised_vd = raw_value_date.replace(",", "/")
        try:
            value_date = datetime.strptime(normalised_vd, "%d/%m/%Y")
        except (ValueError, TypeError):
            value_date = trans_date

        # ── Amounts ────────────────────────────────────────────────────────
        raw_debit = value_dict.get("Withdrawal Amount (INR )", None)
        raw_credit = value_dict.get("Deposit Amount (INR )", None)

        debit_amount = None
        credit_amount = None

        if raw_debit is not None and str(raw_debit).strip():
            try:
                debit_amount = abs(float(remove_comma(str(raw_debit))))
                if debit_amount == 0:
                    debit_amount = None
            except (ValueError, TypeError):
                pass

        if raw_credit is not None and str(raw_credit).strip():
            try:
                credit_amount = abs(float(remove_comma(str(raw_credit))))
                if credit_amount == 0:
                    credit_amount = None
            except (ValueError, TypeError):
                pass

        # ── Balance ────────────────────────────────────────────────────────
        raw_balance = value_dict.get("Balance (INR )", 0)
        try:
            closing_balance = float(remove_comma(str(raw_balance)))
        except (ValueError, TypeError):
            closing_balance = 0.0

        # ── Description & ref ──────────────────────────────────────────────
        description = str(value_dict.get("Transaction Remarks", "")).strip()
        cheque_no = str(value_dict.get("Cheque Number", "")).strip() or None

        return StatementDB(
            self.name,
            self.source,
            trans_date,
            description,
            debit_amount,
            credit_amount,
            cheque_no,
            closing_balance,
            value_date,
            None,
        )
