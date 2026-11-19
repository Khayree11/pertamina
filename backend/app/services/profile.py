"""Registrasi mandiri & kelengkapan profil (onboarding) pekerja."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..constants import REJECTED
from ..models import Comorbidity, Employee, User
from ..security import mask_phone
from ..timeutil import iso, iso_date
from .facts import latest_mcu


def onboarding_status(db: Session, emp: Employee) -> dict:
    has_mcu = latest_mcu(db, emp.id) is not None
    com = (
        db.scalar(
            select(func.count(Comorbidity.id)).where(
                Comorbidity.employee_id == emp.id,
                Comorbidity.active.is_(True),
                Comorbidity.verification_status != REJECTED,
            )
        )
        or 0
    )
    general = bool(emp.profile_general_done_at)
    comorbid = bool(emp.comorbid_declared_at) or com > 0
    mcu = "DONE" if has_mcu else ("DEFERRED" if emp.mcu_deferred_at else "MISSING")
    left = [s for s, ok in (("general", general), ("mcu", mcu != "MISSING"), ("comorbid", comorbid)) if not ok]
    return {
        "general_done": general,
        "mcu": mcu,
        "mcu_required": not has_mcu,
        "comorbid_done": comorbid,
        "comorbid_count": com,
        "completed": bool(emp.profile_completed_at),
        "can_complete": not left,
        "next_step": left[0] if left else None,
    }


def general_view(emp: Employee, user: User | None, mask: bool = False) -> dict:
    return {
        "employee_code": emp.employee_code,
        "card_number": emp.card_number,
        "full_name": emp.full_name,
        "position": emp.position or "",
        "unit": emp.unit or "",
        "work_location": emp.work_location or "",
        "phone": mask_phone(emp.phone) if mask else (emp.phone or ""),
        "email": (user.email if user else None) or "",
        "birth_date": iso_date(emp.birth_date),
        "gender": emp.gender or "",
        "emergency_contact_name": emp.emergency_contact_name or "",
        "emergency_contact_phone": mask_phone(emp.emergency_contact_phone) if mask else (emp.emergency_contact_phone or ""),
        "registration_source": emp.registration_source or "ADMIN",
        "profile_completed_at": iso(emp.profile_completed_at),
    }


def next_card_number(db: Session) -> str:
    nums = []
    for c in db.scalars(select(Employee.card_number)):
        tail = (c or "").split("-")[-1]
        if tail.isdigit():
            nums.append(int(tail))
    return f"CARD-{max([2_000_000, *nums]) + 1:07d}"
