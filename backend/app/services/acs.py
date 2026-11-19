"""Mock Access Control System (sistem kartu vendor) + simulator tap.

Batas integrasi yang ditunjukkan prototipe:
* Sistem kesehatan HANYA mengirim izin per area (GRANT / TEMPORARY / DENY + masa berlaku
  + kategori alasan non-medis). Data medis tidak pernah dikirim ke sistem kartu.
* Reader/controller memutuskan dari cache izin terakhir. Jika sinkronisasi gagal,
  cache tetap dipakai sampai masa berlakunya habis; setelah itu DENIED + verifikasi manual
  (lihat §8.7 — kebijakan final milik IT/K3/medis).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..constants import (
    ALLOWED,
    GATE_MESSAGES,
    GENERAL_AREA,
    GRANTED,
    NEEDS_REVIEW,
    RESTRICTED,
    SPECIAL_AREAS,
    TAP_DENIED,
    TEMPORARY,
)
from ..models import AccessEvent, AcsCard, AcsCardPermission, AcsSyncLog, CardAccess, Employee, Room
from ..timeutil import iso, utcnow

ADAPTER_NAME = "MOCK_ACS (simulasi API vendor kartu)"

_state: dict = {
    "simulate_outage": False,
    "last_success_at": None,
    "last_failure_at": None,
    "last_error": None,
    "success_count": 0,
    "failure_count": 0,
}


class AcsUnavailable(Exception):
    pass


def state() -> dict:
    return dict(_state)


def set_outage(flag: bool) -> None:
    _state["simulate_outage"] = bool(flag)


def permission_for(ca: CardAccess, settings: dict) -> dict:
    max_minutes = None
    if ca.status == ALLOWED and ca.source == "AUTO":
        perm, category = "GRANT", "OK"
    elif ca.status == ALLOWED:
        perm, category = "TEMPORARY", "OVERRIDE_TEMPORARY"
    elif ca.status == RESTRICTED:
        perm = "TEMPORARY"
        category = "RESTRICTED_TEMPORARY" if ca.source == "AUTO" else "OVERRIDE_TEMPORARY"
        max_minutes = int(settings.get("restricted_entry_max_minutes", 120))
    elif ca.status == NEEDS_REVIEW:
        perm, category = "DENY", "HEALTH_REVIEW_REQUIRED"
    else:
        perm = "DENY"
        codes = set(ca.reason_codes or [])
        if ca.source == "OVERRIDE":
            category = "ADMIN_RESTRICTED"
        elif "CARD_INACTIVE" in codes:
            category = "CARD_INACTIVE"
        elif "STATUS_EXPIRED" in codes:
            category = "STATUS_EXPIRED"
        elif "BP_NOT_SUBMITTED" in codes:
            category = "NOT_SCREENED_TODAY"
        else:
            category = "NOT_ELIGIBLE"
    return {
        "area": ca.area_code,
        "permission": perm,
        "valid_until": iso(ca.valid_until),
        "reason_category": category,
        "max_duration_minutes": max_minutes,
    }


def build_payload(db: Session, employee: Employee, settings: dict) -> dict:
    rows = db.scalars(select(CardAccess).where(CardAccess.employee_id == employee.id)).all()
    by_area = {r.area_code: r for r in rows}
    return {
        "card_number": employee.card_number,
        "employee_code": employee.employee_code,
        "holder_name": employee.full_name,
        "card_active": bool(employee.card_active),
        "permissions": [permission_for(by_area[a], settings) for a in SPECIAL_AREAS if a in by_area],
    }


def _vendor_apply(db: Session, payload: dict, now: datetime) -> None:
    """Simulasi sisi vendor: simpan kartu + izin per area."""
    card = db.scalars(select(AcsCard).where(AcsCard.card_number == payload["card_number"])).first()
    if card is None:
        card = AcsCard(card_number=payload["card_number"], employee_code=payload["employee_code"])
        db.add(card)
    card.holder_name = payload["holder_name"]
    card.active = payload["card_active"]
    card.updated_at = now
    existing = {
        p.area_code: p
        for p in db.scalars(select(AcsCardPermission).where(AcsCardPermission.card_number == payload["card_number"]))
    }
    for p in payload["permissions"]:
        row = existing.get(p["area"])
        if row is None:
            row = AcsCardPermission(card_number=payload["card_number"], area_code=p["area"])
            db.add(row)
        row.permission = p["permission"]
        row.valid_until = datetime.fromisoformat(p["valid_until"].replace("Z", "+00:00")) if p["valid_until"] else None
        row.reason_category = p["reason_category"]
        row.max_duration_minutes = p["max_duration_minutes"]
        row.updated_at = now


def sync_employee(db: Session, employee: Employee, settings: dict, now: datetime | None = None) -> bool:
    now = now or utcnow()
    db.flush()
    payload = build_payload(db, employee, settings)
    rows = db.scalars(select(CardAccess).where(CardAccess.employee_id == employee.id)).all()
    try:
        if _state["simulate_outage"]:
            raise AcsUnavailable("Simulasi gangguan: Access Control API tidak dapat dihubungi")
        _vendor_apply(db, payload, now)
        for ca in rows:
            ca.sync_status = "SYNCED"
            ca.synced_at = now
        db.add(AcsSyncLog(created_at=now, employee_id=employee.id, status="SUCCESS", payload=payload))
        _state.update(last_success_at=iso(now), success_count=_state["success_count"] + 1)
        db.flush()
        return True
    except AcsUnavailable as exc:
        for ca in rows:
            ca.sync_status = "FAILED"
        db.add(AcsSyncLog(created_at=now, employee_id=employee.id, status="FAILED", payload=payload, error=str(exc)))
        _state.update(last_failure_at=iso(now), last_error=str(exc), failure_count=_state["failure_count"] + 1)
        db.flush()
        return False


def tap(
    db: Session,
    identifier: str,
    room_code: str,
    source: str = "SIMULATOR",
    actor_user_id: int | None = None,
    device_id: str | None = None,
    now: datetime | None = None,
) -> AccessEvent:
    """Keputusan reader: hanya membaca data sistem kartu (izin), bukan data kesehatan."""
    now = now or utcnow()
    ident = (identifier or "").strip().upper()
    rcode = (room_code or "").strip().upper()
    room = db.scalars(select(Room).where(Room.room_code == rcode, Room.is_active.is_(True))).first()
    card = db.scalars(select(AcsCard).where(or_(AcsCard.card_number == ident, AcsCard.employee_code == ident))).first()
    employee = None
    if card is not None:
        employee = db.scalars(select(Employee).where(Employee.employee_code == card.employee_code)).first()

    valid_until = None
    max_minutes = None
    if room is None:
        result, category = TAP_DENIED, "UNKNOWN_ROOM"
    elif card is None:
        result, category = TAP_DENIED, "UNKNOWN_CARD"
    elif not card.active:
        result, category = TAP_DENIED, "CARD_INACTIVE"
    elif room.area_code == GENERAL_AREA:
        result, category = GRANTED, "OK"
    else:
        perm = db.scalars(
            select(AcsCardPermission).where(
                AcsCardPermission.card_number == card.card_number, AcsCardPermission.area_code == room.area_code
            )
        ).first()
        if perm is None:
            result, category = TAP_DENIED, "NOT_SYNCED"
        elif perm.permission == "DENY":
            result, category = TAP_DENIED, perm.reason_category
        elif perm.valid_until is None or perm.valid_until <= now:
            result, category = TAP_DENIED, "STATUS_EXPIRED"
        elif perm.permission == "GRANT":
            result, category = GRANTED, "OK"
            valid_until = perm.valid_until
        else:
            result, category = TEMPORARY, perm.reason_category
            valid_until = perm.valid_until
            max_minutes = perm.max_duration_minutes

    event = AccessEvent(
        created_at=now,
        input_identifier=ident[:64] or "-",
        employee_id=employee.id if employee else None,
        employee_code=card.employee_code if card else None,
        card_number=card.card_number if card else None,
        room_code=rcode[:32] or "-",
        room_name=room.name if room else None,
        area_code=room.area_code if room else None,
        result=result,
        reason_category=category,
        message=GATE_MESSAGES.get(category, category),
        valid_until=valid_until,
        max_duration_minutes=max_minutes,
        source=source,
        device_id=device_id,
        actor_user_id=actor_user_id,
    )
    db.add(event)
    db.flush()
    return event
