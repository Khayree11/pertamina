"""Audit log append-only dengan rantai hash (tamper-evident).

- Tidak ada endpoint untuk mengubah/menghapus audit log.
- Trigger DB memblokir UPDATE/DELETE (SQLite & PostgreSQL).
- Setiap baris menyimpan hash(prev_hash + isi) sehingga perubahan langsung di DB terdeteksi.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import DDL, event, select
from sqlalchemy.orm import Session

from .models import AuditLog, User
from .timeutil import iso, utcnow

GENESIS = "GENESIS"

_SQLITE_TRIGGERS = [
    """CREATE TRIGGER IF NOT EXISTS audit_logs_no_update BEFORE UPDATE ON audit_logs
       BEGIN SELECT RAISE(ABORT, 'audit_logs bersifat append-only'); END;""",
    """CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete BEFORE DELETE ON audit_logs
       BEGIN SELECT RAISE(ABORT, 'audit_logs bersifat append-only'); END;""",
]
_PG_TRIGGERS = [
    """CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'audit_logs bersifat append-only'; END; $$ LANGUAGE plpgsql;""",
    """CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON audit_logs
       FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();""",
    """CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
       FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_mutation();""",
]

for _stmt in _SQLITE_TRIGGERS:
    event.listen(AuditLog.__table__, "after_create", DDL(_stmt).execute_if(dialect="sqlite"))
for _stmt in _PG_TRIGGERS:
    event.listen(AuditLog.__table__, "after_create", DDL(_stmt).execute_if(dialect="postgresql"))


def _canonical(row: AuditLog) -> str:
    payload = {
        "created_at": iso(row.created_at),
        "actor_user_id": row.actor_user_id,
        "actor_label": row.actor_label,
        "actor_role": row.actor_role,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "employee_id": row.employee_id,
        "details": row.details or {},
    }
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)


def _compute_hash(prev_hash: str | None, row: AuditLog) -> str:
    return hashlib.sha256(((prev_hash or GENESIS) + "|" + _canonical(row)).encode("utf-8")).hexdigest()


def _jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str, ensure_ascii=False))


def write_audit(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    employee_id: int | None = None,
    details: dict | None = None,
) -> AuditLog:
    """Tulis audit log. Pemanggil harus memegang WRITE_LOCK (lihat deps/scheduler)."""
    prev = db.scalar(select(AuditLog.hash).order_by(AuditLog.id.desc()).limit(1))
    row = AuditLog(
        created_at=utcnow(),
        actor_user_id=actor.id if actor else None,
        actor_label=actor.username if actor else "system",
        actor_role=actor.role if actor else "SYSTEM",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        employee_id=employee_id,
        details=_jsonable(details or {}),
        prev_hash=prev,
    )
    row.hash = _compute_hash(prev, row)
    db.add(row)
    db.flush()
    return row


def verify_chain(db: Session) -> dict:
    prev: str | None = None
    count = 0
    for row in db.scalars(select(AuditLog).order_by(AuditLog.id)):
        count += 1
        if row.prev_hash != prev or _compute_hash(prev, row) != row.hash:
            return {"ok": False, "checked": count, "broken_at_id": row.id}
        prev = row.hash
    return {"ok": True, "checked": count, "broken_at_id": None, "head_hash": prev}
