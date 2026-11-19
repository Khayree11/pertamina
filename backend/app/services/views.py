"""Serialisasi ORM -> dict untuk API. Audiens 'worker' hanya mendapat alasan singkat."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import (
    ALLOWED,
    AREA_INFO,
    BP_SOURCES,
    DENIED,
    GATE_MESSAGES,
    MCU_CONCLUSIONS,
    OVERRIDE_KINDS,
    OVERRIDE_STATE_LABELS,
    RESTRICTED,
    SPECIAL_AREAS,
    STATUS_LABELS,
    TAP_LABELS,
    VERIFICATION_LABELS,
)
from ..models import (
    AccessEvent,
    AccessOverride,
    AnnualMCU,
    AuditLog,
    CardAccess,
    Comorbidity,
    DailyBPRecord,
    Employee,
    NotificationLog,
    User,
)
from ..constants import MCU_EXTRACTION_LABELS
from ..mcu.parser import suggestions as mcu_suggestions
from ..mcu.template import statuses
from ..timeutil import iso, iso_date, today_local, utcnow
from .facts import mcu_valid_through
from .reasons import comorbidity_label, describe_reason


def area_meta(code: str) -> dict:
    info = AREA_INFO.get(code, {"label": code, "short": code, "risk": ""})
    return {"code": code, **info}


def user_names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: u.full_name for u in db.scalars(select(User).where(User.id.in_(ids)))}


def employee_basic(e: Employee) -> dict:
    return {
        "id": e.id,
        "employee_code": e.employee_code,
        "full_name": e.full_name,
        "position": e.position,
        "unit": e.unit,
        "work_location": e.work_location,
        "card_number": e.card_number,
        "card_active": e.card_active,
        "registration_source": e.registration_source or "ADMIN",
        "profile_completed": bool(e.profile_completed_at),
    }


def effective_now(ca: CardAccess, now: datetime) -> tuple[str, str, list, datetime | None]:
    """Status efektif saat ini; status yang sudah lewat masa berlaku diperlakukan DENIED."""
    status, source, codes, valid_until = ca.status, ca.source, list(ca.reason_codes or []), ca.valid_until
    if valid_until is not None and valid_until <= now:
        if source == "OVERRIDE" and ca.auto_valid_until and ca.auto_valid_until > now:
            return ca.auto_status, "AUTO", list(ca.auto_reason_codes or []), ca.auto_valid_until
        return DENIED, "AUTO", ["STATUS_EXPIRED"], None
    return status, source, codes, valid_until


def tap_preview(status: str, source: str) -> str:
    if status == ALLOWED and source == "AUTO":
        return "GRANTED"
    if status in (ALLOWED, RESTRICTED):
        return "TEMPORARY"
    return "DENIED"


def override_view(ov: AccessOverride, names: dict[int, str]) -> dict:
    return {
        "id": ov.id,
        "employee_id": ov.employee_id,
        "area": area_meta(ov.area_code),
        "kind": ov.kind,
        "kind_label": OVERRIDE_KINDS.get(ov.kind, ov.kind),
        "new_status": ov.new_status,
        "new_status_label": STATUS_LABELS.get(ov.new_status, ov.new_status),
        "base_auto_status": ov.base_auto_status,
        "valid_from": iso(ov.valid_from),
        "valid_until": iso(ov.valid_until),
        "reason": ov.reason,
        "risk_acknowledged": ov.risk_acknowledged,
        "admin_name": names.get(ov.admin_user_id, "Admin"),
        "created_at": iso(ov.created_at),
        "state": ov.state,
        "state_label": OVERRIDE_STATE_LABELS.get(ov.state, ov.state),
        "ended_at": iso(ov.ended_at),
        "ended_by": names.get(ov.ended_by_user_id) if ov.ended_by_user_id else ("Sistem" if ov.ended_at else None),
        "end_reason": ov.end_reason,
    }


def card_view(
    db: Session, employee: Employee, config: dict, audience: str = "worker", now: datetime | None = None
) -> list[dict]:
    now = now or utcnow()
    rows = {r.area_code: r for r in db.scalars(select(CardAccess).where(CardAccess.employee_id == employee.id))}
    ov_ids = [r.override_id for r in rows.values() if r.override_id]
    ovs = {o.id: o for o in db.scalars(select(AccessOverride).where(AccessOverride.id.in_(ov_ids)))} if ov_ids else {}
    names = user_names(db, [o.admin_user_id for o in ovs.values()])
    out = []
    for area in SPECIAL_AREAS:
        ca = rows.get(area)
        if ca is None:
            out.append(
                {
                    "area": area_meta(area),
                    "status": DENIED,
                    "status_label": STATUS_LABELS[DENIED],
                    "source": "AUTO",
                    "valid_from": None,
                    "valid_until": None,
                    "tap_preview": "DENIED",
                    "reasons": [describe_reason("NOT_ASSESSED", config)],
                    "auto_status": None,
                    "auto_reasons": [],
                    "override": None,
                    "sync_status": None,
                }
            )
            continue
        # Tampilan selalu jujur terhadap waktu: status yang sudah lewat masa berlaku dianggap DENIED.
        status, source, codes, valid_until = effective_now(ca, now)

        def _reasons(cs):
            items = [describe_reason(c, config) for c in cs]
            if audience == "worker":
                # Alasan singkat tanpa detail medis berlebih; hapus duplikat teks.
                seen, slim = set(), []
                for it in items:
                    if it["short"] in seen:
                        continue
                    seen.add(it["short"])
                    slim.append({"code": it["code"], "short": it["short"]})
                return slim
            return items

        ov = ovs.get(ca.override_id) if source == "OVERRIDE" else None
        out.append(
            {
                "area": area_meta(area),
                "status": status,
                "status_label": STATUS_LABELS.get(status, status),
                "source": source,
                "valid_from": iso(ca.valid_from),
                "valid_until": iso(valid_until),
                "tap_preview": tap_preview(status, source),
                "reasons": _reasons(codes),
                "auto_status": ca.auto_status,
                "auto_status_label": STATUS_LABELS.get(ca.auto_status, ca.auto_status),
                "auto_reasons": _reasons(ca.auto_reason_codes or []),
                "auto_valid_until": iso(ca.auto_valid_until),
                "override": override_view(ov, names) if ov else None,
                "sync_status": ca.sync_status,
                "synced_at": iso(ca.synced_at),
            }
        )
    return out


def bp_view(b: DailyBPRecord) -> dict:
    return {
        "id": b.id,
        "record_date": iso_date(b.record_date),
        "measured_at": iso(b.measured_at),
        "systolic": b.systolic,
        "diastolic": b.diastolic,
        "pulse": b.pulse,
        "source": b.source,
        "source_label": BP_SOURCES.get(b.source, b.source),
        "note": b.note,
    }


def mcu_view(m: AnnualMCU, config: dict, names: dict[int, str] | None = None, now: datetime | None = None) -> dict:
    names = names or {}
    validity = int(config.get("settings", {}).get("mcu_validity_days", 365))
    through = mcu_valid_through(m, validity)
    today = today_local(now or utcnow())
    return {
        "id": m.id,
        "mcu_date": iso_date(m.mcu_date),
        "valid_through": iso_date(through),
        "days_left": (through - today).days,
        "expired": today > through,
        "provider": m.provider,
        "summary": m.summary,
        "conclusion": m.conclusion,
        "conclusion_label": MCU_CONCLUSIONS.get(m.conclusion, m.conclusion),
        "restricted_areas": [area_meta(a) for a in (m.restricted_areas or [])],
        "doctor_name": m.doctor_name,
        "has_document": bool(m.document_path),
        "document_filename": m.document_filename,
        "verification_status": m.verification_status,
        "verification_label": VERIFICATION_LABELS.get(m.verification_status, m.verification_status),
        "verified_by": names.get(m.verified_by_user_id) if m.verified_by_user_id else None,
        "verified_at": iso(m.verified_at),
        "verification_note": m.verification_note,
        "entered_by": names.get(m.entered_by_user_id) if m.entered_by_user_id else None,
        "created_at": iso(m.created_at),
        "details": m.details,
        "field_status": statuses(m.details) if m.details else None,
        "suggestions": mcu_suggestions(m.details) if m.details else [],
        "edited_fields": m.edited_fields or [],
        "extracted_values": (
            {k: (m.extracted or {}).get(k) for k in (m.edited_fields or [])} if m.extracted else {}
        ),
        "extraction_status": m.extraction_status,
        "extraction_label": MCU_EXTRACTION_LABELS.get(m.extraction_status or "", m.extraction_status),
        "identity_check": m.identity_check,
    }


def comorbidity_view(c: Comorbidity, config: dict, names: dict[int, str] | None = None) -> dict:
    names = names or {}
    return {
        "id": c.id,
        "condition_code": c.condition_code,
        "label": comorbidity_label(c.condition_code, config, c.other_label),
        "other_label": c.other_label,
        "controlled": c.controlled,
        "diagnosed_date": iso_date(c.diagnosed_date),
        "active": c.active,
        "notes": c.notes,
        "verification_status": c.verification_status,
        "verification_label": VERIFICATION_LABELS.get(c.verification_status, c.verification_status),
        "verified_by": names.get(c.verified_by_user_id) if c.verified_by_user_id else None,
        "verified_at": iso(c.verified_at),
        "verification_note": c.verification_note,
        "entered_by": names.get(c.entered_by_user_id) if c.entered_by_user_id else None,
        "created_at": iso(c.created_at),
        "updated_at": iso(c.updated_at),
    }


def notification_view(n: NotificationLog) -> dict:
    return {
        "id": n.id,
        "created_at": iso(n.created_at),
        "employee_id": n.employee_id,
        "recipient_type": n.recipient_type,
        "recipient_label": n.recipient_label,
        "channel": n.channel,
        "provider": n.provider,
        "to_masked": n.to_masked,
        "template": n.template,
        "message": n.message,
        "status": n.status,
        "error": n.error,
    }


def access_event_view(ev: AccessEvent) -> dict:
    return {
        "id": ev.id,
        "created_at": iso(ev.created_at),
        "input_identifier": ev.input_identifier,
        "employee_id": ev.employee_id,
        "employee_code": ev.employee_code,
        "card_number": ev.card_number,
        "room_code": ev.room_code,
        "room_name": ev.room_name,
        "area": area_meta(ev.area_code) if ev.area_code else None,
        "result": ev.result,
        "result_label": TAP_LABELS.get(ev.result, ev.result),
        "reason_category": ev.reason_category,
        "message": ev.message or GATE_MESSAGES.get(ev.reason_category, ""),
        "valid_until": iso(ev.valid_until),
        "max_duration_minutes": ev.max_duration_minutes,
        "source": ev.source,
        "device_id": ev.device_id,
    }


def audit_view(a: AuditLog) -> dict:
    return {
        "id": a.id,
        "created_at": iso(a.created_at),
        "actor_label": a.actor_label,
        "actor_role": a.actor_role,
        "action": a.action,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "employee_id": a.employee_id,
        "details": a.details,
        "hash": a.hash,
        "prev_hash": a.prev_hash,
    }
