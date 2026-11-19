"""Scheduler internal (proses tunggal): kedaluwarsa override & status harian, retry sinkron ACS,
pengingat tensi harian, dan penyegaran data demo."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import WRITE_LOCK, SessionLocal
from ..models import CardAccess, Employee
from ..timeutil import iso, to_local, utcnow
from . import acs, notifications, overrides
from .assessment import run_assessment
from .reasons import get_active_rules

logger = logging.getLogger("hbac.scheduler")
last_run: dict = {"at": None, "stats": None}


def reassess_expired(db: Session, now: datetime) -> int:
    ids = set(db.scalars(select(CardAccess.employee_id).where(CardAccess.auto_valid_until <= now)))
    assessed = set(db.scalars(select(CardAccess.employee_id).distinct()))
    ids |= set(db.scalars(select(Employee.id))) - assessed
    for eid in sorted(ids):
        run_assessment(db, db.get(Employee, eid), "EXPIRY", notify=False, now=now)
    return len(ids)


def retry_failed_syncs(db: Session, now: datetime) -> int:
    if acs.state()["simulate_outage"]:
        return 0
    ids = set(db.scalars(select(CardAccess.employee_id).where(CardAccess.sync_status.in_(["FAILED", "PENDING"]))))
    if not ids:
        return 0
    settings = get_active_rules(db).config.get("settings", {})
    return sum(1 for eid in sorted(ids) if acs.sync_employee(db, db.get(Employee, eid), settings, now))


def run_sweep(now: datetime | None = None) -> dict:
    s = get_settings()
    with WRITE_LOCK:
        db = SessionLocal()
        try:
            now = now or utcnow()
            stats: dict = {}
            if s.demo_mode:
                from ..seed import refresh_demo_day

                stats["demo_refresh"] = refresh_demo_day(db, now)
            stats["overrides_expired"] = overrides.expire_due(db, now)
            stats["reassessed"] = reassess_expired(db, now)
            stats["acs_retried"] = retry_failed_syncs(db, now)
            from .mcu_intake import cleanup_uploads

            stats["mcu_uploads_cleaned"] = cleanup_uploads(db, now)
            if to_local(now).hour >= s.reminder_hour_local:
                stats["reminders"] = notifications.send_bp_reminders(db, now)["sent"]
            db.commit()
            last_run.update(at=iso(now), stats=stats)
            if any(v for v in stats.values()):
                logger.info("Sweep: %s", stats)
            return stats
        except Exception as exc:  # pragma: no cover - dicatat, scheduler tetap jalan
            db.rollback()
            logger.exception("Sweep gagal")
            return {"error": str(exc)}
        finally:
            db.close()


async def scheduler_loop() -> None:  # pragma: no cover - loop latar
    interval = max(15, get_settings().scheduler_interval_seconds)
    while True:
        await asyncio.sleep(interval)
        await asyncio.to_thread(run_sweep)
