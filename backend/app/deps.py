from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status

from .config import get_settings
from .constants import ROLE_ADMIN, ROLE_WORKER
from .db import WRITE_LOCK, SessionLocal
from .models import User
from .security import decode_token


def get_db(request: Request):
    """Sesi DB per request. Request mutasi (POST/PATCH/PUT/DELETE) diserialkan dengan WRITE_LOCK."""
    lock = request.method not in ("GET", "HEAD", "OPTIONS")
    if lock:
        WRITE_LOCK.acquire()
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        if lock:
            WRITE_LOCK.release()


def get_db_nolock():
    """Untuk endpoint yang menunggu layanan eksternal lama (chatbot) — jangan tahan WRITE_LOCK."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    role: str
    full_name: str
    employee_id: int | None


def _token_from(request: Request) -> str | None:
    token = request.cookies.get(get_settings().cookie_name)
    if token:
        return token
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def get_current_user(request: Request) -> CurrentUser:
    token = _token_from(request)
    payload = decode_token(token) if token else None
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi tidak valid atau kedaluwarsa. Silakan login.")
    with SessionLocal() as s:
        user = s.get(User, int(payload["sub"]))
        if user is None or not user.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Akun tidak aktif")
        return CurrentUser(user.id, user.username, user.role, user.full_name, user.employee_id)


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin yang dapat mengakses fitur ini")
    return user


def require_worker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != ROLE_WORKER or user.employee_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Fitur ini khusus akun pekerja")
    return user
