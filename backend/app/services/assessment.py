"""Alur inti: data -> evaluasi aturan -> status per area -> status kartu -> sinkron ACS -> notifikasi."""
from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import write_audit
from ..models import AssessmentResult, AssessmentRun, Employee
from ..rules.engine import evaluate
from ..timeutil import end_of_local_day, today_local, utcnow
from . import acs, card_access, notifications
from .facts import active_comorbidities, build_facts, evaluate_fit_to_drive
from .reasons import get_active_rules


def run_assessment(
    db: Session,
    employee: Employee,
    trigger: str,
    actor=None,
    notify: bool = True,
    now: datetime | None = None,
) -> tuple[AssessmentRun, list[dict]]:
    now = now or utcnow()
    rv = get_active_rules(db)
    config = rv.config
    facts, meta = build_facts(db, employee, config, now)
    result = evaluate(config, facts)

    # Evaluasi status kelayakan berkendara (Fit to Drive / FTD)
    comorbs = active_comorbidities(db, employee.id)
    ftd = evaluate_fit_to_drive(facts, comorbs, config)

    # Tensi berlaku per hari kalender (WIB); dibatasi juga oleh masa berlaku MCU.
    valid_until = end_of_local_day(today_local(now))
    if meta.get("mcu_valid_through"):
        cap = end_of_local_day(date.fromisoformat(meta["mcu_valid_through"]))
        if now < cap < valid_until:
            valid_until = cap

    previous_run = db.get(AssessmentRun, employee.latest_run_id) if employee.latest_run_id else None
    run = AssessmentRun(
        id=uuid4().hex,
        employee_id=employee.id,
        assessed_at=now,
        trigger=trigger,
        rule_version_id=rv.id,
        rule_version_label=f"v{rv.version} · {rv.label}",
        facts=facts,
        meta={
            **meta,
            "ftd_status": ftd["status"],
            "ftd_reasons": ftd["reasons"],
        },
        trace=result["trace"],
        flags=result["flags"],
        summary={a: r["status"] for a, r in result["areas"].items()},
        engine_error=result["engine_error"],
        valid_until=valid_until,
        actor_user_id=actor.id if actor else None,
    )
    # Pengakuan (ack) flag urgent dibawa jika datanya sama persis dengan run sebelumnya hari ini.
    if (
        previous_run
        and previous_run.urgent_ack_at
        and "URGENT_REVIEW" in (run.flags or [])
        and "URGENT_REVIEW" in (previous_run.flags or [])
        and today_local(previous_run.assessed_at) == today_local(now)
        and (previous_run.meta or {}).get("bp_record_ids") == meta.get("bp_record_ids")
    ):
        run.urgent_ack_at = previous_run.urgent_ack_at
        run.urgent_ack_by_user_id = previous_run.urgent_ack_by_user_id
        run.urgent_ack_note = previous_run.urgent_ack_note
    db.add(run)
    db.flush()

    area_results: dict[str, AssessmentResult] = {}
    for area, r in result["areas"].items():
        ar = AssessmentResult(
            run_id=run.id,
            employee_id=employee.id,
            area_code=area,
            status=r["status"],
            reasons=r["reasons"],
            decisive=r["decisive"],
            created_at=now,
        )
        db.add(ar)
        area_results[area] = ar
    db.flush()
    employee.latest_run_id = run.id

    changes = card_access.apply_assessment(db, employee, run, area_results, now)
    acs.sync_employee(db, employee, config.get("settings", {}), now)
    write_audit(
        db,
        actor,
        "ASSESSMENT_RUN",
        "assessment_run",
        run.id,
        employee.id,
        {
            "trigger": trigger,
            "rule_version": rv.version,
            "summary": run.summary,
            "flags": run.flags,
            "changes": [{k: c.get(k) for k in ("area", "old_status", "new_status")} for c in changes],
        },
    )
    if notify:
        notifications.on_assessment(db, employee, run, changes, trigger, previous_run)
    return run, changes


def reassess_all(db: Session, trigger: str, actor=None, notify: bool = False) -> int:
    count = 0
    for emp in db.scalars(select(Employee)).all():
        run_assessment(db, emp, trigger, actor=actor, notify=notify)
        count += 1
    return count
