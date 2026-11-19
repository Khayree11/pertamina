from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..ai import gemini
from ..config import get_settings
from ..constants import (
    GENERAL_AREA,
    MCU_CONCLUSIONS,
    SEVERITY,
    SPECIAL_AREAS,
    STATUS_LABELS,
    TAP_LABELS,
)
from ..deps import get_db
from ..mcu.template import public_template
from ..rules.catalog import FACT_CATALOG
from ..services.reasons import get_active_rules
from ..services.views import area_meta
from ..timeutil import iso, today_local

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/mcu/template")
def mcu_template():
    """Template variabel patokan MCU (format 'Kesimpulan Medical Check Up')."""
    return public_template()


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    s = get_settings()
    rv = get_active_rules(db)
    cfg = rv.config
    st = cfg.get("settings", {})
    return {
        "app_name": s.app_name,
        "demo_mode": s.demo_mode,
        "timezone": s.timezone,
        "today": today_local().isoformat(),
        "areas": [area_meta(a) for a in SPECIAL_AREAS],
        "general_area": area_meta(GENERAL_AREA),
        "statuses": [{"code": k, "label": v, "severity": SEVERITY[k]} for k, v in STATUS_LABELS.items()],
        "tap_results": [{"code": k, "label": v} for k, v in TAP_LABELS.items()],
        "mcu_conclusions": [{"code": k, "label": v} for k, v in MCU_CONCLUSIONS.items()],
        "comorbidity_catalog": cfg.get("comorbidity_catalog", []),
        "fact_catalog": FACT_CATALOG,
        "rule_version": {
            "id": rv.id,
            "version": rv.version,
            "label": rv.label,
            "approved_by_name": rv.approved_by_name,
            "activated_at": iso(rv.activated_at),
            "disclaimer": cfg.get("disclaimer"),
        },
        "settings": {
            k: st.get(k)
            for k in (
                "override_max_hours",
                "override_default_hours",
                "mcu_validity_days",
                "restricted_entry_max_minutes",
                "override_hard_stop_reasons",
            )
        },
        "bp_limits": {"systolic": [70, 250], "diastolic": [40, 150], "pulse": [30, 200]},
        "ai": {
            "configured": gemini.configured(),
            "model": s.gemini_model,
            "fallback_models": s.model_chain[1:],
            "note": "Prototipe memakai Gemini API tier gratis. Versi produksi memakai tier berbayar/enterprise atau model on-premise.",
        },
    }
