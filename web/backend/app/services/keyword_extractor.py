"""
Keyword extraction engine.

Strategy:
1. Tokenize transaction descriptions by splitting on  / - _ and spaces.
2. Apply smart splitting: separate where letters meet digits (e.g. "IMPS536413258077" → ["IMPS", "536413258077"]).
3. Normalise to uppercase.
4. Filter noise: pure numbers, single characters, dates, common stopwords.
5. Count frequencies across all transactions.
6. Return keywords sorted by frequency (highest first).
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

# ── Noise / stopwords ────────────────────────────────────────────────────────
STOPWORDS: set[str] = {
    # Common prepositions / conjunctions
    "TO", "FROM", "BY", "THE", "AND", "OR", "OF", "FOR", "IN", "ON",
    "AT", "IS", "IT", "AN", "A", "AS", "BE", "HAS", "WAS", "ARE",
    "WITH", "THROUGH", "VIA", "TOWARDS",
    # Banking noise
    "DR", "CR", "INR", "RS", "RUPEES", "RUPEE", "BEING", "REF", "NO",
    "TXN", "TRANSACTION", "TRANSFER", "MB", "MR", "MRS", "MS",
    # Date-like fragments (month abbreviations handled separately)
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
}

# Regex patterns for noise
_PURE_NUMBER = re.compile(r"^\d+$")
_DATE_LIKE = re.compile(
    r"^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$"  # DD-MM-YYYY, DD/MM/YY, etc
)
_SHORT_TOKEN = re.compile(r"^.{0,1}$")  # 0 or 1 char

# Split points: spaces, slashes, hyphens, underscores, pipes
_DELIMITER = re.compile(r"[\s/\-_|:;,]+")

# Letter-digit boundary for smart splitting
_LETTER_DIGIT_BOUNDARY = re.compile(r"(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])")


def _tokenize(description: str) -> list[str]:
    """Split a description into normalised uppercase tokens."""
    # First split on delimiters
    coarse_tokens = _DELIMITER.split(description.strip())
    tokens: list[str] = []
    for token in coarse_tokens:
        # Smart split at letter-digit boundaries
        sub_tokens = _LETTER_DIGIT_BOUNDARY.split(token)
        for st in sub_tokens:
            normalised = st.strip().upper()
            if normalised:
                tokens.append(normalised)
    return tokens


def _is_noise(token: str) -> bool:
    """Return True if a token should be discarded."""
    if _SHORT_TOKEN.match(token):
        return True
    if _PURE_NUMBER.match(token):
        return True
    if _DATE_LIKE.match(token):
        return True
    if token in STOPWORDS:
        return True
    return False


def extract_keywords(descriptions: Iterable[str], min_frequency: int = 1) -> list[dict]:
    """
    Extract keywords from transaction descriptions.

    Returns a list of dicts sorted by frequency descending:
        [{"keyword": "IMPS", "frequency": 42}, ...]
    """
    counter: Counter[str] = Counter()

    for desc in descriptions:
        if not desc:
            continue
        tokens = _tokenize(desc)
        # Deduplicate within a single description so one long description
        # doesn't skew the frequency count.
        unique_tokens = set(tokens)
        for t in unique_tokens:
            if not _is_noise(t):
                counter[t] += 1

    results = [
        {"keyword": kw, "frequency": freq}
        for kw, freq in counter.most_common()
        if freq >= min_frequency
    ]
    return results


def match_transaction_keywords(description: str, known_keywords: set[str]) -> list[str]:
    """
    Given a transaction description and a set of known keywords,
    return which keywords appear in this description.
    """
    tokens = set(_tokenize(description))
    return sorted(tokens & known_keywords)
