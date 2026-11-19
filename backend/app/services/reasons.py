from sqlalchemy import select
from sqlalchemy.orm import Session

from ..constants import SYSTEM_REASONS
from ..models import RuleVersion
from . import DomainError


def get_active_rules(db: Session) -> RuleVersion:
    rv = db.scalars(
        select(RuleVersion).where(RuleVersion.status == "ACTIVE").order_by(RuleVersion.version.desc())
    ).first()
    if rv is None:
        raise DomainError("Tidak ada versi aturan yang aktif", 500)
    return rv


def describe_reason(code: str, config: dict) -> dict:
    catalog = (config or {}).get("reason_catalog", {})
    item = catalog.get(code) or SYSTEM_REASONS.get(code)
    if item:
        return {"code": code, "short": item.get("short", code), "detail": item.get("detail", "")}
    return {"code": code, "short": code, "detail": ""}


def comorbidity_label(code: str, config: dict, other_label: str | None = None) -> str:
    if code == "OTHER" and other_label:
        return f"Lainnya: {other_label}"
    for item in (config or {}).get("comorbidity_catalog", []):
        if item.get("code") == code:
            return item.get("label", code)
    return code
