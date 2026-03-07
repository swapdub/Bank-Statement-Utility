"""
Authentication utilities: password hashing, JWT tokens, FastAPI dependencies.
"""

import os
from datetime import datetime, timedelta
from typing import Optional

import argon2
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import get_db

# ── Configuration ─────────────────────────────────────────────────────────────

# In production, set SECRET_KEY env var to a long random string
SECRET_KEY = os.getenv("BSU_SECRET_KEY", "change-me-in-production-use-a-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30  # Long-lived for convenience

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# argon2-cffi hasher — defaults are Argon2id with current OWASP-recommended params.
# No password length limit; handles arbitrary-length inputs natively.
_ph = PasswordHasher()


# ── Password hashing (Argon2id via argon2-cffi) ───────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password with Argon2id. Returns a self-contained PHC string."""
    return _ph.hash(password)


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """Verify a password against a stored Argon2 PHC hash."""
    try:
        return _ph.verify(stored_hash, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# ── JWT tokens ────────────────────────────────────────────────────────────────

def create_access_token(user_id: int, username: str, is_admin: bool) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "is_admin": is_admin,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT. Raises JWTError on failure."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ── FastAPI dependencies ──────────────────────────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Extract the current user from the JWT bearer token.
    Returns the User ORM object.
    """
    from .models import User  # deferred to avoid circular import

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_admin(user=Depends(get_current_user)):
    """Require the current user to be an admin."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
