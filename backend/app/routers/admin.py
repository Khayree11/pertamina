"""Endpoint admin: monitoring, verifikasi, override akses, aturan, notifikasi, integrasi, audit."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..ai import gemini
from ..ai.ingest import ingest_directory, rebuild_index, upsert_document
from ..ai.retriever import get_index
from ..audit import verify_chain, write_audit
from ..config import get_settings
from ..constants import (
    NEEDS_REVIEW,
    OV_ACTIVE,
    REJECTED,
    ROLE_WORKER,
    SPECIAL_AREAS,
    STATUS_LABELS,
    UNVERIFIED,
)
from ..db import WRITE_LOCK, db_label, engine
from ..deps import CurrentUser, get_db, get_db_nolock, require_admin
from ..models import (
    AccessEvent,
    AccessOverride,
    AcsSyncLog,
    AnnualMCU,
    AssessmentResult,
    AssessmentRun,
    AuditLog,
    CardAccess,
    ChatLog,
    Chunk,
    Comorbidity,
    DailyBPRecord,
    Document,
    Employee,
    NotificationLog,
    RuleVersion,
    User,
)
from ..rules.engine import evaluate
from ..rules.validation import validate_config
from ..schemas import (
    BPIn,
    CardStatusIn,
    ComorbidityIn,
    ComorbidityUpdateIn,
    OutageIn,
    OverrideIn,
    RevokeIn,
    RuleActivateIn,
    RulePreviewIn,
    RuleVersionIn,
    UrgentAckIn,
    VerifyIn,
    WhatsAppSettingsIn,
    WhatsAppTestIn,
)
from ..security import mask_phone
from ..schemas import McuConfirmIn
from ..services import acs, health_records, mcu_intake, notifications, overrides, whatsapp
from ..services.profile import general_view, onboarding_status
from ..services.assessment import reassess_all, run_assessment
from ..services.card_access import refresh_effective
from ..services.facts import build_facts, mcu_valid_through
from ..services.notifications import TEMPLATE_LABELS
from ..services.reasons import describe_reason, get_active_rules
from ..services.views import (
    access_event_view,
    area_meta,
    audit_view,
    bp_view,
    card_view,
    comorbidity_view,
    effective_now,
    employee_basic,
    mcu_view,
    notification_view,
    override_view,
    user_names,
)
from ..timeutil import iso, start_of_local_day, today_local, utcnow

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _employee(db: Session, eid: int) -> Employee:
    emp = db.get(Employee, eid)
    if emp is None:
        raise HTTPException(404, "Pekerja tidak ditemukan")
    return emp


def _workers(db: Session) -> list[Employee]:
    return list(
        db.scalars(
            select(Employee)
            .join(User, User.employee_id == Employee.id)
            .where(User.role == ROLE_WORKER)
            .order_by(Employee.employee_code)
        )
    )


def _employee_rows(db: Session, now: datetime, config: dict) -> list[dict]:
    today = today_local(now)
    emps = _workers(db)
    ids = [e.id for e in emps]
    bp_latest: dict[int, DailyBPRecord] = {}
    bp_count: Counter = Counter()
    for b in db.scalars(
        select(DailyBPRecord)
        .where(DailyBPRecord.record_date == today, DailyBPRecord.employee_id.in_(ids))
        .order_by(DailyBPRecord.measured_at)
    ):
        bp_latest[b.employee_id] = b
        bp_count[b.employee_id] += 1
    cards: dict[int, dict[str, CardAccess]] = defaultdict(dict)
    for ca in db.scalars(select(CardAccess).where(CardAccess.employee_id.in_(ids))):
        cards[ca.employee_id][ca.area_code] = ca
    run_ids = [e.latest_run_id for e in emps if e.latest_run_id]
    runs = {r.id: r for r in db.scalars(select(AssessmentRun).where(AssessmentRun.id.in_(run_ids)))} if run_ids else {}
    mcu_by: dict[int, AnnualMCU] = {}
    for m in db.scalars(
        select(AnnualMCU)
        .where(AnnualMCU.employee_id.in_(ids), AnnualMCU.verification_status != REJECTED)
        .order_by(AnnualMCU.mcu_date.desc(), AnnualMCU.id.desc())
    ):
        mcu_by.setdefault(m.employee_id, m)
    pending: Counter = Counter()
    for (eid,) in db.execute(select(AnnualMCU.employee_id).where(AnnualMCU.verification_status == UNVERIFIED)):
        pending[eid] += 1
    for (eid,) in db.execute(
        select(Comorbidity.employee_id).where(Comorbidity.verification_status == UNVERIFIED, Comorbidity.active.is_(True))
    ):
        pending[eid] += 1
    active_ov: Counter = Counter()
    for (eid,) in db.execute(
        select(AccessOverride.employee_id).where(AccessOverride.state == OV_ACTIVE, AccessOverride.valid_until > now)
    ):
        active_ov[eid] += 1
    validity = int(config.get("settings", {}).get("mcu_validity_days", 365))

    rows = []
    for e in emps:
        areas = {}
        for a in SPECIAL_AREAS:
            ca = cards[e.id].get(a)
            if ca is None:
                areas[a] = {"status": "DENIED", "source": "AUTO", "valid_until": None}
                continue
            st, src, _codes, vu = effective_now(ca, now)
            areas[a] = {"status": st, "source": src, "valid_until": iso(vu)}
        run = runs.get(e.latest_run_id)
        urgent = bool(run and "URGENT_REVIEW" in (run.flags or []) and today_local(run.assessed_at) == today)
        m = mcu_by.get(e.id)
        if m is None:
            mcu_status = "MISSING"
        elif m.verification_status == UNVERIFIED:
            mcu_status = "UNVERIFIED"
        elif today > mcu_valid_through(m, validity):
            mcu_status = "EXPIRED"
        else:
            mcu_status = "VALID"
        b = bp_latest.get(e.id)
        rows.append(
            {
                **employee_basic(e),
                "bp_today": {
                    "submitted": b is not None,
                    "count": bp_count[e.id],
                    "latest": bp_view(b) if b else None,
                },
                "areas": areas,
                "urgent": urgent,
                "urgent_acknowledged": bool(urgent and run.urgent_ack_at),
                "latest_run_id": e.latest_run_id,
                "mcu": {
                    "status": mcu_status,
                    "mcu_date": m.mcu_date.isoformat() if m else None,
                    "valid_through": mcu_valid_through(m, validity).isoformat() if m else None,
                },
                "pending_verifications": pending[e.id],
                "active_overrides": active_ov[e.id],
            }
        )
    return rows


def run_view(db: Session, run: AssessmentRun) -> dict:
    rv = db.get(RuleVersion, run.rule_version_id)
    cfg = rv.config if rv else {}
    results = db.scalars(select(AssessmentResult).where(AssessmentResult.run_id == run.id)).all()
    areas = {}
    for r in results:
        areas[r.area_code] = {
            "status": r.status,
            "status_label": STATUS_LABELS.get(r.status, r.status),
            "decisive": [describe_reason(c, cfg) for c in (r.decisive or [])],
            "reasons": [{**x, "label": describe_reason(x["reason"], cfg)["short"]} for x in (r.reasons or [])],
        }
    names = user_names(db, [run.urgent_ack_by_user_id, run.actor_user_id])
    return {
        "id": run.id,
        "assessed_at": iso(run.assessed_at),
        "trigger": run.trigger,
        "actor": names.get(run.actor_user_id) if run.actor_user_id else "Sistem",
        "rule_version_id": run.rule_version_id,
        "rule_version_label": run.rule_version_label,
        "facts": run.facts,
        "meta": run.meta,
        "trace": run.trace,
        "flags": run.flags,
        "areas": areas,
        "valid_until": iso(run.valid_until),
        "engine_error": run.engine_error,
        "urgent_ack": {
            "at": iso(run.urgent_ack_at),
            "by": names.get(run.urgent_ack_by_user_id),
            "note": run.urgent_ack_note,
        }
        if run.urgent_ack_at
        else None,
    }


# ------------------------------------------------------------------ dashboard


@router.get("/badge")
def badge(db: Session = Depends(get_db)):
    """Hitungan ringan untuk badge navigasi admin."""
    now = utcnow()
    today = today_local(now)
    emps = _workers(db)
    ids = [e.id for e in emps]
    needs = 0
    for ca in db.scalars(select(CardAccess).where(CardAccess.employee_id.in_(ids))):
        if effective_now(ca, now)[0] == NEEDS_REVIEW:
            needs += 1
    run_ids = [e.latest_run_id for e in emps if e.latest_run_id]
    urgent = 0
    if run_ids:
        for r in db.scalars(select(AssessmentRun).where(AssessmentRun.id.in_(run_ids))):
            if "URGENT_REVIEW" in (r.flags or []) and today_local(r.assessed_at) == today and not r.urgent_ack_at:
                urgent += 1
    pending = (db.scalar(select(func.count(AnnualMCU.id)).where(AnnualMCU.verification_status == UNVERIFIED)) or 0) + (
        db.scalar(
            select(func.count(Comorbidity.id)).where(
                Comorbidity.verification_status == UNVERIFIED, Comorbidity.active.is_(True)
            )
        )
        or 0
    )
    return {"urgent": urgent, "needs_review_pairs": needs, "pending_verifications": pending, "total": urgent + needs + pending}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    now = utcnow()
    today = today_local(now)
    config = get_active_rules(db).config
    rows = _employee_rows(db, now, config)
    total = len(rows)
    submitted = sum(1 for r in rows if r["bp_today"]["submitted"])
    area_summary = {a: dict(Counter(r["areas"][a]["status"] for r in rows)) for a in SPECIAL_AREAS}
    needs_review_pairs = sum(1 for r in rows for a in SPECIAL_AREAS if r["areas"][a]["status"] == NEEDS_REVIEW)
    workers_review = sum(1 for r in rows if any(r["areas"][a]["status"] == NEEDS_REVIEW for a in SPECIAL_AREAS))
    urgent = [r for r in rows if r["urgent"] and not r["urgent_acknowledged"]]
    start = start_of_local_day(today)
    taps = db.scalars(select(AccessEvent).where(AccessEvent.created_at >= start)).all()
    since = today - timedelta(days=13)
    per_day = dict(
        db.execute(
            select(DailyBPRecord.record_date, func.count(func.distinct(DailyBPRecord.employee_id)))
            .where(DailyBPRecord.record_date >= since)
            .group_by(DailyBPRecord.record_date)
        ).all()
    )
    trend = []
    for i in range(14):
        d = since + timedelta(days=i)
        n = int(per_day.get(d, 0))
        trend.append({"date": d.isoformat(), "submitted": n, "total": total, "pct": round(100 * n / total) if total else 0})
    recent_audit = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(8)).all()
    recent_taps = db.scalars(select(AccessEvent).order_by(AccessEvent.created_at.desc()).limit(8)).all()
    return {
        "date": today.isoformat(),
        "kpi": {
            "total_workers": total,
            "bp_submitted_today": submitted,
            "bp_missing_today": total - submitted,
            "compliance_pct": round(100 * submitted / total) if total else 0,
            "needs_review_pairs": needs_review_pairs,
            "workers_needing_review": workers_review,
            "urgent_flags": len(urgent),
            "active_overrides": sum(r["active_overrides"] for r in rows),
            "pending_verifications": sum(r["pending_verifications"] for r in rows),
            "taps_today": len(taps),
            "taps_denied_today": sum(1 for t in taps if t.result == "DENIED"),
            "notifications_today": notifications.count_today(db, now),
        },
        "area_summary": area_summary,
        "missing_bp": [
            {k: r[k] for k in ("id", "employee_code", "full_name", "unit", "position")}
            for r in rows
            if not r["bp_today"]["submitted"]
        ],
        "urgent": [{k: r[k] for k in ("id", "employee_code", "full_name", "unit", "latest_run_id")} for r in urgent],
        "compliance_trend": trend,
        "recent_audit": [audit_view(a) for a in recent_audit],
        "recent_taps": [access_event_view(t) for t in recent_taps],
    }


# ------------------------------------------------------------------ pekerja


@router.get("/employees")
def employees(
    q: str = "",
    unit: str = "",
    screening: str = "",
    area: str = "",
    status: str = "",
    flag: str = "",
    db: Session = Depends(get_db),
):
    now = utcnow()
    config = get_active_rules(db).config
    rows = _employee_rows(db, now, config)
    units = sorted({r["unit"] for r in rows if r["unit"]})
    ql = q.strip().lower()
    out = []
    for r in rows:
        if ql and ql not in f"{r['full_name']} {r['employee_code']} {r['card_number']} {r['position']}".lower():
            continue
        if unit and r["unit"] != unit:
            continue
        if screening == "submitted" and not r["bp_today"]["submitted"]:
            continue
        if screening == "missing" and r["bp_today"]["submitted"]:
            continue
        if area and status and r["areas"].get(area, {}).get("status") != status:
            continue
        if not area and status and not any(v["status"] == status for v in r["areas"].values()):
            continue
        if flag == "urgent" and not r["urgent"]:
            continue
        if flag == "override" and not r["active_overrides"]:
            continue
        if flag == "pending" and not r["pending_verifications"]:
            continue
        out.append(r)
    return {"items": out, "units": units, "total": len(rows)}


@router.get("/employees/{eid}")
def employee_detail(eid: int, db: Session = Depends(get_db)):
    emp = _employee(db, eid)
    now = utcnow()
    config = get_active_rules(db).config
    user = db.scalars(select(User).where(User.employee_id == emp.id)).first()
    run = db.get(AssessmentRun, emp.latest_run_id) if emp.latest_run_id else None
    since = today_local(now) - timedelta(days=29)
    bps = db.scalars(
        select(DailyBPRecord)
        .where(DailyBPRecord.employee_id == emp.id, DailyBPRecord.record_date >= since)
        .order_by(DailyBPRecord.measured_at.desc())
    ).all()
    mcus = db.scalars(
        select(AnnualMCU).where(AnnualMCU.employee_id == emp.id).order_by(AnnualMCU.mcu_date.desc(), AnnualMCU.id.desc())
    ).all()
    comorbs = db.scalars(
        select(Comorbidity).where(Comorbidity.employee_id == emp.id).order_by(Comorbidity.active.desc(), Comorbidity.id.desc())
    ).all()
    ovs = db.scalars(
        select(AccessOverride).where(AccessOverride.employee_id == emp.id).order_by(AccessOverride.created_at.desc()).limit(20)
    ).all()
    notifs = db.scalars(
        select(NotificationLog).where(NotificationLog.employee_id == emp.id).order_by(NotificationLog.created_at.desc()).limit(20)
    ).all()
    events = db.scalars(
        select(AccessEvent).where(AccessEvent.employee_id == emp.id).order_by(AccessEvent.created_at.desc()).limit(20)
    ).all()
    audits = db.scalars(
        select(AuditLog).where(AuditLog.employee_id == emp.id).order_by(AuditLog.id.desc()).limit(30)
    ).all()
    names = user_names(
        db,
        [m.verified_by_user_id for m in mcus]
        + [m.entered_by_user_id for m in mcus]
        + [c.verified_by_user_id for c in comorbs]
        + [c.entered_by_user_id for c in comorbs]
        + [o.admin_user_id for o in ovs]
        + [o.ended_by_user_id for o in ovs],
    )
    return {
        "employee": {**employee_basic(emp), "phone_masked": mask_phone(emp.phone)},
        "general": general_view(emp, user),
        "onboarding": onboarding_status(db, emp),
        "account": {"username": user.username, "last_login_at": iso(user.last_login_at)} if user else None,
        "card": card_view(db, emp, config, "admin", now),
        "latest_run": run_view(db, run) if run else None,
        "bp_history": [bp_view(b) for b in bps],
        "mcu": [mcu_view(m, config, names, now) for m in mcus],
        "comorbidities": [comorbidity_view(c, config, names) for c in comorbs],
        "overrides": [override_view(o, names) for o in ovs],
        "notifications": [notification_view(n) for n in notifs],
        "access_events": [access_event_view(e) for e in events],
        "audit": [audit_view(a) for a in audits],
        "settings": config.get("settings", {}),
    }


@router.post("/employees/{eid}/bp")
def officer_bp(eid: int, body: BPIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    emp = _employee(db, eid)
    rec, run, changes = health_records.submit_bp(
        db, admin, emp, body.systolic, body.diastolic, body.pulse, body.note, "OFFICER"
    )
    db.commit()
    return {"record": bp_view(rec), "changes": [{k: c.get(k) for k in ("area", "old_status", "new_status")} for c in changes]}


@router.post("/employees/{eid}/mcu")
def admin_mcu(
    eid: int,
    mcu_date: date = Form(...),
    conclusion: str = Form(...),
    provider: str = Form(""),
    summary: str = Form(""),
    restricted_areas: str = Form(""),
    doctor_name: str = Form(""),
    file: UploadFile | None = File(None),
    admin: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    emp = _employee(db, eid)
    upload = None
    if file is not None and file.filename:
        upload = health_records.save_upload(file.filename, file.content_type, file.file.read())
    m, run, _ = health_records.create_mcu(
        db, admin, emp,
        mcu_date=mcu_date, provider=provider, summary=summary, conclusion=conclusion,
        restricted_areas=restricted_areas, doctor_name=doctor_name, upload=upload, by_admin=True,
    )
    db.commit()
    return {"item": mcu_view(m, get_active_rules(db).config)}


@router.post("/employees/{eid}/mcu/extract")
def admin_mcu_extract(
    eid: int, file: UploadFile = File(...), admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)
):
    emp = _employee(db, eid)
    review = mcu_intake.extract_upload(db, admin, emp, file.filename, file.content_type, file.file.read())
    db.commit()
    return review


@router.post("/employees/{eid}/mcu/confirm")
def admin_mcu_confirm(eid: int, body: McuConfirmIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    emp = _employee(db, eid)
    m, _, _ = mcu_intake.confirm(db, admin, emp, body, by_admin=True)
    db.commit()
    return {"item": mcu_view(m, get_active_rules(db).config)}


@router.post("/employees/{eid}/comorbidities")
def admin_add_comorbidity(
    eid: int, body: ComorbidityIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)
):
    emp = _employee(db, eid)
    c, _, _ = health_records.create_comorbidity(db, admin, emp, body, by_admin=True)
    db.commit()
    return {"item": comorbidity_view(c, get_active_rules(db).config)}


@router.patch("/comorbidities/{cid}")
def admin_update_comorbidity(
    cid: int, body: ComorbidityUpdateIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)
):
    c = db.get(Comorbidity, cid)
    if c is None:
        raise HTTPException(404, "Data komorbid tidak ditemukan")
    c, _, _ = health_records.update_comorbidity(db, admin, c, body, by_admin=True)
    db.commit()
    return {"item": comorbidity_view(c, get_active_rules(db).config)}


@router.post("/mcu/{mid}/verify")
def verify_mcu(mid: int, body: VerifyIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    m = db.get(AnnualMCU, mid)
    if m is None:
        raise HTTPException(404, "Data MCU tidak ditemukan")
    health_records.verify_record(
        db, admin, m, "annual_mcu", body.decision, body.note, conclusion=body.conclusion, restricted_areas=body.restricted_areas
    )
    db.commit()
    return {"item": mcu_view(m, get_active_rules(db).config)}


@router.post("/comorbidities/{cid}/verify")
def verify_comorbidity(
    cid: int, body: VerifyIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)
):
    c = db.get(Comorbidity, cid)
    if c is None:
        raise HTTPException(404, "Data komorbid tidak ditemukan")
    health_records.verify_record(db, admin, c, "comorbidity", body.decision, body.note)
    db.commit()
    return {"item": comorbidity_view(c, get_active_rules(db).config)}


@router.post("/employees/{eid}/reassess")
def reassess(eid: int, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    emp = _employee(db, eid)
    run, changes = run_assessment(db, emp, "ADMIN_REASSESS", actor=admin)
    db.commit()
    return {"run": run_view(db, run), "changes": [{k: c.get(k) for k in ("area", "old_status", "new_status")} for c in changes]}


@router.post("/reassess-all")
def reassess_everyone(admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    n = reassess_all(db, "ADMIN_REASSESS", actor=admin, notify=True)
    db.commit()
    return {"reassessed": n}


@router.post("/employees/{eid}/card-status")
def set_card_status(
    eid: int, body: CardStatusIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)
):
    emp = _employee(db, eid)
    now = utcnow()
    emp.card_active = body.card_active
    changes = refresh_effective(db, emp, now)
    acs.sync_employee(db, emp, get_active_rules(db).config.get("settings", {}), now)
    write_audit(db, admin, "CARD_STATUS_SET", "employee", emp.id, emp.id, {"card_active": body.card_active, "reason": body.reason})
    db.commit()
    return {"card_active": emp.card_active, "changes": changes}


@router.post("/runs/{run_id}/ack-urgent")
def ack_urgent(run_id: str, body: UrgentAckIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    run = db.get(AssessmentRun, run_id)
    if run is None or "URGENT_REVIEW" not in (run.flags or []):
        raise HTTPException(404, "Flag review segera tidak ditemukan")
    if run.urgent_ack_at:
        raise HTTPException(400, "Flag ini sudah ditindaklanjuti")
    run.urgent_ack_at = utcnow()
    run.urgent_ack_by_user_id = admin.id
    run.urgent_ack_note = body.note.strip()
    write_audit(db, admin, "URGENT_ACKNOWLEDGED", "assessment_run", run.id, run.employee_id, {"note": body.note})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ antrian review


@router.get("/review-queue")
def review_queue(db: Session = Depends(get_db)):
    now = utcnow()
    today = today_local(now)
    config = get_active_rules(db).config
    emps = {e.id: e for e in _workers(db)}
    needs = []
    for ca in db.scalars(select(CardAccess).where(CardAccess.employee_id.in_(list(emps)))):
        st, src, codes, _vu = effective_now(ca, now)
        if st == NEEDS_REVIEW:
            needs.append(
                {
                    "employee": employee_basic(emps[ca.employee_id]),
                    "area": area_meta(ca.area_code),
                    "source": src,
                    "reasons": [describe_reason(c, config) for c in codes],
                    "since": iso(ca.auto_valid_from),
                }
            )
    needs.sort(key=lambda x: (x["employee"]["employee_code"], SPECIAL_AREAS.index(x["area"]["code"])))
    urgent = []
    for e in emps.values():
        run = db.get(AssessmentRun, e.latest_run_id) if e.latest_run_id else None
        if run and "URGENT_REVIEW" in (run.flags or []) and today_local(run.assessed_at) == today:
            urgent.append(
                {
                    "employee": employee_basic(e),
                    "run_id": run.id,
                    "assessed_at": iso(run.assessed_at),
                    "bp": {"systolic": run.facts.get("bp.systolic"), "diastolic": run.facts.get("bp.diastolic")},
                    "acknowledged": bool(run.urgent_ack_at),
                    "ack_note": run.urgent_ack_note,
                }
            )
    pend_mcu = db.scalars(select(AnnualMCU).where(AnnualMCU.verification_status == UNVERIFIED).order_by(AnnualMCU.created_at)).all()
    pend_com = db.scalars(
        select(Comorbidity)
        .where(Comorbidity.verification_status == UNVERIFIED, Comorbidity.active.is_(True))
        .order_by(Comorbidity.created_at)
    ).all()
    allemps = {e.id: e for e in db.scalars(select(Employee))}
    return {
        "urgent": urgent,
        "needs_review": needs,
        "pending_mcu": [{**mcu_view(m, config), "employee": employee_basic(allemps[m.employee_id])} for m in pend_mcu],
        "pending_comorbidities": [
            {**comorbidity_view(c, config), "employee": employee_basic(allemps[c.employee_id])} for c in pend_com
        ],
    }


# ------------------------------------------------------------------ override


@router.get("/overrides")
def list_overrides(
    state: str = "", employee_id: int | None = None, limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)
):
    stmt = select(AccessOverride).order_by(AccessOverride.created_at.desc()).limit(limit)
    if state:
        stmt = stmt.where(AccessOverride.state == state)
    if employee_id:
        stmt = stmt.where(AccessOverride.employee_id == employee_id)
    rows = db.scalars(stmt).all()
    names = user_names(db, [o.admin_user_id for o in rows] + [o.ended_by_user_id for o in rows])
    emps = {e.id: e for e in db.scalars(select(Employee).where(Employee.id.in_([o.employee_id for o in rows])))}
    return {"items": [{**override_view(o, names), "employee": employee_basic(emps[o.employee_id])} for o in rows]}


@router.post("/overrides")
def create_override(body: OverrideIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    emp = _employee(db, body.employee_id)
    ov = overrides.create_override(
        db, admin, emp, body.area_code, body.new_status, body.duration_minutes, body.reason, body.kind, body.risk_acknowledged
    )
    db.commit()
    names = user_names(db, [ov.admin_user_id])
    return {"item": override_view(ov, names), "card": card_view(db, emp, get_active_rules(db).config, "admin")}


@router.post("/overrides/{oid}/revoke")
def revoke_override(oid: int, body: RevokeIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    ov = db.get(AccessOverride, oid)
    if ov is None:
        raise HTTPException(404, "Override tidak ditemukan")
    overrides.revoke_override(db, admin, ov, body.reason)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ aturan


def _rule_summary(rv: RuleVersion, names: dict[int, str]) -> dict:
    return {
        "id": rv.id,
        "version": rv.version,
        "label": rv.label,
        "status": rv.status,
        "notes": rv.notes,
        "created_at": iso(rv.created_at),
        "created_by": names.get(rv.created_by_user_id, "Sistem"),
        "activated_at": iso(rv.activated_at),
        "activated_by": names.get(rv.activated_by_user_id) if rv.activated_by_user_id else None,
        "approved_by_name": rv.approved_by_name,
        "approval_note": rv.approval_note,
        "rule_count": len((rv.config or {}).get("rules", [])),
    }


@router.get("/rules")
def rules_list(db: Session = Depends(get_db)):
    rows = db.scalars(select(RuleVersion).order_by(RuleVersion.version.desc())).all()
    names = user_names(db, [r.created_by_user_id for r in rows] + [r.activated_by_user_id for r in rows])
    return {"items": [_rule_summary(r, names) for r in rows]}


@router.get("/rules/{rid}")
def rule_detail(rid: int, db: Session = Depends(get_db)):
    rv = db.get(RuleVersion, rid)
    if rv is None:
        raise HTTPException(404, "Versi aturan tidak ditemukan")
    names = user_names(db, [rv.created_by_user_id, rv.activated_by_user_id])
    return {**_rule_summary(rv, names), "config": rv.config}


def _invalid(errors: list[str]):
    return JSONResponse(status_code=422, content={"detail": "Konfigurasi aturan tidak valid", "errors": errors})


@router.post("/rules")
def create_rule_version(body: RuleVersionIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    errors = validate_config(body.config)
    if errors:
        return _invalid(errors)
    last = db.scalar(select(func.max(RuleVersion.version))) or 0
    cfg = dict(body.config)
    cfg["label"] = body.label
    rv = RuleVersion(
        version=last + 1,
        label=body.label,
        config=cfg,
        status="DRAFT",
        notes=body.notes,
        created_by_user_id=admin.id,
        created_at=utcnow(),
    )
    db.add(rv)
    db.flush()
    write_audit(db, admin, "RULE_VERSION_CREATED", "rule_version", rv.id, None, {"version": rv.version, "label": rv.label})
    db.commit()
    return _rule_summary(rv, user_names(db, [admin.id]))


@router.post("/rules/preview")
def preview_rules(body: RulePreviewIn, db: Session = Depends(get_db)):
    """Simulasi dampak aturan draft terhadap semua pekerja (tanpa menyimpan apa pun)."""
    errors = validate_config(body.config)
    if errors:
        return _invalid(errors)
    now = utcnow()
    active = get_active_rules(db).config
    diffs, unchanged = [], 0
    for emp in _workers(db):
        f_cur, _ = build_facts(db, emp, active, now)
        f_new, _ = build_facts(db, emp, body.config, now)
        cur = evaluate(active, f_cur)["areas"]
        new = evaluate(body.config, f_new)["areas"]
        for a in SPECIAL_AREAS:
            c = cur.get(a, {}).get("status")
            n = new.get(a, {}).get("status")
            if c != n:
                diffs.append(
                    {
                        "employee": employee_basic(emp),
                        "area": area_meta(a),
                        "current": c,
                        "draft": n,
                        "draft_reasons": [describe_reason(x, body.config)["short"] for x in new.get(a, {}).get("decisive", [])],
                    }
                )
            else:
                unchanged += 1
    return {"changes": diffs, "unchanged_pairs": unchanged, "evaluated_at": iso(now)}


@router.post("/rules/{rid}/activate")
def activate_rules(rid: int, body: RuleActivateIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    rv = db.get(RuleVersion, rid)
    if rv is None:
        raise HTTPException(404, "Versi aturan tidak ditemukan")
    if rv.status == "ACTIVE":
        raise HTTPException(400, "Versi ini sudah aktif")
    errors = validate_config(rv.config)
    if errors:
        return _invalid(errors)
    now = utcnow()
    for other in db.scalars(select(RuleVersion).where(RuleVersion.status == "ACTIVE")):
        other.status = "RETIRED"
    rv.status = "ACTIVE"
    rv.activated_at = now
    rv.activated_by_user_id = admin.id
    rv.approved_by_name = body.approved_by_name.strip()
    rv.approval_note = body.approval_note.strip()
    db.flush()
    write_audit(
        db, admin, "RULE_VERSION_ACTIVATED", "rule_version", rv.id, None,
        {"version": rv.version, "approved_by_name": rv.approved_by_name, "approval_note": rv.approval_note},
    )
    n = reassess_all(db, "RULES_ACTIVATED", actor=admin, notify=True)
    db.commit()
    return {"activated": rv.version, "reassessed": n}


# ------------------------------------------------------------------ notifikasi


@router.get("/notifications")
def list_notifications(
    employee_id: int | None = None,
    template: str = "",
    recipient_type: str = "",
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(NotificationLog).order_by(NotificationLog.created_at.desc()).limit(limit)
    if employee_id:
        stmt = stmt.where(NotificationLog.employee_id == employee_id)
    if template:
        stmt = stmt.where(NotificationLog.template == template)
    if recipient_type:
        stmt = stmt.where(NotificationLog.recipient_type == recipient_type)
    return {"items": [notification_view(n) for n in db.scalars(stmt)], "templates": TEMPLATE_LABELS}


@router.post("/notifications/remind-missing-bp")
def remind_missing(admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    result = notifications.send_bp_reminders(db)
    write_audit(db, admin, "BP_REMINDERS_SENT", "notification", None, None, result)
    db.commit()
    return result


# ------------------------------------------------------------------ integrasi


@router.get("/integrations")
def integrations(db: Session = Depends(get_db)):
    s = get_settings()
    sync_counts = dict(db.execute(select(CardAccess.sync_status, func.count(CardAccess.id)).group_by(CardAccess.sync_status)).all())
    last_syncs = db.scalars(select(AcsSyncLog).order_by(AcsSyncLog.id.desc()).limit(8)).all()
    emps = {e.id: e.employee_code for e in db.scalars(select(Employee))}
    idx = get_index()
    last_notif = db.scalars(select(NotificationLog).order_by(NotificationLog.created_at.desc()).limit(1)).first()
    chats = db.scalar(select(func.count(ChatLog.id))) or 0
    by_status = dict(db.execute(select(ChatLog.provider_status, func.count(ChatLog.id)).group_by(ChatLog.provider_status)).all())
    rv = get_active_rules(db)
    return {
        "access_control": {
            "adapter": acs.ADAPTER_NAME,
            **acs.state(),
            "card_sync_counts": sync_counts,
            "recent_syncs": [
                {
                    "id": x.id,
                    "created_at": iso(x.created_at),
                    "employee_code": emps.get(x.employee_id),
                    "status": x.status,
                    "error": x.error,
                    "permissions": x.payload.get("permissions", []),
                }
                for x in last_syncs
            ],
            "device_api": {
                "tap_endpoint": "POST /api/device/v1/tap",
                "permissions_endpoint": "GET /api/device/v1/cards/{card_number}/permissions",
                "auth_header": "X-Device-Key",
                "key_configured": bool(s.device_api_key),
            },
            "fallback_policy": (
                "Reader memakai cache izin terakhir hingga masa berlakunya habis. Setelah itu akses area khusus "
                "DENIED dan diarahkan ke verifikasi manual. Kebijakan final (buka/tutup saat sistem down) "
                "ditetapkan IT/K3/medis — tidak pernah default 'buka semua'."
            ),
        },
        "whatsapp": {
            **{k: v for k, v in whatsapp.public_view(whatsapp.resolve(db)).items() if k in ("mode", "provider", "provider_label", "source", "missing")},
            "sent_today": notifications.count_today(db),
            "queued": db.scalar(select(func.count(NotificationLog.id)).where(NotificationLog.status == "QUEUED")) or 0,
            "failed": db.scalar(select(func.count(NotificationLog.id)).where(NotificationLog.status == "FAILED")) or 0,
            "last_message_at": iso(last_notif.created_at) if last_notif else None,
        },
        "database": {
            "engine": engine.dialect.name,
            "label": db_label(),
            "host": engine.url.host,
            "database": engine.url.database if engine.dialect.name != "sqlite" else "file SQLite (mode pengembangan)",
        },
        "ai": {
            "configured": gemini.configured(),
            "model_chain": s.model_chain,
            "api_base": s.gemini_api_base,
            "stats": gemini.stats(),
            "chat_total": chats,
            "chat_by_status": by_status,
            "note": "Tier gratis: kuota berubah-ubah, cek Google AI Studio. Produksi: tier berbayar/enterprise atau on-premise.",
        },
        "rag": {
            "retriever": "BM25 lokal (penyimpanan lokal sederhana)",
            "documents": len({c.document_id for c in idx.chunks}),
            "chunks": idx.n,
        },
        "rule_engine": {"active_version": rv.version, "label": rv.label, "approved_by_name": rv.approved_by_name},
    }


@router.get("/settings/whatsapp")
def get_whatsapp_settings(db: Session = Depends(get_db)):
    return whatsapp.public_view(whatsapp.resolve(db))


@router.put("/settings/whatsapp")
def put_whatsapp_settings(body: WhatsAppSettingsIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    cfg = whatsapp.save(db, body.provider, body.values, admin.id)
    write_audit(
        db, admin, "WHATSAPP_SETTINGS_UPDATED", "app_setting", "whatsapp", None,
        {
            "provider": cfg.provider,
            "mode": "AKTIF" if cfg.active else "SIMULASI",
            "fields_set": sorted(k for k, v in cfg.values.items() if v and k not in whatsapp.SECRET_FIELDS),
            "secret_set": {k: bool(cfg.values.get(k)) for k in whatsapp.SECRET_FIELDS},
        },
    )
    db.commit()
    return whatsapp.public_view(cfg)


@router.post("/settings/whatsapp/test")
def test_whatsapp(body: WhatsAppTestIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db_nolock)):
    """Kirim pesan uji. Panggilan jaringan dilakukan tanpa WRITE_LOCK."""
    cfg = whatsapp.resolve(db)
    msg = (body.message or "").strip() or "Tes notifikasi HBAC — konfigurasi WhatsApp API berhasil."
    res = whatsapp.send(cfg, body.to, msg)
    with WRITE_LOCK:
        db.add(
            NotificationLog(
                recipient_type="TEST",
                recipient_label="Uji kirim oleh admin",
                provider=res.provider,
                to_masked=mask_phone(body.to),
                template="TEST",
                message=msg,
                status=res.status,
                error=None if res.ok else res.detail,
            )
        )
        write_audit(db, admin, "WHATSAPP_TEST_SENT", "notification", None, None, {"status": res.status, "provider": res.provider})
        db.commit()
    return {"ok": res.ok, "status": res.status, "provider": res.provider, "detail": res.detail, "mode": "AKTIF" if cfg.active else "SIMULASI"}


@router.post("/integrations/acs-outage")
def acs_outage(body: OutageIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    acs.set_outage(body.simulate_outage)
    write_audit(db, admin, "ACS_OUTAGE_SIMULATION", "integration", "acs", None, {"simulate_outage": body.simulate_outage})
    retried = 0
    if not body.simulate_outage:
        from ..services.scheduler import retry_failed_syncs

        retried = retry_failed_syncs(db, utcnow())
    db.commit()
    return {"simulate_outage": body.simulate_outage, "retried": retried}


@router.post("/integrations/acs-resync")
def acs_resync(admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    settings = get_active_rules(db).config.get("settings", {})
    ok = sum(1 for e in db.scalars(select(Employee)).all() if acs.sync_employee(db, e, settings))
    write_audit(db, admin, "ACS_RESYNC", "integration", "acs", None, {"synced": ok})
    db.commit()
    return {"synced": ok}


# ------------------------------------------------------------------ audit & AI log


@router.get("/audit")
def audit_list(
    action: str = "",
    employee_id: int | None = None,
    actor: str = "",
    limit: int = Query(100, ge=1, le=500),
    before_id: int | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if employee_id:
        stmt = stmt.where(AuditLog.employee_id == employee_id)
    if actor:
        stmt = stmt.where(AuditLog.actor_label == actor)
    if before_id:
        stmt = stmt.where(AuditLog.id < before_id)
    rows = db.scalars(stmt).all()
    actions = [a for (a,) in db.execute(select(AuditLog.action).distinct().order_by(AuditLog.action))]
    emps = {e.id: e.employee_code for e in db.scalars(select(Employee))}
    return {
        "items": [{**audit_view(a), "employee_code": emps.get(a.employee_id)} for a in rows],
        "actions": actions,
        "total": db.scalar(select(func.count(AuditLog.id))) or 0,
    }


@router.get("/audit/verify")
def audit_verify(db: Session = Depends(get_db)):
    return verify_chain(db)


@router.get("/ai-logs")
def ai_logs(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    rows = db.scalars(select(ChatLog).order_by(ChatLog.id.desc()).limit(limit)).all()
    names = {u.id: u.username for u in db.scalars(select(User))}
    return {
        "items": [
            {
                "id": r.id,
                "created_at": iso(r.created_at),
                "user": names.get(r.user_id),
                "intent": r.intent,
                "sanitized_question": r.sanitized_question,
                "personal_context": r.personal_context,
                "prompt_sent": r.prompt_sent,
                "model": r.model,
                "provider_status": r.provider_status,
                "answer": r.answer,
                "sources": r.sources,
                "redactions": r.redactions,
                "latency_ms": r.latency_ms,
                "error": r.error,
            }
            for r in rows
        ]
    }


# ------------------------------------------------------------------ dokumen RAG


@router.get("/documents")
def documents(db: Session = Depends(get_db)):
    rows = db.scalars(select(Document).order_by(Document.id)).all()
    return {
        "items": [
            {
                "id": d.id,
                "title": d.title,
                "source_file": d.source_file,
                "category": d.category,
                "is_sample": d.is_sample,
                "is_active": d.is_active,
                "chunk_count": d.chunk_count,
                "updated_at": iso(d.updated_at),
            }
            for d in rows
        ],
        "index": {"chunks": get_index().n},
    }


@router.get("/documents/{did}")
def document_detail(did: int, db: Session = Depends(get_db)):
    d = db.get(Document, did)
    if d is None:
        raise HTTPException(404, "Dokumen tidak ditemukan")
    chunks = db.scalars(select(Chunk).where(Chunk.document_id == d.id).order_by(Chunk.chunk_index)).all()
    return {
        "id": d.id,
        "title": d.title,
        "source_file": d.source_file,
        "chunks": [{"index": c.chunk_index, "heading": c.heading, "content": c.content} for c in chunks],
    }


@router.post("/documents")
def upload_document(
    file: UploadFile = File(...),
    category: str = Form("SOP"),
    admin: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = (file.filename or "").strip()
    if not name.lower().endswith((".md", ".txt")):
        raise HTTPException(400, "Format dokumen harus .md atau .txt")
    raw = file.file.read()
    if len(raw) > 1024 * 1024:
        raise HTTPException(400, "Ukuran dokumen maksimal 1 MB")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "Dokumen harus berenkode UTF-8")
    safe = "".join(ch for ch in name if ch.isalnum() or ch in "._- ")[:120]
    d = upsert_document(db, text, f"upload/{safe}", category=category[:64] or "SOP", is_sample=False, uploaded_by_user_id=admin.id)
    write_audit(db, admin, "DOCUMENT_UPLOADED", "document", d.id, None, {"title": d.title, "chunks": d.chunk_count})
    db.commit()
    stats = rebuild_index(db)
    return {"id": d.id, "title": d.title, "chunk_count": d.chunk_count, "index": stats}


@router.post("/documents/{did}/toggle")
def toggle_document(did: int, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    d = db.get(Document, did)
    if d is None:
        raise HTTPException(404, "Dokumen tidak ditemukan")
    d.is_active = not d.is_active
    write_audit(db, admin, "DOCUMENT_TOGGLED", "document", d.id, None, {"is_active": d.is_active})
    db.commit()
    return {"is_active": d.is_active, "index": rebuild_index(db)}


@router.post("/documents/reindex")
def reindex(admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    n = ingest_directory(db, get_settings().knowledge_dir)
    write_audit(db, admin, "DOCUMENTS_REINDEXED", "document", None, None, {"sample_files": n})
    db.commit()
    return {"sample_files": n, "index": rebuild_index(db)}


@router.get("/access-events")
def access_events(
    result: str = "", area: str = "", limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)
):
    stmt = select(AccessEvent).order_by(AccessEvent.created_at.desc()).limit(limit)
    if result:
        stmt = stmt.where(AccessEvent.result == result)
    if area:
        stmt = stmt.where(AccessEvent.area_code == area)
    return {"items": [access_event_view(e) for e in db.scalars(stmt)]}
