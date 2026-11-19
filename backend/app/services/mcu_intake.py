"""Alur unggah MCU: baca otomatis (lokal) -> tinjau & koreksi variabel oleh pengguna -> simpan.

Isi dokumen MCU TIDAK dikirim ke layanan AI eksternal (keputusan privasi §6).
"""
from __future__ import annotations

import hashlib
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import write_audit
from ..config import get_settings
from ..constants import MCU_EXTRACTION_LABELS
from ..mcu import parser
from ..mcu.template import FIELDS, TEMPLATE_ID, clean_values, public_template, statuses
from ..models import Employee, McuUpload
from ..timeutil import iso_date, utcnow
from . import DomainError, health_records

UPLOAD_TTL = timedelta(hours=24)
NO_TEXT_MSG = {
    "NO_TEXT": "PDF tidak memiliki lapisan teks (hasil scan). Isi variabel secara manual sesuai dokumen.",
    "IMAGE": "Berkas gambar belum dapat dibaca otomatis (OCR lokal belum tersedia). Isi variabel secara manual sesuai dokumen.",
    "ERROR": "Berkas tidak dapat dibaca. Pastikan PDF tidak rusak/terkunci, atau isi variabel secara manual.",
}


def _empty_values() -> dict:
    return {k: ([] if f["type"] == "list" else None) for k, f in FIELDS.items()}


def review_payload(emp: Employee, up: McuUpload) -> dict:
    ex = up.extracted or {}
    values = {**_empty_values(), **(ex.get("values") or {})}
    return {
        "upload_id": up.id,
        "filename": up.filename,
        "status": up.extraction_status,
        "status_label": MCU_EXTRACTION_LABELS.get(up.extraction_status, up.extraction_status),
        "found_count": ex.get("found_count", 0),
        "template": public_template(),
        "values": values,
        "sources": ex.get("sources", {}),
        "field_status": statuses(values),
        "suggestions": parser.suggestions(values),
        "warnings": ex.get("warnings", []),
        "identity": parser.identity_check(values, emp.full_name, iso_date(emp.birth_date)),
        "profile": {"full_name": emp.full_name, "birth_date": iso_date(emp.birth_date)},
        "suggested": {
            "mcu_date": values.get("mcu_date"),
            "conclusion": parser.map_assessment(values.get("assessment")),
            "provider": values.get("provider") or "",
            "doctor_name": values.get("doctor_name") or "",
            "summary": parser.summary_text(values) if ex.get("found_count") else "",
        },
    }


def extract_upload(db: Session, actor, emp: Employee, filename: str | None, content_type: str | None, data: bytes) -> dict:
    path, safe_name, mime = health_records.save_upload(filename, content_type, data)
    text, st = parser.extract_text(data, mime)
    if st == "OK":
        res = parser.parse_text(text)
        status = "AUTO_PDF" if res["recognized"] else "UNRECOGNIZED"
    else:
        res = {"template_id": TEMPLATE_ID, "recognized": False, "values": _empty_values(), "sources": {},
               "warnings": [NO_TEXT_MSG[st]], "found_count": 0}
        status = {"NO_TEXT": "PDF_NO_TEXT", "IMAGE": "IMAGE_NO_OCR", "ERROR": "ERROR"}[st]
    up = McuUpload(
        id=uuid4().hex,
        employee_id=emp.id,
        uploaded_by_user_id=actor.id,
        file_path=path,
        filename=safe_name,
        mime=mime,
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        extraction_status=status,
        extracted=res,
        created_at=utcnow(),
    )
    db.add(up)
    db.flush()
    write_audit(db, actor, "MCU_DOCUMENT_READ", "mcu_upload", up.id, emp.id, {"status": status, "found": res["found_count"]})
    return review_payload(emp, up)


def confirm(db: Session, actor, emp: Employee, body, by_admin: bool):
    if not body.confirmed:
        raise DomainError("Centang pernyataan bahwa variabel MCU sudah diperiksa sesuai dokumen")
    try:
        details = clean_values(body.details or {})
    except ValueError as exc:
        raise DomainError(str(exc))
    details["mcu_date"] = body.mcu_date.isoformat()
    upload = None
    extracted = None
    edited: list[str] = []
    status = "MANUAL"
    up = None
    if body.upload_id:
        up = db.get(McuUpload, body.upload_id)
        if up is None or up.employee_id != emp.id or up.consumed_at is not None:
            raise DomainError("Berkas unggahan tidak ditemukan atau sudah dipakai — unggah ulang dokumen MCU")
        extracted = (up.extracted or {}).get("values") or {}
        details["nik_masked"] = extracted.get("nik_masked")
        status = up.extraction_status
        if status in ("AUTO_PDF", "UNRECOGNIZED"):
            edited = parser.diff_fields(extracted, details)
        upload = (up.file_path, up.filename, up.mime)
    identity = parser.identity_check(details, emp.full_name, iso_date(emp.birth_date))
    m, run, changes = health_records.create_mcu(
        db,
        actor,
        emp,
        mcu_date=body.mcu_date,
        provider=body.provider or details.get("provider") or "",
        summary=body.summary or parser.summary_text(details),
        conclusion=body.conclusion,
        restricted_areas=body.restricted_areas,
        doctor_name=body.doctor_name or details.get("doctor_name") or "",
        upload=upload,
        by_admin=by_admin,
        details=details,
        extracted=extracted,
        extraction_status=status,
        edited_fields=edited,
        template_id=TEMPLATE_ID,
        identity=identity,
    )
    if up is not None:
        up.consumed_at = utcnow()
        up.mcu_id = m.id
    return m, run, changes


def cleanup_uploads(db: Session, now) -> int:
    """Hapus unggahan yang tidak pernah dikonfirmasi (> 24 jam) beserta berkasnya."""
    stale = db.scalars(
        select(McuUpload).where(McuUpload.consumed_at.is_(None), McuUpload.created_at < now - UPLOAD_TTL)
    ).all()
    base = get_settings().upload_dir.resolve()
    for up in stale:
        p = Path(up.file_path).resolve()
        if base in p.parents and p.exists():
            p.unlink(missing_ok=True)
        db.delete(up)
    return len(stale)
