"""Status kartu efektif per area = override aktif (jika ada) atau status otomatis yang masih berlaku."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import write_audit
from ..constants import (
    DENIED,
    OV_ACTIVE,
    OV_AUTO_REVOKED,
    OV_SUPERSEDED,
    SEVERITY,
    SPECIAL_AREAS,
)
from ..models import AccessOverride, AssessmentResult, CardAccess, Employee


def card_rows(db: Session, employee_id: int) -> dict[str, CardAccess]:
    return {r.area_code: r for r in db.scalars(select(CardAccess).where(CardAccess.employee_id == employee_id))}


def find_active_override(db: Session, employee_id: int, area: str, now: datetime) -> AccessOverride | None:
    return db.scalars(
        select(AccessOverride)
        .where(
            AccessOverride.employee_id == employee_id,
            AccessOverride.area_code == area,
            AccessOverride.state == OV_ACTIVE,
            AccessOverride.valid_from <= now,
            AccessOverride.valid_until > now,
        )
        .order_by(AccessOverride.created_at.desc())
    ).first()


def set_effective(ca: CardAccess, employee: Employee, ov: AccessOverride | None, now: datetime) -> None:
    if not employee.card_active:
        ca.status, ca.source, ca.reason_codes = DENIED, "AUTO", ["CARD_INACTIVE"]
        ca.valid_from, ca.valid_until, ca.override_id = now, None, None
    elif ov is not None:
        ca.status, ca.source, ca.reason_codes = ov.new_status, "OVERRIDE", [ov.kind]
        ca.valid_from, ca.valid_until, ca.override_id = ov.valid_from, ov.valid_until, ov.id
    elif ca.auto_valid_until is not None and ca.auto_valid_until > now:
        ca.status, ca.source, ca.reason_codes = ca.auto_status, "AUTO", list(ca.auto_reason_codes or [])
        ca.valid_from, ca.valid_until, ca.override_id = ca.auto_valid_from, ca.auto_valid_until, None
    else:
        ca.status, ca.source, ca.reason_codes = DENIED, "AUTO", ["STATUS_EXPIRED"]
        ca.valid_from, ca.valid_until, ca.override_id = now, None, None
    ca.updated_at = now
    ca.sync_status = "PENDING"


def end_override(
    db: Session,
    ov: AccessOverride,
    state: str,
    reason: str,
    actor,
    now: datetime,
    employee: Employee | None = None,
) -> CardAccess | None:
    """Akhiri override dan kembalikan kartu ke status otomatis. Sinkron ACS & notifikasi oleh pemanggil."""
    employee = employee or db.get(Employee, ov.employee_id)
    ov.state = state
    ov.ended_at = now
    ov.ended_by_user_id = actor.id if actor else None
    ov.end_reason = reason
    ca = card_rows(db, ov.employee_id).get(ov.area_code)
    if ca is not None and ca.override_id == ov.id:
        set_effective(ca, employee, None, now)
    write_audit(
        db,
        actor,
        f"OVERRIDE_{state}",
        "access_override",
        ov.id,
        ov.employee_id,
        {"area": ov.area_code, "reason": reason, "effective_status": ca.status if ca else None},
    )
    return ca


def _reconcile_override(
    db: Session, employee: Employee, ov: AccessOverride, new_auto: str, now: datetime
) -> tuple[AccessOverride | None, dict]:
    """Keselamatan: override yang MEMBUKA akses dicabut otomatis jika kondisi memburuk."""
    info: dict = {}
    elevating = SEVERITY[ov.new_status] < SEVERITY[ov.base_auto_status]
    if not elevating:
        return ov, info  # override yang membatasi selalu dipertahankan
    if SEVERITY[new_auto] > SEVERITY[ov.base_auto_status]:
        end_override(
            db,
            ov,
            OV_AUTO_REVOKED,
            f"Dicabut otomatis: status otomatis memburuk ({ov.base_auto_status} → {new_auto}).",
            None,
            now,
            employee,
        )
        info = {
            "note": "Akses sementara dari admin dicabut otomatis karena kondisi berubah.",
            "auto_revoked_override_id": ov.id,
        }
        return None, info
    if SEVERITY[new_auto] <= SEVERITY[ov.new_status]:
        end_override(
            db,
            ov,
            OV_SUPERSEDED,
            f"Tidak diperlukan lagi: status otomatis kini {new_auto}.",
            None,
            now,
            employee,
        )
        return None, info
    return ov, info


def apply_assessment(
    db: Session,
    employee: Employee,
    run,
    area_results: dict[str, AssessmentResult],
    now: datetime,
) -> list[dict]:
    rows = card_rows(db, employee.id)
    changes: list[dict] = []
    for area in SPECIAL_AREAS:
        ar = area_results.get(area)
        if ar is None:
            continue
        ca = rows.get(area)
        old = (ca.status, ca.source) if ca else (None, None)
        if ca is None:
            ca = CardAccess(employee_id=employee.id, area_code=area, status=ar.status, auto_status=ar.status)
            db.add(ca)
        ca.auto_status = ar.status
        ca.auto_reason_codes = list(ar.decisive or [])
        ca.auto_valid_from = now
        ca.auto_valid_until = run.valid_until
        ca.assessment_result_id = ar.id
        info: dict = {}
        ov = find_active_override(db, employee.id, area, now)
        if ov is not None:
            ov, info = _reconcile_override(db, employee, ov, ar.status, now)
        set_effective(ca, employee, ov, now)
        if old != (ca.status, ca.source):
            changes.append(
                {
                    "area": area,
                    "old_status": old[0],
                    "new_status": ca.status,
                    "old_source": old[1],
                    "new_source": ca.source,
                    **info,
                }
            )
        elif info:
            changes.append({"area": area, "old_status": old[0], "new_status": ca.status, **info})
    db.flush()
    return changes


def refresh_effective(db: Session, employee: Employee, now: datetime) -> list[dict]:
    """Hitung ulang status efektif (mis. setelah kartu dinonaktifkan) tanpa evaluasi ulang aturan."""
    changes = []
    for area, ca in card_rows(db, employee.id).items():
        old = ca.status
        ov = find_active_override(db, employee.id, area, now)
        set_effective(ca, employee, ov, now)
        if old != ca.status:
            changes.append({"area": area, "old_status": old, "new_status": ca.status})
    db.flush()
    return changes
