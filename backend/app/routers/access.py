"""Simulator tap kartu + Mock Access Control API (device)."""
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..constants import AREA_INFO, ROLE_ADMIN, TAP_LABELS
from ..deps import CurrentUser, get_current_user, get_db
from ..models import AccessEvent, AcsCard, AcsCardPermission, Employee, Room
from ..schemas import TapIn
from ..services import acs
from ..services.views import access_event_view, area_meta
from ..timeutil import iso

router = APIRouter(tags=["akses"])


@router.get("/api/acs/rooms")
def rooms(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Room).where(Room.is_active.is_(True)).order_by(Room.area_code, Room.room_code)).all()
    return {
        "items": [
            {
                "room_code": r.room_code,
                "name": r.name,
                "area": area_meta(r.area_code),
                "location": r.location,
                "description": r.description,
            }
            for r in rows
        ]
    }


def _tap_response(db: Session, ev: AccessEvent) -> dict:
    card = db.scalars(select(AcsCard).where(AcsCard.card_number == ev.card_number)).first() if ev.card_number else None
    return {
        **access_event_view(ev),
        "holder_name": card.holder_name if card else None,
        "decided_by": acs.ADAPTER_NAME,
        "decision_basis": "Cache izin di sistem kartu (hasil sinkronisasi terakhir) — tanpa data medis.",
    }


@router.post("/api/acs/tap")
def simulate_tap(body: TapIn, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != ROLE_ADMIN:
        emp = db.get(Employee, user.employee_id) if user.employee_id else None
        ident = body.identifier.strip().upper()
        if emp is None or ident not in (emp.employee_code.upper(), emp.card_number.upper()):
            raise HTTPException(403, "Simulator untuk akun pekerja hanya dapat memakai kartu sendiri")
    ev = acs.tap(db, body.identifier, body.room_code, source="SIMULATOR", actor_user_id=user.id)
    db.commit()
    return _tap_response(db, ev)


@router.get("/api/acs/events")
def events(
    limit: int = Query(20, ge=1, le=200), user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)
):
    stmt = select(AccessEvent).order_by(AccessEvent.created_at.desc()).limit(limit)
    if user.role != ROLE_ADMIN:
        stmt = stmt.where(AccessEvent.employee_id == user.employee_id)
    return {"items": [access_event_view(e) for e in db.scalars(stmt)]}


# ---------------------------------------------------------- Mock device API (reader/controller)


class DeviceTapIn(BaseModel):
    card_number: str = Field(min_length=1, max_length=64)
    room_code: str = Field(min_length=1, max_length=32)
    device_id: str = Field(default="READER-SIM-01", max_length=64)


def _check_device(key: str | None) -> None:
    if not key or key != get_settings().device_api_key:
        raise HTTPException(401, "X-Device-Key tidak valid")


@router.post("/api/device/v1/tap")
def device_tap(body: DeviceTapIn, x_device_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    _check_device(x_device_key)
    ev = acs.tap(db, body.card_number, body.room_code, source="DEVICE_API", device_id=body.device_id)
    db.commit()
    return {
        "result": ev.result,
        "label": TAP_LABELS.get(ev.result, ev.result),
        "message": ev.message,
        "reason_category": ev.reason_category,
        "valid_until": iso(ev.valid_until),
        "max_duration_minutes": ev.max_duration_minutes,
        "event_id": ev.id,
    }


@router.get("/api/device/v1/cards/{card_number}/permissions")
def device_permissions(card_number: str, x_device_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    _check_device(x_device_key)
    card = db.scalars(select(AcsCard).where(AcsCard.card_number == card_number.upper())).first()
    if card is None:
        raise HTTPException(404, "Kartu tidak terdaftar")
    perms = db.scalars(select(AcsCardPermission).where(AcsCardPermission.card_number == card.card_number)).all()
    return {
        "card_number": card.card_number,
        "active": card.active,
        "updated_at": iso(card.updated_at),
        "permissions": [
            {
                "area": p.area_code,
                "area_label": AREA_INFO.get(p.area_code, {}).get("label", p.area_code),
                "permission": p.permission,
                "valid_until": iso(p.valid_until),
                "reason_category": p.reason_category,
                "max_duration_minutes": p.max_duration_minutes,
            }
            for p in perms
        ],
    }
