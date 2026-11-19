"""Bangun fakta untuk rule engine dari data pekerja (tensi + MCU + komorbid)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import REJECTED, VERIFIED
from ..models import AnnualMCU, Comorbidity, DailyBPRecord, Employee
from ..timeutil import today_local


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
