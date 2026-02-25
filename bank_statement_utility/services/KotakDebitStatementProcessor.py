from datetime import datetime
from decimal import Decimal

from .BankStatementInterface import BankStatementInterface
from .Utils import remove_comma
from ..Constants import COMMA
from ..config import config
from ..model.StatementDB import StatementDB
from ..parser.DelimitedParserWithHeader import DelimitedParserWithHeader


class KotakDebitStatementProcessor(BankStatementInterface):

    def __init__(self, filepath, source):
        self.name = "KOTAK"
        self.source = source
        self.filepath = filepath
        skip_data_col = int(config[self.name]['skip_data_column_no']) - 1
        self.parser = DelimitedParserWithHeader(filepath, COMMA, config[self.name]['record_starts_with'],
                                                config[self.name]['record_ends_with'], skip_data_col)

    def get_record(self):
        value_dict = self.parser.get_next_data()

        if value_dict == -1:
            # Reached end so closing file
            self.parser.close()
            return -1
        return value_dict

    @staticmethod
    def _get(value_dict, *keys):
        """Return the value for the first key found in value_dict."""
        for k in keys:
            if k in value_dict:
                return value_dict[k]
        raise KeyError(f"None of {keys} found in record keys: {list(value_dict.keys())}")

    def map_record(self, value_dict):
        # Resolve common column names
        balance_raw  = self._get(value_dict, 'Balance', 'Balance (INR)', 'Closing Balance')
        txn_date_raw = self._get(value_dict, 'Transaction Date', 'Txn Date', 'Date')
        val_date_raw = self._get(value_dict, 'Value Date', 'Value Dt', 'Value_Date')
        desc_raw     = self._get(value_dict, 'Description', 'Narration', 'Remarks', 'Transaction Remarks')
        ref_raw      = self._get(value_dict, 'Chq / Ref No.', 'Chq/Ref No.', 'Ref No.', 'Cheque No.', 'Reference No.')

        # Two CSV formats Kotak issues:
        #  New: single "Amount" column + "Dr / Cr" indicator (e.g. DR / CR)
        #  Old: separate "Debit" and "Credit" columns
        if 'Amount' in value_dict:
            raw_amount = remove_comma(value_dict['Amount']) or '0'
            dr_cr = value_dict.get('Dr / Cr', '').strip().upper()
            # Handles: 'DR', 'Dr', 'D', 'DEBIT', 'Debit' etc.
            if dr_cr.startswith('D'):
                debit_amount = round(float(raw_amount), 2) if raw_amount else None
                credit_amount = None
            else:
                debit_amount = None
                credit_amount = round(float(raw_amount), 2) if raw_amount else None
        else:
            debit_raw  = self._get(value_dict, 'Debit',  'Withdrawal Amt.(INR )', 'Withdrawal Amount')
            credit_raw = self._get(value_dict, 'Credit', 'Deposit Amt.(INR )',    'Deposit Amount')
            if debit_raw and Decimal(remove_comma(debit_raw)) > 0.00:
                debit_amount = round(float(remove_comma(debit_raw)), 2)
                credit_amount = None
            else:
                debit_amount = None
                credit_amount = round(float(remove_comma(credit_raw)), 2)

        # format Closing Balance
        closing_balance = round(float(remove_comma(balance_raw)), 2)

        # Date formatting — try several common formats
        _DATE_FMTS = ['%d-%m-%Y', '%d/%m/%Y', '%d-%m-%Y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d']
        trans_date = None
        for fmt in _DATE_FMTS:
            try:
                trans_date = datetime.strptime(txn_date_raw.strip(), fmt)
                break
            except ValueError:
                continue
        if trans_date is None:
            raise ValueError(f"Cannot parse transaction date '{txn_date_raw}' with any known format")

        value_date = None
        for fmt in _DATE_FMTS:
            try:
                value_date = datetime.strptime(val_date_raw.strip(), fmt)
                break
            except ValueError:
                continue
        if value_date is None:
            raise ValueError(f"Cannot parse value date '{val_date_raw}' with any known format")

        record = StatementDB(
            self.name,
            self.source,
            trans_date,
            desc_raw,
            debit_amount,
            credit_amount,
            ref_raw,
            closing_balance,
            value_date,
            None
        )

        return record
