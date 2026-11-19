import time
import threading

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import write_audit
from ..config import get_settings
from ..constants import ROLE_WORKER
from ..deps import CurrentUser, get_current_user, get_db
from ..models import Employee, User
from ..schemas import DemoLoginIn, LoginIn, RegisterIn
from ..security import create_token, hash_password, verify_password
from ..services.assessment import run_assessment
from ..services.profile import next_card_number, onboarding_status
from ..services.views import employee_basic
from ..timeutil import utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])

_failures: dict[str, list[float]] = {}
_fail_lock = threading.Lock()
_WINDOW, _MAX_FAILS = 300, 5


def _rate_check(username: str) -> None:
    now = time.time()
    with _fail_lock:
        recent = [t for t in _failures.get(username, []) if now - t < _WINDOW]
        _failures[username] = recent
        if len(recent) >= _MAX_FAILS:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu banyak percobaan login. Coba lagi dalam 5 menit.")


def _record_failure(username: str) -> None:
    with _fail_lock:
        _failures.setdefault(username, []).append(time.time())


def user_payload(db: Session, user: User) -> dict:
    emp = db.get(Employee, user.employee_id) if user.employee_id else None
    data = {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "employee": employee_basic(emp) if emp else None,
    }
    if emp is not None and user.role == ROLE_WORKER:
        data["onboarding"] = onboarding_status(db, emp)
    return data


_reg_hits: dict[str, list[float]] = {}


@router.post("/register")
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """Registrasi mandiri akun PEKERJA. Setelah itu pekerja wajib melengkapi profil."""
    if not get_settings().allow_self_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registrasi mandiri dinonaktifkan. Hubungi admin K3.")
    ip = request.client.host if request.client else "?"
    now_ts = time.time()
    with _fail_lock:
        hits = [t for t in _reg_hits.get(ip, []) if now_ts - t < 3600]
        if len(hits) >= 10:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu banyak registrasi dari perangkat ini. Coba lagi nanti.")
        _reg_hits[ip] = hits + [now_ts]
    if db.scalar(select(User.id).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username sudah dipakai")
    if db.scalar(select(Employee.id).where(Employee.employee_code == body.employee_code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Employee ID sudah terdaftar. Jika ini Anda, hubungi admin K3.")
    if body.email and db.scalar(select(User.id).where(User.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email sudah terdaftar")
    now = utcnow()
    emp = Employee(
        employee_code=body.employee_code,
        full_name=body.full_name,
        phone=body.phone,
        card_number=next_card_number(db),
        card_active=True,
        registration_source="SELF",
        created_at=now,
    )
    db.add(emp)
    db.flush()
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=ROLE_WORKER,
        full_name=body.full_name,
        employee_id=emp.id,
        email=body.email,
        consent_at=now,
        created_at=now,
        last_login_at=now,
    )
    db.add(user)
    db.flush()
    write_audit(db, user, "USER_REGISTERED", "user", user.id, emp.id, {"employee_code": emp.employee_code, "source": "SELF"})
    run_assessment(db, emp, "REGISTERED", actor=user, notify=False)
    db.commit()
    _issue_cookie(response, user)
    return {"user": user_payload(db, user)}


def _issue_cookie(response: Response, user: User) -> None:
    s = get_settings()
    response.set_cookie(
        s.cookie_name,
        create_token(user.id, user.role),
        httponly=True,
        samesite="lax",
        secure=s.cookie_secure,
        max_age=s.jwt_expire_minutes * 60,
        path="/",
    )


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    _rate_check(username)
    user = db.scalars(select(User).where(User.username == username)).first()
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        _record_failure(username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Username atau password salah")
    user.last_login_at = utcnow()
    write_audit(db, user, "LOGIN", "user", user.id, user.employee_id, {"method": "password"})
    db.commit()
    _issue_cookie(response, user)
    return {"user": user_payload(db, user)}


@router.post("/demo-login")
def demo_login(body: DemoLoginIn, response: Response, db: Session = Depends(get_db)):
    """Login satu klik untuk akun demo — hanya aktif saat DEMO_MODE=true."""
    if not get_settings().demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tidak tersedia")
    from ..seed import DEMO_USERNAMES  # impor lokal untuk menghindari siklus

    username = body.username.strip().lower()
    user = db.scalars(select(User).where(User.username == username)).first() if username in DEMO_USERNAMES else None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Akun demo tidak ditemukan")
    user.last_login_at = utcnow()
    write_audit(db, user, "LOGIN", "user", user.id, user.employee_id, {"method": "demo"})
    db.commit()
    _issue_cookie(response, user)
    return {"user": user_payload(db, user)}


@router.get("/demo-accounts")
def demo_accounts(db: Session = Depends(get_db)):
    if not get_settings().demo_mode:
        return {"enabled": False, "accounts": []}
    from ..seed import DEMO_SCENARIOS, DEMO_USERNAMES  # impor lokal untuk menghindari siklus

    users = db.scalars(
        select(User).where(User.is_active.is_(True), User.username.in_(DEMO_USERNAMES)).order_by(User.role, User.id)
    ).all()
    out = []
    for u in users:
        emp = db.get(Employee, u.employee_id) if u.employee_id else None
        out.append(
            {
                "username": u.username,
                "full_name": u.full_name,
                "role": u.role,
                "employee_code": emp.employee_code if emp else None,
                "scenario": DEMO_SCENARIOS.get(emp.employee_code if emp else u.username, {}).get("label", ""),
            }
        )
    return {"enabled": True, "accounts": out}


@router.post("/logout")
def logout(response: Response):
    s = get_settings()
    response.delete_cookie(s.cookie_name, path="/", httponly=True, samesite="lax", secure=s.cookie_secure)
    return {"ok": True}


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"user": user_payload(db, db.get(User, user.id))}
