"""Notifikasi WhatsApp satu arah — SIMULASI (mock provider, tercatat di notification_logs).

Pesan sengaja TIDAK memuat nilai/diagnosis medis (WA adalah kanal pihak ketiga).
Penyedia diatur di services/whatsapp.py (pengaturan admin / .env); kosong = simulasi.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..constants import AREA_INFO, SPECIAL_AREAS, STATUS_LABELS
from ..models import AccessOverride, CardAccess, DailyBPRecord, Employee, NotificationLog, User
from ..security import mask_phone
from ..timeutil import fmt_local, start_of_local_day, today_local, utcnow
from . import whatsapp

SILENT_TRIGGERS = {"EXPIRY", "SEED", "DEMO_REFRESH"}

TEMPLATE_LABELS = {
    "BP_REMINDER": "Pengingat tensi harian",
    "CARD_STATUS_CHANGED": "Status kartu berubah",
    "URGENT_WORKER": "Flag review segera (pekerja)",
    "URGENT_K3": "Flag review segera (K3)",
    "OVERRIDE_CREATED": "Override akses",
    "OVERRIDE_ENDED": "Override berakhir",
    "OVERRIDE_AUTO_REVOKED_K3": "Override dicabut otomatis (K3)",
    "VERIFICATION_RESULT": "Hasil verifikasi data",
}


def _first_name(employee: Employee) -> str:
    return (employee.full_name or "").split(" ")[0] or "Rekan"


def send(
    db: Session,
    *,
    employee: Employee | None,
    recipient_type: str,
    to_phone: str,
    recipient_label: str,
    template: str,
    message: str,
    related_type: str | None = None,
    related_id: str | None = None,
    now: datetime | None = None,
) -> NotificationLog:
    """Catat notifikasi. Mode simulasi -> SIMULATED; API aktif -> QUEUED lalu dikirim dispatcher
    di luar transaksi (tidak menahan WRITE_LOCK selama panggilan jaringan)."""
    cfg = whatsapp.resolve(db)
    log = NotificationLog(
        created_at=now or utcnow(),
        employee_id=employee.id if employee else None,
        recipient_type=recipient_type,
        recipient_label=recipient_label,
        provider=cfg.provider if cfg.active else "MOCK_WHATSAPP",
        to_masked=mask_phone(to_phone),
        template=template,
        message=message,
        status="QUEUED" if cfg.active else "SIMULATED",
        related_type=related_type,
        related_id=str(related_id) if related_id is not None else None,
    )
    db.add(log)
    db.flush()
    return log


def _destination(db: Session, log: NotificationLog) -> str:
    if log.recipient_type == "K3_ONDUTY":
        return get_settings().k3_onduty_phone
    emp = db.get(Employee, log.employee_id) if log.employee_id else None
    return emp.phone if emp else ""


def dispatch_pending(limit: int = 25, client=None) -> dict:
    """Kirim notifikasi berstatus QUEUED. Panggilan HTTP dilakukan tanpa memegang WRITE_LOCK."""
    from ..db import WRITE_LOCK, SessionLocal

    with SessionLocal() as db:
        cfg = whatsapp.resolve(db)
        rows = db.scalars(
            select(NotificationLog).where(NotificationLog.status == "QUEUED").order_by(NotificationLog.id).limit(limit)
        ).all()
        jobs = [(r.id, _destination(db, r), r.message) for r in rows]
    if not jobs:
        return {"sent": 0, "failed": 0}
    results = {}
    for nid, phone, msg in jobs:
        results[nid] = whatsapp.send(cfg, phone, msg, client=client) if cfg.active else whatsapp.SendResult(True, "SIMULATED", "MOCK_WHATSAPP")
    with WRITE_LOCK, SessionLocal() as db:
        for nid, res in results.items():
            row = db.get(NotificationLog, nid)
            if row is None or row.status != "QUEUED":
                continue
            row.status = res.status
            row.provider = res.provider
            row.error = None if res.ok else res.detail
        db.commit()
    return {
        "sent": sum(1 for r in results.values() if r.status == "SENT"),
        "failed": sum(1 for r in results.values() if r.status == "FAILED"),
    }


def _to_worker(db: Session, employee: Employee, template: str, message: str, **kw) -> NotificationLog:
    return send(
        db,
        employee=employee,
        recipient_type="WORKER",
        to_phone=employee.phone,
        recipient_label=f"{employee.full_name} ({employee.employee_code})",
        template=template,
        message=message,
        **kw,
    )


def _to_k3(db: Session, employee: Employee | None, template: str, message: str, **kw) -> NotificationLog:
    s = get_settings()
    return send(
        db,
        employee=employee,
        recipient_type="K3_ONDUTY",
        to_phone=s.k3_onduty_phone,
        recipient_label=s.k3_onduty_label,
        template=template,
        message=message,
        **kw,
    )


def status_lines(db: Session, employee: Employee) -> str:
    rows = {
        r.area_code: r for r in db.scalars(select(CardAccess).where(CardAccess.employee_id == employee.id))
    }
    lines = []
    for a in SPECIAL_AREAS:
        r = rows.get(a)
        if not r:
            continue
        label = STATUS_LABELS.get(r.status, r.status)
        extra = " (override admin)" if r.source == "OVERRIDE" else ""
        lines.append(f"• {AREA_INFO[a]['short']}: {label}{extra}")
    return "\n".join(lines)


def on_assessment(db: Session, employee: Employee, run, changes: list[dict], trigger: str, previous_run=None) -> None:
    now = run.assessed_at
    if changes and trigger not in SILENT_TRIGGERS:
        notes = [c["note"] for c in changes if c.get("note")]
        msg = (
            f"Halo {_first_name(employee)}, status akses kartu Anda diperbarui ({fmt_local(now, False)}):\n"
            f"{status_lines(db, employee)}\n"
            f"Status otomatis berlaku s.d. {fmt_local(run.valid_until)}."
        )
        if notes:
            msg += "\nCatatan: " + " ".join(notes)
        msg += "\nDetail alasan dapat dilihat di aplikasi HBAC."
        _to_worker(db, employee, "CARD_STATUS_CHANGED", msg, related_type="assessment_run", related_id=run.id, now=now)

    is_urgent = "URGENT_REVIEW" in (run.flags or [])
    was_urgent_today = bool(
        previous_run
        and "URGENT_REVIEW" in (previous_run.flags or [])
        and today_local(previous_run.assessed_at) == today_local(now)
        and (previous_run.meta or {}).get("bp_record_ids") == (run.meta or {}).get("bp_record_ids")
    )
    if is_urgent and not was_urgent_today:
        _to_worker(
            db,
            employee,
            "URGENT_WORKER",
            f"Halo {_first_name(employee)}, hasil screening Anda hari ini memerlukan perhatian segera. "
            "Mohon segera menemui petugas kesehatan/klinik terdekat. Akses area khusus dinonaktifkan sementara.",
            related_type="assessment_run",
            related_id=run.id,
            now=now,
        )
        _to_k3(
            db,
            employee,
            "URGENT_K3",
            f"[HBAC] Flag REVIEW SEGERA: pekerja {employee.employee_code} ({employee.unit}). "
            "Perlu tindak lanjut K3/medis hari ini. Detail di dashboard admin.",
            related_type="assessment_run",
            related_id=run.id,
            now=now,
        )

    for c in changes:
        if c.get("auto_revoked_override_id"):
            _to_k3(
                db,
                employee,
                "OVERRIDE_AUTO_REVOKED_K3",
                f"[HBAC] Override akses {AREA_INFO[c['area']]['short']} untuk {employee.employee_code} "
                "dicabut otomatis karena status otomatis memburuk. Mohon tinjau ulang.",
                related_type="access_override",
                related_id=c["auto_revoked_override_id"],
                now=now,
            )


def notify_override_created(db: Session, employee: Employee, ov: AccessOverride) -> None:
    _to_worker(
        db,
        employee,
        "OVERRIDE_CREATED",
        f"Halo {_first_name(employee)}, akses {AREA_INFO[ov.area_code]['short']} Anda diubah oleh admin K3 "
        f"menjadi {STATUS_LABELS.get(ov.new_status, ov.new_status)} s.d. {fmt_local(ov.valid_until)}. "
        "Alasan tercatat di aplikasi.",
        related_type="access_override",
        related_id=ov.id,
    )


def notify_override_ended(db: Session, employee: Employee, ov: AccessOverride, effective_status: str | None) -> None:
    status_txt = STATUS_LABELS.get(effective_status or "", effective_status or "-")
    _to_worker(
        db,
        employee,
        "OVERRIDE_ENDED",
        f"Halo {_first_name(employee)}, perubahan akses {AREA_INFO[ov.area_code]['short']} oleh admin telah berakhir. "
        f"Status kini mengikuti evaluasi otomatis: {status_txt}.",
        related_type="access_override",
        related_id=ov.id,
    )


def notify_verification(db: Session, employee: Employee, what: str, decision: str) -> None:
    word = "diverifikasi" if decision == "VERIFIED" else "ditolak"
    _to_worker(
        db,
        employee,
        "VERIFICATION_RESULT",
        f"Halo {_first_name(employee)}, data {what} Anda telah {word} oleh admin. "
        "Status akses kartu dievaluasi ulang otomatis.",
    )


def send_bp_reminders(db: Session, now: datetime | None = None) -> dict:
    now = now or utcnow()
    today = today_local(now)
    submitted = set(
        db.scalars(select(DailyBPRecord.employee_id).where(DailyBPRecord.record_date == today).distinct())
    )
    reminded = set(
        db.scalars(
            select(NotificationLog.employee_id).where(
                NotificationLog.template == "BP_REMINDER",
                NotificationLog.created_at >= start_of_local_day(today),
            )
        )
    )
    workers = db.scalars(
        select(Employee).join(User, User.employee_id == Employee.id).where(
            User.role == "WORKER", User.is_active.is_(True), Employee.card_active.is_(True)
        )
    ).all()
    sent, skipped = 0, 0
    for emp in workers:
        if emp.id in submitted:
            continue
        if emp.id in reminded:
            skipped += 1
            continue
        _to_worker(
            db,
            emp,
            "BP_REMINDER",
            f"Halo {_first_name(emp)}, Anda belum menginput tensi harian hari ini. "
            "Akses area khusus (Dingin, Panas, Ketinggian, Gas/BBM) tidak aktif sampai screening dilakukan. "
            "Silakan input melalui aplikasi HBAC.",
            now=now,
        )
        sent += 1
    return {"sent": sent, "skipped_already_reminded": skipped}


def count_today(db: Session, now: datetime | None = None) -> int:
    today = today_local(now or utcnow())
    return db.scalar(
        select(func.count(NotificationLog.id)).where(NotificationLog.created_at >= start_of_local_day(today))
    ) or 0
