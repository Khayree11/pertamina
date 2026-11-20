"""Bangun fakta untuk rule engine dari data pekerja (tensi + MCU + komorbid)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import FIT_TO_DRIVE, REJECTED, UNFIT_TO_DRIVE, VERIFIED
from ..models import AnnualMCU, Comorbidity, DailyBPRecord, Employee
from ..timeutil import today_local


def evaluate_fit_to_drive(facts: dict, comorbidities: list, config: dict) -> dict:
    """Menghitung status kelayakan berkendara dari fakta yang sudah dibangun.
    Mengembalikan dict: { status, reasons: [str] }
    """
    settings = config.get("settings", {})
    sys_hi = int(settings.get("bp_high_systolic", 140))
    dia_hi = int(settings.get("bp_high_diastolic", 90))
    sys_crit = int(settings.get("bp_critical_systolic", 180))
    dia_crit = int(settings.get("bp_critical_diastolic", 110))

    reasons = []

    # 1. Tensi belum diinput hari ini — langsung UNFIT
    if not facts.get("bp.submitted_today"):
        return {"status": UNFIT_TO_DRIVE, "reasons": ["FTD_BP_NOT_SUBMITTED"]}

    # 2. Nilai tensi
    sys = facts.get("bp.systolic") or 0
    dia = facts.get("bp.diastolic") or 0
    if sys >= sys_crit or dia >= dia_crit:
        reasons.append("FTD_BP_VERY_HIGH")
    elif sys >= sys_hi or dia >= dia_hi:
        reasons.append("FTD_BP_HIGH")

    # 3. Status MCU
    if not facts.get("mcu.exists") or facts.get("mcu.expired"):
        reasons.append("FTD_MCU_INVALID")
    elif not facts.get("mcu.verified"):
        reasons.append("FTD_MCU_INVALID")
    elif facts.get("mcu.conclusion") == "UNFIT":
        reasons.append("FTD_MCU_UNFIT")

    # 4. Epilepsi aktif
    for c in comorbidities:
        if getattr(c, "condition_code", None) == "EPILEPSY" and getattr(c, "active", False):
            reasons.append("FTD_EPILEPSY")
            break

    if reasons:
        return {"status": UNFIT_TO_DRIVE, "reasons": reasons}
    return {"status": FIT_TO_DRIVE, "reasons": []}


def todays_bp(db: Session, employee_id: int, day: date) -> list[DailyBPRecord]:
    return list(
        db.scalars(
            select(DailyBPRecord)
            .where(DailyBPRecord.employee_id == employee_id, DailyBPRecord.record_date == day)
            .order_by(DailyBPRecord.measured_at, DailyBPRecord.id)
        )
    )


def latest_mcu(db: Session, employee_id: int) -> AnnualMCU | None:
    """MCU terbaru (bukan yang ditolak). Data terbaru selalu menggantikan yang lama."""
    return db.scalars(
        select(AnnualMCU)
        .where(AnnualMCU.employee_id == employee_id, AnnualMCU.verification_status != REJECTED)
        .order_by(AnnualMCU.mcu_date.desc(), AnnualMCU.id.desc())
        .limit(1)
    ).first()


def active_comorbidities(db: Session, employee_id: int) -> list[Comorbidity]:
    return list(
        db.scalars(
            select(Comorbidity).where(
                Comorbidity.employee_id == employee_id,
                Comorbidity.active.is_(True),
                Comorbidity.verification_status != REJECTED,
            )
        )
    )


def mcu_valid_through(mcu: AnnualMCU, validity_days: int) -> date:
    return mcu.mcu_date + timedelta(days=validity_days)


def build_facts(db: Session, employee: Employee, config: dict, now: datetime) -> tuple[dict, dict]:
    settings = config.get("settings", {})
    today = today_local(now)

    bps = todays_bp(db, employee.id, today)
    latest = bps[-1] if bps else None
    facts: dict = {
        "bp.submitted_today": bool(bps),
        "bp.readings_today": len(bps),
        "bp.systolic": latest.systolic if latest else None,
        "bp.diastolic": latest.diastolic if latest else None,
        "bp.pulse": latest.pulse if latest else None,
    }
    if len(bps) >= 2:
        s = [b.systolic for b in bps]
        d = [b.diastolic for b in bps]
        facts["bp.inconsistent_today"] = (max(s) - min(s) > int(settings.get("bp_inconsistency_systolic_delta", 30))) or (
            max(d) - min(d) > int(settings.get("bp_inconsistency_diastolic_delta", 20))
        )
    else:
        facts["bp.inconsistent_today"] = False

    validity = int(settings.get("mcu_validity_days", 365))
    mcu = latest_mcu(db, employee.id)
    facts["mcu.exists"] = mcu is not None
    if mcu:
        age = (today - mcu.mcu_date).days
        facts.update(
            {
                "mcu.age_days": age,
                "mcu.expired": age > validity,
                # MCU tanpa penilaian dokter (PENDING) tidak pernah dianggap terverifikasi (default aman).
                "mcu.verified": mcu.verification_status == VERIFIED and mcu.conclusion != "PENDING",
                "mcu.conclusion": mcu.conclusion,
                "mcu.restricted_areas": list(mcu.restricted_areas or []),
            }
        )
    else:
        facts.update(
            {
                "mcu.age_days": None,
                "mcu.expired": None,
                "mcu.verified": None,
                "mcu.conclusion": None,
                "mcu.restricted_areas": None,
            }
        )

    comorbs = active_comorbidities(db, employee.id)
    facts["comorbid.active"] = sorted({c.condition_code for c in comorbs})
    # Klaim "terkontrol" baru dipercaya setelah diverifikasi (default aman).
    facts["comorbid.uncontrolled"] = sorted(
        {c.condition_code for c in comorbs if (not c.controlled) or c.verification_status != VERIFIED}
    )
    facts["comorbid.unverified"] = sorted({c.condition_code for c in comorbs if c.verification_status != VERIFIED})

    meta = {
        "today": today.isoformat(),
        "bp_record_ids": [b.id for b in bps],
        "mcu_id": mcu.id if mcu else None,
        "mcu_valid_through": mcu_valid_through(mcu, validity).isoformat() if mcu else None,
        "comorbidity_ids": sorted(c.id for c in comorbs),
    }
    return facts, meta
