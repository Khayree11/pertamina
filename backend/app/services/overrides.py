"""Override akses oleh admin — kontrol keselamatan (§8.3):
alasan wajib, audit log tak bisa dihapus, masa berlaku pendek, tampilan jelas sumber override,
konfirmasi risiko untuk override yang membuka akses, dan hard-stop untuk kondisi tertentu."""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import write_audit
from ..constants import (
    ALLOWED,
    DENIED,
    OV_ACTIVE,
    OV_EXPIRED,
    OV_REPLACED,
    OV_REVOKED,
    OVERRIDE_KINDS,
    RESTRICTED,
    SEVERITY,
    SPECIAL_AREAS,
)
from ..models import AccessOverride, Employee
from ..timeutil import utcnow
from . import DomainError, acs, notifications
from .assessment import run_assessment
from .card_access import card_rows, end_override, find_active_override, set_effective
from .reasons import describe_reason, get_active_rules


def create_override(
    db: Session,
    admin,
    employee: Employee,
    area: str,
    new_status: str,
    duration_minutes: int,
    reason: str,
    kind: str = "OVERRIDE",
    risk_acknowledged: bool = False,
    now: datetime | None = None,
) -> AccessOverride:
    now = now or utcnow()
    config = get_active_rules(db).config
    settings = config.get("settings", {})
    if area not in SPECIAL_AREAS:
        raise DomainError("Area tidak valid untuk override")
    if new_status not in (ALLOWED, RESTRICTED, DENIED):
        raise DomainError("Status override harus ALLOWED, RESTRICTED, atau DENIED")
    if kind not in OVERRIDE_KINDS:
        raise DomainError("Jenis override tidak valid")
    max_hours = int(settings.get("override_max_hours", 12))
    if not (15 <= int(duration_minutes) <= max_hours * 60):
        raise DomainError(f"Durasi override harus 15 menit s.d. {max_hours} jam (masa berlaku override dibuat pendek)")
    reason = (reason or "").strip()
    if len(reason) < 10:
        raise DomainError("Alasan override wajib diisi (minimal 10 karakter)")
    if not employee.card_active:
        raise DomainError("Kartu pekerja nonaktif")

    ca = card_rows(db, employee.id).get(area)
    if ca is None or ca.auto_valid_until is None or ca.auto_valid_until <= now:
        run_assessment(db, employee, "OVERRIDE_PRECHECK", actor=admin, notify=False, now=now)
        ca = card_rows(db, employee.id).get(area)
    if ca is None:
        raise DomainError("Status kartu belum tersedia")
    if ca.status == new_status:
        raise DomainError("Status baru sama dengan status efektif saat ini")

    base = ca.auto_status
    elevating = SEVERITY[new_status] < SEVERITY[base]
    if elevating:
        hard = [c for c in (ca.auto_reason_codes or []) if c in set(settings.get("override_hard_stop_reasons", []))]
        if hard:
            labels = ", ".join(describe_reason(c, config)["short"] for c in hard)
            raise DomainError(
                f"Override ditolak (hard stop): {labels}. Kondisi ini harus ditangani tenaga medis, bukan override admin."
            )
        if not risk_acknowledged:
            raise DomainError("Override yang membuka akses wajib disertai konfirmasi risiko keselamatan")

    existing = find_active_override(db, employee.id, area, now)
    if existing is not None:
        end_override(db, existing, OV_REPLACED, "Digantikan override baru", admin, now, employee)

    ov = AccessOverride(
        employee_id=employee.id,
        area_code=area,
        kind=kind,
        new_status=new_status,
        base_auto_status=base,
        base_reason_codes=list(ca.auto_reason_codes or []),
        valid_from=now,
        valid_until=now + timedelta(minutes=int(duration_minutes)),
        reason=reason,
        risk_acknowledged=bool(risk_acknowledged and elevating),
        admin_user_id=admin.id,
        created_at=now,
        state=OV_ACTIVE,
    )
    db.add(ov)
    db.flush()
    set_effective(ca, employee, ov, now)
    acs.sync_employee(db, employee, settings, now)
    write_audit(
        db,
        admin,
        "OVERRIDE_CREATED",
        "access_override",
        ov.id,
        employee.id,
        {
            "area": area,
            "kind": kind,
            "from_auto_status": base,
            "new_status": new_status,
            "valid_until": ov.valid_until.isoformat(),
            "duration_minutes": int(duration_minutes),
            "elevating": elevating,
            "risk_acknowledged": ov.risk_acknowledged,
            "reason": reason,
        },
    )
    notifications.notify_override_created(db, employee, ov)
    return ov


def revoke_override(db: Session, admin, ov: AccessOverride, reason: str, now: datetime | None = None) -> None:
    now = now or utcnow()
    if ov.state != OV_ACTIVE:
        raise DomainError("Override sudah tidak aktif")
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise DomainError("Alasan pencabutan wajib diisi (minimal 5 karakter)")
    employee = db.get(Employee, ov.employee_id)
    ca = end_override(db, ov, OV_REVOKED, reason, admin, now, employee)
    settings = get_active_rules(db).config.get("settings", {})
    acs.sync_employee(db, employee, settings, now)
    notifications.notify_override_ended(db, employee, ov, ca.status if ca else None)


def expire_due(db: Session, now: datetime | None = None) -> int:
    now = now or utcnow()
    due = db.scalars(
        select(AccessOverride).where(AccessOverride.state == OV_ACTIVE, AccessOverride.valid_until <= now)
    ).all()
    if not due:
        return 0
    settings = get_active_rules(db).config.get("settings", {})
    for ov in due:
        employee = db.get(Employee, ov.employee_id)
        ca = end_override(db, ov, OV_EXPIRED, "Masa berlaku override habis", None, now, employee)
        acs.sync_employee(db, employee, settings, now)
        notifications.notify_override_ended(db, employee, ov, ca.status if ca else None)
    return len(due)
