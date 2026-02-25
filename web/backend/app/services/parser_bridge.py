"""
Bridge between the existing bank_statement_utility parsers and the web app.

This module reuses the parser + processor classes from the parent project
without touching Cassandra. It imports processor modules directly via importlib
to avoid the bank_statement_utility/__init__.py import chain (which pulls in
Cassandra, tkinter, etc.).
"""

from __future__ import annotations

import importlib
import importlib.util
import os
import sys
from datetime import date, datetime
from typing import Any

import logging

log = logging.getLogger(__name__)

# Ensure the repo root is on the Python path
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)


def _import_module_directly(module_path: str, module_name: str):
    """Import a Python module by file path, bypassing package __init__.py."""
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {module_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


# ── Pre-load required utility / config modules ───────────────────────────────
# These are needed by the processor classes but we must load them
# without triggering the top-level __init__.py import chain.

_PKG = os.path.join(_REPO_ROOT, "bank_statement_utility")

def _ensure_supporting_modules():
    """Load supporting modules that the processors depend on."""
    modules_to_load = [
        ("bank_statement_utility.Constants", os.path.join(_PKG, "Constants.py")),
        ("bank_statement_utility.logger", os.path.join(_PKG, "logger.py")),
        ("bank_statement_utility.config_writer", os.path.join(_PKG, "config_writer.py")),
        ("bank_statement_utility.config", os.path.join(_PKG, "config.py")),
        ("bank_statement_utility.version", os.path.join(_PKG, "version.py")),
        ("bank_statement_utility.model", os.path.join(_PKG, "model", "__init__.py")),
        ("bank_statement_utility.model.StatementDB", os.path.join(_PKG, "model", "StatementDB.py")),
        ("bank_statement_utility.services", os.path.join(_PKG, "services", "__init__.py")),
        ("bank_statement_utility.services.Utils", os.path.join(_PKG, "services", "Utils.py")),
        ("bank_statement_utility.services.BankStatementInterface", os.path.join(_PKG, "services", "BankStatementInterface.py")),
        ("bank_statement_utility.parser", os.path.join(_PKG, "parser", "__init__.py")),
        ("bank_statement_utility.parser.IParser", os.path.join(_PKG, "parser", "IParser.py")),
        ("bank_statement_utility.parser.DelimitedParserWithHeader", os.path.join(_PKG, "parser", "DelimitedParserWithHeader.py")),
        ("bank_statement_utility.parser.PdfParserWithCustomHeader", os.path.join(_PKG, "parser", "PdfParserWithCustomHeader.py")),
        ("bank_statement_utility.parser.SbiCustomPdfParser", os.path.join(_PKG, "parser", "SbiCustomPdfParser.py")),
        ("bank_statement_utility.parser.XlsParserWithCustomHeader", os.path.join(_PKG, "parser", "XlsParserWithCustomHeader.py")),
        ("bank_statement_utility.parser.XlsParserWithHeader", os.path.join(_PKG, "parser", "XlsParserWithHeader.py")),
        ("bank_statement_utility.parser.XlsxParserWithHeader", os.path.join(_PKG, "parser", "XlsxParserWithHeader.py")),
    ]

    # Ensure the bank_statement_utility package entry exists in sys.modules
    # but WITHOUT running its __init__.py (which imports main → Cassandra)
    if "bank_statement_utility" not in sys.modules:
        import types
        pkg = types.ModuleType("bank_statement_utility")
        pkg.__path__ = [_PKG]
        pkg.__package__ = "bank_statement_utility"
        sys.modules["bank_statement_utility"] = pkg

    for mod_name, mod_path in modules_to_load:
        if mod_name not in sys.modules and os.path.exists(mod_path):
            try:
                _import_module_directly(mod_path, mod_name)
            except Exception as e:
                log.warning(f"Failed to load {mod_name}: {e}")


# Load supporting modules once at import time
_ensure_supporting_modules()

# Now we can safely load the processor modules
_PROCESSORS_DIR = os.path.join(_PKG, "services")


def _load_processor(filename: str, class_name: str):
    mod_name = f"bank_statement_utility.services.{filename}"
    if mod_name not in sys.modules:
        path = os.path.join(_PROCESSORS_DIR, f"{filename}.py")
        _import_module_directly(path, mod_name)
    return getattr(sys.modules[mod_name], class_name)


# ── Supported banks metadata (surfaced to the UI) ────────────────────────────
SUPPORTED_BANKS = [
    {"name": "HDFC",  "account_types": ["Saving", "Current"],    "file_formats": ["CSV"]},
    {"name": "KOTAK", "account_types": ["Saving", "Current", "Creditcard"], "file_formats": ["CSV", "PDF"]},
    {"name": "SBI",   "account_types": ["Saving", "Current", "Creditcard"], "file_formats": ["XLSX", "PDF"]},
    {"name": "BOB",   "account_types": ["Saving", "Current"],    "file_formats": ["XLS"]},
    {"name": "IDBI",  "account_types": ["Saving", "Current"],    "file_formats": ["XLS"]},
    {"name": "SVC",   "account_types": ["Saving", "Current"],    "file_formats": ["XLS"]},
    {"name": "YES",   "account_types": ["Creditcard"],            "file_formats": ["PDF"]},
]


def _get_processor(bank_name: str, source: str, filepath: str):
    """Factory — mirrors StatementProcessor.get_processor() without Cassandra."""
    bank_name = bank_name.upper()
    source_cap = source.capitalize()

    if bank_name == "HDFC" and source_cap in ("Saving", "Current"):
        cls = _load_processor("HdfcDebitStatementProcessor", "HdfcDebitStatementProcessor")
        return cls(filepath, source_cap)
    elif bank_name == "KOTAK":
        if source_cap in ("Saving", "Current"):
            cls = _load_processor("KotakDebitStatementProcessor", "KotakDebitStatementProcessor")
            return cls(filepath, source_cap)
        elif source_cap == "Creditcard":
            cls = _load_processor("KotakCcStatementProcessor", "KotakCcStatementProcessor")
            return cls(filepath, source_cap)
    elif bank_name == "SBI":
        if source_cap in ("Saving", "Current"):
            cls = _load_processor("SbiDebitStatementProcessor", "SbiDebitStatementProcessor")
            return cls(filepath, source_cap)
        elif source_cap == "Creditcard":
            cls = _load_processor("SbiCcStatementProcessor", "SbiCcStatementProcessor")
            return cls(filepath, source_cap)
    elif bank_name == "BOB" and source_cap in ("Saving", "Current"):
        cls = _load_processor("BobDebitStatementProcessor", "BobDebitStatementProcessor")
        return cls(filepath, source_cap)
    elif bank_name == "IDBI" and source_cap in ("Saving", "Current"):
        cls = _load_processor("IdbiDebitStatmentProcessor", "IdbiDebitStatementProcessor")
        return cls(filepath, source_cap)
    elif bank_name == "SVC" and source_cap in ("Saving", "Current"):
        cls = _load_processor("SvcSavingStatementProcessor", "SvcSavingStatementProcessor")
        return cls(filepath, source_cap)
    elif bank_name == "YES" and source_cap == "Creditcard":
        cls = _load_processor("YesCcStatementProcessor", "YesCcStatementProcessor")
        return cls(filepath, source_cap)

    return None


def _safe_date(d: Any) -> date | None:
    """Convert various date representations to a Python date."""
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    # Some parsers might return a string
    if isinstance(d, str):
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d/%m/%y"):
            try:
                return datetime.strptime(d, fmt).date()
            except ValueError:
                continue
    return None


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return round(float(v), 2)
    except (ValueError, TypeError):
        return None


def parse_statement(bank_name: str, account_type: str, filepath: str) -> dict:
    """
    Parse a bank statement file and return structured transaction data.

    Returns:
        {
            "records": [  { transaction dict } , ... ],
            "failed_records": [ ... ],
            "error": str | None,
        }
    """
    processor = _get_processor(bank_name, account_type, filepath)
    if processor is None:
        return {
            "records": [],
            "failed_records": [],
            "error": f"No parser available for {bank_name} / {account_type}",
        }

    records: list[dict] = []
    failed_records: list[str] = []

    while True:
        try:
            raw = processor.get_record()
            if raw == -1:
                break
            model = processor.map_record(raw)
            records.append({
                "bank_name": model.bank_name,
                "account_type": model.source,
                "transaction_date": _safe_date(model.transaction_date),
                "description": str(model.description or "").strip(),
                "debit_amount": _safe_float(model.debit_amount),
                "credit_amount": _safe_float(model.credit_amount),
                "cheque_ref_number": getattr(model, "cheque_ref_number", None),
                "closing_balance": _safe_float(model.closing_balance),
                "value_date": _safe_date(getattr(model, "value_date", None)),
            })
        except AttributeError as err:
            log.warning(f"AttributeError parsing record: {err} | raw={str(raw)[:300]}", exc_info=True)
            failed_records.append(f"{type(err).__name__}: {err}")
        except Exception as err:
            log.warning(f"Error parsing record: {err} | raw={str(raw)[:300]}", exc_info=True)
            failed_records.append(f"{type(err).__name__}: {err}")

    return {
        "records": records,
        "failed_records": failed_records,
        "error": None,
    }
