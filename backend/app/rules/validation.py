"""Validasi konfigurasi aturan sebelum disimpan sebagai versi baru."""
from __future__ import annotations

import re
from typing import Any

from ..constants import SPECIAL_AREAS, STATUSES
from .catalog import FACT_CATALOG, KNOWN_FLAGS, OPS_BY_TYPE
from .engine import VALID_OPS

_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,40}$")
_REQUIRED_SETTINGS = {
    "mcu_validity_days": (1, 1095),
    "bp_inconsistency_systolic_delta": (1, 100),
    "bp_inconsistency_diastolic_delta": (1, 100),
    "override_max_hours": (1, 24),
    "override_default_hours": (1, 24),
    "restricted_entry_max_minutes": (5, 720),
}


def _validate_condition(cond: Any, path: str, errors: list[str], depth: int = 0) -> None:
    if depth > 8:
        errors.append(f"{path}: kondisi terlalu dalam (maks 8 tingkat)")
        return
    if not isinstance(cond, dict):
        errors.append(f"{path}: kondisi harus objek")
        return
    for key in ("all", "any"):
        if key in cond:
            items = cond[key]
            if not isinstance(items, list) or not items:
                errors.append(f"{path}.{key}: harus daftar kondisi yang tidak kosong")
                return
            for i, c in enumerate(items):
                _validate_condition(c, f"{path}.{key}[{i}]", errors, depth + 1)
            return
    if "not" in cond:
        _validate_condition(cond["not"], f"{path}.not", errors, depth + 1)
        return
    fact, op = cond.get("fact"), cond.get("op")
    if fact not in FACT_CATALOG:
        errors.append(f"{path}: fakta '{fact}' tidak dikenal")
        return
    if op not in VALID_OPS:
        errors.append(f"{path}: operator '{op}' tidak dikenal")
        return
    ftype = FACT_CATALOG[fact]["type"]
    if op not in OPS_BY_TYPE[ftype]:
        errors.append(f"{path}: operator '{op}' tidak cocok untuk fakta bertipe {ftype}")
        return
    needs_value = op not in {"exists", "not_exists", "is_true", "is_false"}
    if needs_value and "value" not in cond:
        errors.append(f"{path}: operator '{op}' membutuhkan 'value'")
    if op in {">", ">=", "<", "<="} and not isinstance(cond.get("value"), (int, float)):
        errors.append(f"{path}: 'value' harus angka")
    if op in {"in", "not_in"} and not isinstance(cond.get("value"), list):
        errors.append(f"{path}: 'value' harus daftar")


def validate_config(config: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(config, dict):
        return ["Konfigurasi harus berupa objek JSON"]

    areas = config.get("special_areas")
    if not isinstance(areas, list) or not areas or any(a not in SPECIAL_AREAS for a in areas):
        errors.append(f"special_areas harus subset dari {SPECIAL_AREAS}")
        areas = SPECIAL_AREAS

    settings = config.get("settings")
    if not isinstance(settings, dict):
        errors.append("settings wajib ada")
        settings = {}
    for key, (lo, hi) in _REQUIRED_SETTINGS.items():
        v = settings.get(key)
        if not isinstance(v, int) or isinstance(v, bool) or not (lo <= v <= hi):
            errors.append(f"settings.{key} harus bilangan bulat {lo}–{hi}")
    if isinstance(settings.get("override_default_hours"), int) and isinstance(settings.get("override_max_hours"), int):
        if settings["override_default_hours"] > settings["override_max_hours"]:
            errors.append("settings.override_default_hours tidak boleh melebihi override_max_hours")
    hs = settings.get("override_hard_stop_reasons", [])
    if not isinstance(hs, list) or any(not isinstance(x, str) for x in hs):
        errors.append("settings.override_hard_stop_reasons harus daftar kode alasan")

    catalog = config.get("comorbidity_catalog")
    if not isinstance(catalog, list) or not catalog:
        errors.append("comorbidity_catalog wajib berupa daftar")
    else:
        codes = set()
        for i, item in enumerate(catalog):
            if not isinstance(item, dict) or not _CODE_RE.match(str(item.get("code", ""))) or not item.get("label"):
                errors.append(f"comorbidity_catalog[{i}]: butuh 'code' (HURUF_BESAR) dan 'label'")
                continue
            if item["code"] in codes:
                errors.append(f"comorbidity_catalog: kode duplikat {item['code']}")
            codes.add(item["code"])

    reasons = config.get("reason_catalog")
    if not isinstance(reasons, dict) or not reasons:
        errors.append("reason_catalog wajib berupa objek")
        reasons = {}
    for code, item in reasons.items():
        if not _CODE_RE.match(code) or not isinstance(item, dict) or not item.get("short"):
            errors.append(f"reason_catalog.{code}: butuh 'short' (dan sebaiknya 'detail')")

    rules = config.get("rules")
    if not isinstance(rules, list) or not rules:
        errors.append("rules wajib berupa daftar yang tidak kosong")
        return errors
    seen_ids: set[str] = set()
    for i, rule in enumerate(rules):
        p = f"rules[{i}]"
        if not isinstance(rule, dict):
            errors.append(f"{p}: harus objek")
            continue
        rid = rule.get("id")
        if not isinstance(rid, str) or not rid:
            errors.append(f"{p}: 'id' wajib")
        elif rid in seen_ids:
            errors.append(f"{p}: id duplikat {rid}")
        else:
            seen_ids.add(rid)
            p = f"rules[{rid}]"
        if not rule.get("name"):
            errors.append(f"{p}: 'name' wajib")
        if "when" not in rule:
            errors.append(f"{p}: 'when' wajib")
        else:
            _validate_condition(rule["when"], f"{p}.when", errors)
        has_eff = "effects" in rule
        has_from = "effects_from_fact" in rule
        if has_eff == has_from:
            errors.append(f"{p}: gunakan tepat satu dari 'effects' atau 'effects_from_fact'")
        if has_eff:
            eff = rule["effects"]
            if not isinstance(eff, dict) or not eff:
                errors.append(f"{p}.effects: harus objek tidak kosong")
            else:
                for k, v in eff.items():
                    if k not in set(areas) | {"ALL_SPECIAL", "OTHERS"}:
                        errors.append(f"{p}.effects: kunci '{k}' tidak dikenal")
                    if v not in STATUSES or v == "ALLOWED":
                        errors.append(
                            f"{p}.effects.{k}: status harus RESTRICTED/NEEDS_REVIEW/DENIED "
                            "(ALLOWED tidak berpengaruh karena kombinasi memakai status paling ketat)"
                        )
        if has_from:
            spec = rule["effects_from_fact"]
            if not isinstance(spec, dict) or FACT_CATALOG.get(spec.get("fact"), {}).get("type") != "list":
                errors.append(f"{p}.effects_from_fact: 'fact' harus fakta bertipe daftar")
            elif spec.get("status") not in ("RESTRICTED", "NEEDS_REVIEW", "DENIED"):
                errors.append(f"{p}.effects_from_fact.status tidak valid")
        reason = rule.get("reason")
        if reason not in reasons:
            errors.append(f"{p}: reason '{reason}' tidak ada di reason_catalog")
        for f in rule.get("flags") or []:
            if f not in KNOWN_FLAGS:
                errors.append(f"{p}: flag '{f}' tidak dikenal")
    return errors
