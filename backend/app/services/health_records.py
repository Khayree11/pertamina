"""Input data kesehatan (tensi, MCU, komorbid) + verifikasi. Setiap perubahan memicu evaluasi ulang."""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import write_audit
from ..config import get_settings
from ..constants import MCU_CONCLUSIONS, REJECTED, SPECIAL_AREAS, UNVERIFIED, VERIFIED
from ..models import AnnualMCU, Comorbidity, DailyBPRecord, Employee
from ..timeutil import today_local, utcnow
from . import DomainError, notifications
from .assessment import run_assessment
from .reasons import get_active_rules

MAX_BP_PER_DAY = 6
ALLOWED_UPLOADS = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}


def submit_bp(db: Session, actor, employee: Employee, systolic: int, diastolic: int, pulse: int | None,
              note: str | None, source: str):
    now = utcnow()
    today = today_local(now)
    count = db.scalar(
        select(func.count(DailyBPRecord.id)).where(
            DailyBPRecord.employee_id == employee.id, DailyBPRecord.record_date == today
        )
    ) or 0
    if count >= MAX_BP_PER_DAY:
        raise DomainError(
            f"Batas {MAX_BP_PER_DAY} kali input tensi per hari tercapai. Hubungi petugas kesehatan untuk pengukuran ulang."
        )
    rec = DailyBPRecord(
        employee_id=employee.id,
        record_date=today,
        measured_at=now,
        systolic=systolic,
        diastolic=diastolic,
        pulse=pulse,
        source=source,
        note=(note or "").strip() or None,
        entered_by_user_id=actor.id,
        created_at=now,
    )
    db.add(rec)
    db.flush()
    write_audit(db, actor, "BP_SUBMITTED", "daily_bp_record", rec.id, employee.id, {"source": source})
    run, changes = run_assessment(db, employee, "BP_SUBMITTED", actor=actor)
    return rec, run, changes


def _parse_areas(raw: str | list | None) -> list[str]:
    if raw is None:
        return []
    items = raw if isinstance(raw, list) else [x for x in str(raw).replace(";", ",").split(",")]
    out = []
    for x in items:
        x = str(x).strip().upper()
        if not x:
            continue
        if x not in SPECIAL_AREAS:
            raise DomainError(f"Area restriksi tidak dikenal: {x}")
        if x not in out:
            out.append(x)
    return out


def save_upload(filename: str | None, content_type: str | None, data: bytes) -> tuple[str, str, str]:
    s = get_settings()
    if not data:
        raise DomainError("Berkas kosong")
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise DomainError(f"Ukuran berkas maksimal {s.max_upload_mb} MB")
    ext = ALLOWED_UPLOADS.get((content_type or "").lower())
    if not ext:
        raise DomainError("Format berkas harus PDF, JPG, atau PNG")
    # Validasi tanda tangan berkas sederhana.
    sig_ok = (ext == ".pdf" and data[:4] == b"%PDF") or (ext == ".png" and data[:8] == b"\x89PNG\r\n\x1a\n") or (
        ext == ".jpg" and data[:3] == b"\xff\xd8\xff"
    )
    if not sig_ok:
        raise DomainError("Isi berkas tidak sesuai dengan formatnya")
    folder = s.upload_dir / "mcu"
    folder.mkdir(parents=True, exist_ok=True)
    stored = folder / f"{uuid.uuid4().hex}{ext}"
    stored.write_bytes(data)
    safe_name = Path(filename or f"dokumen{ext}").name[:200]
    return str(stored), safe_name, content_type or "application/octet-stream"


def create_mcu(
    db: Session,
    actor,
    employee: Employee,
    *,
    mcu_date: date,
    provider: str,
    summary: str,
    conclusion: str,
    restricted_areas,
    doctor_name: str,
    upload: tuple[str, str, str] | None,
    by_admin: bool,
    details: dict | None = None,
    extracted: dict | None = None,
    extraction_status: str | None = None,
    edited_fields: list | None = None,
    template_id: str | None = None,
    identity: dict | None = None,
):
    today = today_local()
    if mcu_date > today:
        raise DomainError("Tanggal MCU tidak boleh di masa depan")
    if mcu_date < today - timedelta(days=5 * 365):
        raise DomainError("Tanggal MCU terlalu lama (lebih dari 5 tahun)")
    if conclusion not in MCU_CONCLUSIONS:
        raise DomainError("Kesimpulan MCU tidak valid")
    if by_admin and conclusion == "PENDING":
        raise DomainError("Input oleh admin harus menetapkan kesimpulan akhir (Fit / Fit dengan restriksi / Unfit)")
    areas = _parse_areas(restricted_areas)
    if conclusion == "FIT_WITH_RESTRICTION" and not areas:
        raise DomainError("Pilih minimal satu area yang direstriksi dokter")
    if conclusion != "FIT_WITH_RESTRICTION":
        areas = []
    if len(summary or "") > 2000:
        raise DomainError("Ringkasan hasil maksimal 2000 karakter")
    now = utcnow()
    m = AnnualMCU(
        employee_id=employee.id,
        mcu_date=mcu_date,
        provider=(provider or "").strip()[:128],
        summary=(summary or "").strip(),
        conclusion=conclusion,
        restricted_areas=areas,
        doctor_name=(doctor_name or "").strip()[:128],
        verification_status=VERIFIED if by_admin else UNVERIFIED,
        verified_by_user_id=actor.id if by_admin else None,
        verified_at=now if by_admin else None,
        verification_note="Diinput langsung oleh admin" if by_admin else None,
        entered_by_user_id=actor.id,
        created_at=now,
        details=details,
        extracted=extracted,
        extraction_status=extraction_status or ("MANUAL" if details else None),
        edited_fields=edited_fields or [],
        template_id=template_id,
        identity_check=identity,
    )
    if upload:
        m.document_path, m.document_filename, m.document_mime = upload
    db.add(m)
    db.flush()
    write_audit(
        db, actor, "MCU_SUBMITTED", "annual_mcu", m.id, employee.id,
        {
            "conclusion": conclusion,
            "restricted_areas": areas,
            "verified": by_admin,
            "has_document": bool(upload),
            "extraction_status": m.extraction_status,
            "edited_fields": m.edited_fields,
        },
    )
    run, changes = run_assessment(db, employee, "MCU_SUBMITTED", actor=actor)
    return m, run, changes


def _catalog_codes(db: Session) -> set[str]:
    return {c["code"] for c in get_active_rules(db).config.get("comorbidity_catalog", [])}


def create_comorbidity(db: Session, actor, employee: Employee, data, by_admin: bool):
    if data.condition_code not in _catalog_codes(db):
        raise DomainError("Kode komorbid tidak ada di daftar terstandar")
    if data.condition_code != "OTHER":
        dup = db.scalars(
            select(Comorbidity).where(
                Comorbidity.employee_id == employee.id,
                Comorbidity.condition_code == data.condition_code,
                Comorbidity.active.is_(True),
                Comorbidity.verification_status != REJECTED,
            )
        ).first()
        if dup:
            raise DomainError("Komorbid ini sudah tercatat aktif. Perbarui data yang ada.")
    now = utcnow()
    c = Comorbidity(
        employee_id=employee.id,
        condition_code=data.condition_code,
        other_label=(data.other_label or "").strip() or None if data.condition_code == "OTHER" else None,
        controlled=bool(data.controlled),
        diagnosed_date=data.diagnosed_date,
        active=True,
        notes=(data.notes or "").strip() or None,
        verification_status=VERIFIED if by_admin else UNVERIFIED,
        verified_by_user_id=actor.id if by_admin else None,
        verified_at=now if by_admin else None,
        verification_note="Diinput langsung oleh admin" if by_admin else None,
        entered_by_user_id=actor.id,
        created_at=now,
        updated_at=now,
    )
    db.add(c)
    employee.comorbid_declared_at = employee.comorbid_declared_at or now
    db.flush()
    write_audit(
        db, actor, "COMORBIDITY_ADDED", "comorbidity", c.id, employee.id,
        {"condition_code": c.condition_code, "controlled": c.controlled, "verified": by_admin},
    )
    run, changes = run_assessment(db, employee, "COMORBID_CHANGED", actor=actor)
    return c, run, changes


def update_comorbidity(db: Session, actor, c: Comorbidity, data, by_admin: bool):
    if not by_admin and c.verification_status != UNVERIFIED:
        raise DomainError("Data yang sudah diverifikasi hanya dapat diubah oleh admin")
    if by_admin and not (data.change_reason or "").strip():
        raise DomainError("Alasan perubahan wajib diisi")
    if data.diagnosed_date and data.diagnosed_date > today_local():
        raise DomainError("Tanggal diagnosis tidak boleh di masa depan")
    before = {"controlled": c.controlled, "active": c.active}
    if data.controlled is not None:
        c.controlled = data.controlled
    if data.active is not None:
        c.active = data.active
    if data.diagnosed_date is not None:
        c.diagnosed_date = data.diagnosed_date
    if data.notes is not None:
        c.notes = data.notes.strip() or None
    c.updated_at = utcnow()
    if by_admin:
        # Perubahan oleh admin dianggap tervalidasi ulang.
        c.verification_status = VERIFIED
        c.verified_by_user_id = actor.id
        c.verified_at = c.updated_at
        c.verification_note = (data.change_reason or "").strip()[:500]
    db.flush()
    employee = db.get(Employee, c.employee_id)
    write_audit(
        db, actor, "COMORBIDITY_UPDATED", "comorbidity", c.id, employee.id,
        {"before": before, "after": {"controlled": c.controlled, "active": c.active}, "reason": data.change_reason},
    )
    run, changes = run_assessment(db, employee, "COMORBID_CHANGED", actor=actor)
    return c, run, changes


def verify_record(
    db: Session, actor, record, kind: str, decision: str, note: str, conclusion: str | None = None, restricted_areas=None
):
    if record.verification_status != UNVERIFIED:
        raise DomainError("Data ini sudah diproses sebelumnya")
    note = (note or "").strip()
    if len(note) < 5:
        raise DomainError("Catatan verifikasi wajib diisi (minimal 5 karakter)")
    extra: dict = {}
    if kind == "annual_mcu" and decision == VERIFIED:
        if record.conclusion == "PENDING" and not conclusion:
            raise DomainError("Dokumen belum memuat penilaian — tetapkan kesimpulan akhir (Fit / Fit dengan restriksi / Unfit)")
        if conclusion:
            areas = _parse_areas(restricted_areas)
            if conclusion == "FIT_WITH_RESTRICTION" and not areas:
                raise DomainError("Pilih minimal satu area yang direstriksi")
            extra = {"conclusion_before": record.conclusion, "conclusion": conclusion, "restricted_areas": areas}
            record.conclusion = conclusion
            record.restricted_areas = areas if conclusion == "FIT_WITH_RESTRICTION" else []
    record.verification_status = decision
    record.verified_by_user_id = actor.id
    record.verified_at = utcnow()
    record.verification_note = note[:500]
    db.flush()
    employee = db.get(Employee, record.employee_id)
    write_audit(
        db, actor, f"{kind.upper()}_VERIFICATION", kind, record.id, employee.id, {"decision": decision, "note": note, **extra}
    )
    notifications.notify_verification(db, employee, "MCU" if kind == "annual_mcu" else "komorbid", decision)
    run, changes = run_assessment(db, employee, "VERIFICATION", actor=actor)
    return run, changes
