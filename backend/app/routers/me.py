"""Endpoint pekerja (data milik sendiri saja)."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import UNVERIFIED
from ..deps import CurrentUser, get_db, require_worker
from ..models import (
    AccessEvent,
    AccessOverride,
    AnnualMCU,
    AssessmentRun,
    Comorbidity,
    DailyBPRecord,
    Employee,
    NotificationLog,
    User,
)
from ..audit import write_audit
from ..mcu.template import public_template
from ..schemas import BPIn, ComorbidityIn, ComorbidityUpdateIn, GeneralProfileIn, McuConfirmIn
from ..security import mask_phone
from ..services import health_records, mcu_intake
from ..services.assessment import run_assessment
from ..services.profile import general_view, onboarding_status
from ..services.facts import active_comorbidities, latest_mcu, todays_bp
from ..services.reasons import get_active_rules
from ..services.views import (
    access_event_view,
    bp_view,
    card_view,
    comorbidity_view,
    employee_basic,
    ftd_view,
    mcu_view,
    notification_view,
    override_view,
    user_names,
)
from ..timeutil import iso, today_local, utcnow

router = APIRouter(prefix="/api/me", tags=["pekerja"])


def _employee(db: Session, user: CurrentUser) -> Employee:
    emp = db.get(Employee, user.employee_id)
    if emp is None:
        raise HTTPException(404, "Data pekerja tidak ditemukan")
    return emp


def _assessment_meta(run: AssessmentRun | None) -> dict | None:
    if run is None:
        return None
    return {
        "id": run.id,
        "assessed_at": iso(run.assessed_at),
        "trigger": run.trigger,
        "rule_version_label": run.rule_version_label,
        "flags": run.flags,
        "valid_until": iso(run.valid_until),
    }


def _bp_stats(records: list[DailyBPRecord], today: date, days: int) -> dict:
    by_day: dict[date, DailyBPRecord] = {}
    for r in records:
        by_day[r.record_date] = r  # pembacaan terakhir per hari
    submitted_days = sum(1 for i in range(days) if (today - timedelta(days=i)) in by_day)
    streak = 0
    d = today if today in by_day else today - timedelta(days=1)
    while d in by_day:
        streak += 1
        d -= timedelta(days=1)
    last7 = [by_day[today - timedelta(days=i)] for i in range(7) if (today - timedelta(days=i)) in by_day]
    return {
        "days": days,
        "submitted_days": submitted_days,
        "compliance_pct": round(100 * submitted_days / days) if days else 0,
        "streak_days": streak,
        "avg7_systolic": round(sum(r.systolic for r in last7) / len(last7)) if last7 else None,
        "avg7_diastolic": round(sum(r.diastolic for r in last7) / len(last7)) if last7 else None,
    }


@router.get("/onboarding")
def onboarding(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    return {"status": onboarding_status(db, emp), "profile": general_view(emp, db.get(User, user.id))}


@router.put("/profile/general")
def update_general(body: GeneralProfileIn, user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    u = db.get(User, user.id)
    if body.email and db.scalar(select(User.id).where(User.email == body.email, User.id != u.id)):
        raise HTTPException(409, "Email sudah dipakai akun lain")
    fields = {
        "full_name": body.full_name,
        "position": body.position.strip(),
        "unit": body.unit.strip(),
        "work_location": body.work_location.strip(),
        "phone": body.phone,
        "birth_date": body.birth_date,
        "gender": body.gender,
        "emergency_contact_name": body.emergency_contact_name.strip(),
        "emergency_contact_phone": body.emergency_contact_phone,
    }
    changed = [k for k, v in fields.items() if getattr(emp, k) != v]
    for k, v in fields.items():
        setattr(emp, k, v)
    u.full_name = body.full_name
    if (u.email or None) != body.email:
        changed.append("email")
    u.email = body.email
    emp.profile_general_done_at = emp.profile_general_done_at or utcnow()
    write_audit(db, user, "PROFILE_GENERAL_UPDATED", "employee", emp.id, emp.id, {"fields": changed})
    db.commit()
    return {"status": onboarding_status(db, emp), "profile": general_view(emp, u)}


@router.post("/onboarding/mcu-defer")
def defer_mcu(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    """MCU wajib, tetapi boleh menyusul. Selama belum ada MCU, area khusus berstatus NEEDS_REVIEW."""
    emp = _employee(db, user)
    emp.mcu_deferred_at = utcnow()
    write_audit(db, user, "MCU_DEFERRED", "employee", emp.id, emp.id, {})
    db.commit()
    return {"status": onboarding_status(db, emp)}


@router.post("/onboarding/comorbid-none")
def comorbid_none(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    if active_comorbidities(db, emp.id):
        raise HTTPException(400, "Anda sudah mencatat komorbid aktif — tidak dapat menyatakan 'tidak ada'.")
    emp.comorbid_declared_at = utcnow()
    write_audit(db, user, "COMORBID_DECLARED_NONE", "employee", emp.id, emp.id, {})
    db.commit()
    return {"status": onboarding_status(db, emp)}


@router.post("/onboarding/complete")
def complete_onboarding(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    st = onboarding_status(db, emp)
    if not st["can_complete"]:
        msg = {
            "general": "Lengkapi data umum terlebih dahulu.",
            "mcu": "Unggah MCU tahunan atau pilih 'isi nanti'.",
            "comorbid": "Isi data komorbid atau nyatakan tidak memiliki komorbid.",
        }[st["next_step"]]
        raise HTTPException(400, msg)
    emp.profile_completed_at = emp.profile_completed_at or utcnow()
    write_audit(db, user, "PROFILE_COMPLETED", "employee", emp.id, emp.id, {"mcu": st["mcu"]})
    run_assessment(db, emp, "PROFILE_COMPLETED", actor=user)
    db.commit()
    return {"status": onboarding_status(db, emp)}


@router.get("/status")
def status(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    """Indikator ringan untuk top bar: sudah screening hari ini? + ringkasan status kartu."""
    emp = _employee(db, user)
    now = utcnow()
    bps = todays_bp(db, emp.id, today_local(now))
    config = get_active_rules(db).config
    cards = card_view(db, emp, config, "worker", now)
    run = db.get(AssessmentRun, emp.latest_run_id) if emp.latest_run_id else None
    return {
        "bp_submitted": bool(bps),
        "readings_today": len(bps),
        "latest_bp_at": iso(bps[-1].measured_at) if bps else None,
        "areas": {c["area"]["code"]: {"status": c["status"], "source": c["source"]} for c in cards},
        "urgent": bool(run and "URGENT_REVIEW" in (run.flags or []) and today_local(run.assessed_at) == today_local(now)),
    }


@router.get("/dashboard")
def dashboard(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    config = get_active_rules(db).config
    now = utcnow()
    today = today_local(now)
    bps = todays_bp(db, emp.id, today)
    run = db.get(AssessmentRun, emp.latest_run_id) if emp.latest_run_id else None
    mcu = latest_mcu(db, emp.id)
    comorbs = active_comorbidities(db, emp.id)
    notifs = db.scalars(
        select(NotificationLog)
        .where(NotificationLog.employee_id == emp.id, NotificationLog.recipient_type == "WORKER")
        .order_by(NotificationLog.created_at.desc())
        .limit(5)
    ).all()
    pending = []
    if not bps:
        pending.append({"type": "BP_MISSING", "label": "Tensi hari ini belum diinput", "href": "/tensi"})
    if mcu is None:
        pending.append({"type": "MCU_MISSING", "label": "MCU tahunan wajib — belum diunggah (gambar/PDF)", "href": "/mcu"})
    elif mcu.verification_status == UNVERIFIED:
        pending.append({"type": "MCU_UNVERIFIED", "label": "MCU menunggu verifikasi admin", "href": "/mcu"})
    for c in comorbs:
        if c.verification_status == UNVERIFIED:
            pending.append({"type": "COMORBID_UNVERIFIED", "label": "Data komorbid menunggu verifikasi", "href": "/komorbid"})
            break
    names = user_names(db, [mcu.verified_by_user_id, mcu.entered_by_user_id] if mcu else [])
    return {
        "employee": {**employee_basic(emp), "phone_masked": mask_phone(emp.phone)},
        "today": {
            "date": today.isoformat(),
            "bp_submitted": bool(bps),
            "latest_bp": bp_view(bps[-1]) if bps else None,
            "readings_count": len(bps),
        },
        "card": card_view(db, emp, config, "worker", now),
        "assessment": _assessment_meta(run),
        "fit_to_drive": ftd_view(run),
        "mcu": mcu_view(mcu, config, names, now) if mcu else None,
        "comorbidities": [comorbidity_view(c, config) for c in comorbs],
        "notifications": [notification_view(n) for n in notifs],
        "pending": pending,
        "disclaimer": config.get("disclaimer"),
    }


@router.get("/profile")
def profile(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    u = db.get(User, user.id)
    config = get_active_rules(db).config
    mcu = latest_mcu(db, emp.id)
    comorbs = active_comorbidities(db, emp.id)
    bp_count = len(db.scalars(select(DailyBPRecord.id).where(DailyBPRecord.employee_id == emp.id)).all())
    return {
        "employee": {**employee_basic(emp), "phone_masked": mask_phone(emp.phone)},
        "general": general_view(emp, u),
        "onboarding": onboarding_status(db, emp),
        "account": {"username": u.username, "role": u.role, "last_login_at": iso(u.last_login_at)},
        "health_summary": {
            "bp_records": bp_count,
            "latest_mcu": mcu_view(mcu, config) if mcu else None,
            "active_comorbidities": [comorbidity_view(c, config) for c in comorbs],
        },
        "privacy": [
            "Data kesehatan Anda hanya dapat dilihat oleh Anda dan admin K3 yang berwenang.",
            "Sistem kartu akses hanya menerima status izin per area, tanpa data medis.",
            "Chatbot AI hanya menerima kategori komorbid generik dan kategori area — tanpa nama, ID, nilai tensi, atau tanggal.",
            "Setiap akses dan perubahan oleh admin tercatat di audit log yang tidak dapat dihapus.",
        ],
    }


@router.get("/bp")
def bp_history(
    days: int = Query(30, ge=1, le=180),
    user: CurrentUser = Depends(require_worker),
    db: Session = Depends(get_db),
):
    emp = _employee(db, user)
    today = today_local()
    since = today - timedelta(days=days - 1)
    records = db.scalars(
        select(DailyBPRecord)
        .where(DailyBPRecord.employee_id == emp.id, DailyBPRecord.record_date >= since)
        .order_by(DailyBPRecord.measured_at)
    ).all()
    return {
        "records": [bp_view(r) for r in reversed(records)],
        "stats": _bp_stats(list(records), today, days),
        "thresholds": {"high": [140, 90], "very_high": [180, 110]},
        "today": today.isoformat(),
    }


@router.post("/bp")
def submit_bp(body: BPIn, user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    rec, run, changes = health_records.submit_bp(
        db, user, emp, body.systolic, body.diastolic, body.pulse, body.note, "SELF"
    )
    db.commit()
    config = get_active_rules(db).config
    return {
        "record": bp_view(rec),
        "card": card_view(db, emp, config, "worker"),
        "changes": [{k: c.get(k) for k in ("area", "old_status", "new_status", "note")} for c in changes],
        "assessment": _assessment_meta(run),
        "fit_to_drive": ftd_view(run),
    }


@router.get("/mcu")
def list_mcu(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    config = get_active_rules(db).config
    rows = db.scalars(
        select(AnnualMCU).where(AnnualMCU.employee_id == emp.id).order_by(AnnualMCU.mcu_date.desc(), AnnualMCU.id.desc())
    ).all()
    names = user_names(db, [r.verified_by_user_id for r in rows] + [r.entered_by_user_id for r in rows])
    current = latest_mcu(db, emp.id)
    return {"items": [mcu_view(r, config, names) for r in rows], "current_id": current.id if current else None}


@router.post("/mcu")
def submit_mcu(
    mcu_date: date = Form(...),
    conclusion: str = Form(...),
    provider: str = Form(""),
    summary: str = Form(""),
    restricted_areas: str = Form(""),
    doctor_name: str = Form(""),
    file: UploadFile | None = File(None),
    user: CurrentUser = Depends(require_worker),
    db: Session = Depends(get_db),
):
    emp = _employee(db, user)
    upload = None
    if file is not None and file.filename:
        data = file.file.read()
        upload = health_records.save_upload(file.filename, file.content_type, data)
    m, run, changes = health_records.create_mcu(
        db, user, emp,
        mcu_date=mcu_date, provider=provider, summary=summary, conclusion=conclusion,
        restricted_areas=restricted_areas, doctor_name=doctor_name, upload=upload, by_admin=False,
    )
    db.commit()
    config = get_active_rules(db).config
    return {"item": mcu_view(m, config), "card": card_view(db, emp, config, "worker"), "assessment": _assessment_meta(run)}


@router.get("/mcu/template")
def mcu_template(user: CurrentUser = Depends(require_worker)):
    return public_template()


@router.post("/mcu/extract")
def mcu_extract(
    file: UploadFile = File(...), user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)
):
    """Baca otomatis dokumen MCU (lokal). Hasilnya ditinjau & dikoreksi pengguna sebelum disimpan."""
    emp = _employee(db, user)
    review = mcu_intake.extract_upload(db, user, emp, file.filename, file.content_type, file.file.read())
    db.commit()
    return review


@router.post("/mcu/confirm")
def mcu_confirm(body: McuConfirmIn, user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    m, run, _ = mcu_intake.confirm(db, user, emp, body, by_admin=False)
    db.commit()
    config = get_active_rules(db).config
    return {"item": mcu_view(m, config), "card": card_view(db, emp, config, "worker"), "assessment": _assessment_meta(run)}


@router.get("/comorbidities")
def list_comorbidities(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    config = get_active_rules(db).config
    rows = db.scalars(
        select(Comorbidity).where(Comorbidity.employee_id == emp.id).order_by(Comorbidity.active.desc(), Comorbidity.id.desc())
    ).all()
    names = user_names(db, [r.verified_by_user_id for r in rows] + [r.entered_by_user_id for r in rows])
    return {"items": [comorbidity_view(r, config, names) for r in rows], "catalog": config.get("comorbidity_catalog", [])}


@router.post("/comorbidities")
def add_comorbidity(body: ComorbidityIn, user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    c, run, _ = health_records.create_comorbidity(db, user, emp, body, by_admin=False)
    db.commit()
    config = get_active_rules(db).config
    return {"item": comorbidity_view(c, config), "card": card_view(db, emp, config, "worker"), "assessment": _assessment_meta(run)}


@router.patch("/comorbidities/{cid}")
def update_comorbidity(
    cid: int, body: ComorbidityUpdateIn, user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)
):
    emp = _employee(db, user)
    c = db.get(Comorbidity, cid)
    if c is None or c.employee_id != emp.id:
        raise HTTPException(404, "Data komorbid tidak ditemukan")
    c, run, _ = health_records.update_comorbidity(db, user, c, body, by_admin=False)
    db.commit()
    config = get_active_rules(db).config
    return {"item": comorbidity_view(c, config), "card": card_view(db, emp, config, "worker"), "assessment": _assessment_meta(run)}


@router.get("/card")
def card(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    config = get_active_rules(db).config
    run = db.get(AssessmentRun, emp.latest_run_id) if emp.latest_run_id else None
    ovs = db.scalars(
        select(AccessOverride).where(AccessOverride.employee_id == emp.id).order_by(AccessOverride.created_at.desc()).limit(10)
    ).all()
    names = user_names(db, [o.admin_user_id for o in ovs] + [o.ended_by_user_id for o in ovs])
    events = db.scalars(
        select(AccessEvent).where(AccessEvent.employee_id == emp.id).order_by(AccessEvent.created_at.desc()).limit(10)
    ).all()
    return {
        "employee": employee_basic(emp),
        "card": card_view(db, emp, config, "worker"),
        "assessment": _assessment_meta(run),
        "fit_to_drive": ftd_view(run),
        "overrides": [override_view(o, names) for o in ovs],
        "access_events": [access_event_view(e) for e in events],
        "disclaimer": config.get("disclaimer"),
    }


@router.get("/notifications")
def notifications_list(user: CurrentUser = Depends(require_worker), db: Session = Depends(get_db)):
    emp = _employee(db, user)
    rows = db.scalars(
        select(NotificationLog)
        .where(NotificationLog.employee_id == emp.id, NotificationLog.recipient_type == "WORKER")
        .order_by(NotificationLog.created_at.desc())
        .limit(50)
    ).all()
    return {"items": [notification_view(n) for n in rows], "phone_masked": mask_phone(emp.phone)}
