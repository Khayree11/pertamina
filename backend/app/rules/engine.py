"""Rule engine kelayakan per area.

Prinsip (dokumen §5): deterministik, dapat dijelaskan, BUKAN LLM.

* Logika tiga-nilai (Kleene): True / False / None (= tidak pasti).
  Fakta yang hilang membuat kondisi bernilai None. Aturan yang bernilai None
  diperlakukan sebagai ketidakpastian -> NEEDS_REVIEW (default aman), tidak pernah ALLOWED.
* Beberapa aturan yang cocok digabung dengan mengambil status PALING KETAT,
  sehingga urutan aturan tidak memengaruhi hasil.
* Jika engine gagal total, semua area khusus menjadi NEEDS_REVIEW.
"""
from __future__ import annotations

from typing import Any

SEVERITY = {"ALLOWED": 0, "RESTRICTED": 1, "NEEDS_REVIEW": 2, "DENIED": 3}
VALID_OPS = {
    "==", "!=", ">", ">=", "<", "<=", "in", "not_in",
    "contains", "not_contains", "exists", "not_exists", "is_true", "is_false",
}


class RuleConfigError(ValueError):
    pass


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def eval_condition(cond: Any, facts: dict) -> bool | None:
    if not isinstance(cond, dict):
        raise RuleConfigError("Kondisi harus berupa objek")
    if "all" in cond:
        results = [eval_condition(c, facts) for c in cond["all"]]
        if any(r is False for r in results):
            return False
        if any(r is None for r in results):
            return None
        return True
    if "any" in cond:
        results = [eval_condition(c, facts) for c in cond["any"]]
        if any(r is True for r in results):
            return True
        if any(r is None for r in results):
            return None
        return False
    if "not" in cond:
        r = eval_condition(cond["not"], facts)
        return None if r is None else (not r)

    fact = cond.get("fact")
    op = cond.get("op")
    if not fact or op not in VALID_OPS:
        raise RuleConfigError(f"Kondisi tidak valid: {cond!r}")
    value = facts.get(fact)
    present = value is not None
    if op == "exists":
        return present
    if op == "not_exists":
        return not present
    if not present:
        return None  # tidak pasti
    target = cond.get("value")
    if op == "is_true":
        return True if value is True else (False if value is False else None)
    if op == "is_false":
        return True if value is False else (False if value is True else None)
    if op == "==":
        return value == target
    if op == "!=":
        return value != target
    if op in (">", ">=", "<", "<="):
        if not (_is_number(value) and _is_number(target)):
            return None
        return {
            ">": value > target,
            ">=": value >= target,
            "<": value < target,
            "<=": value <= target,
        }[op]
    if op in ("in", "not_in"):
        if not isinstance(target, list):
            raise RuleConfigError(f"Operator {op} butuh daftar nilai")
        return (value in target) if op == "in" else (value not in target)
    if op in ("contains", "not_contains"):
        if not isinstance(value, list):
            return None
        return (target in value) if op == "contains" else (target not in value)
    raise RuleConfigError(f"Operator tidak dikenal: {op}")


def expand_effects(rule: dict, areas: list[str], facts: dict) -> dict[str, str] | None:
    """Hasilkan {area: status}. None berarti area target tidak dapat ditentukan."""
    if "effects_from_fact" in rule:
        spec = rule["effects_from_fact"]
        lst = facts.get(spec.get("fact"))
        if not isinstance(lst, list):
            return None
        targets = [a for a in lst if a in areas]
        if not targets:
            return None
        return {a: spec["status"] for a in targets}
    eff = rule.get("effects") or {}
    out: dict[str, str] = {}
    if "ALL_SPECIAL" in eff:
        for a in areas:
            out[a] = eff["ALL_SPECIAL"]
    explicit = {k: v for k, v in eff.items() if k in areas}
    if "OTHERS" in eff:
        for a in areas:
            if a not in explicit:
                out[a] = eff["OTHERS"]
    out.update(explicit)
    return out


def evaluate(config: dict, facts: dict) -> dict:
    areas: list[str] = list(config.get("special_areas") or [])
    result: dict[str, dict] = {a: {"status": "ALLOWED", "reasons": []} for a in areas}
    trace: list[dict] = []
    flags: list[str] = []
    engine_error: str | None = None

    try:
        for rule in config.get("rules", []):
            rid = rule.get("id")
            entry: dict[str, Any] = {"rule_id": rid, "name": rule.get("name"), "reason": rule.get("reason")}
            if rule.get("enabled", True) is False:
                entry["outcome"] = "DISABLED"
                trace.append(entry)
                continue

            error = None
            try:
                outcome = eval_condition(rule.get("when"), facts)
            except Exception as exc:  # aturan rusak -> tidak pasti (default aman)
                outcome, error = None, str(exc)

            if outcome is False:
                entry["outcome"] = "NOT_MATCHED"
                trace.append(entry)
                continue

            uncertain = outcome is None
            try:
                effects = expand_effects(rule, areas, facts)
            except Exception as exc:
                effects, error = None, error or str(exc)

            if uncertain or effects is None:
                targets = list(effects.keys()) if (effects and uncertain) else areas
                applied = {a: "NEEDS_REVIEW" for a in targets}
                uncertain = True
            else:
                applied = effects
                for f in rule.get("flags") or []:
                    if f not in flags:
                        flags.append(f)

            entry["outcome"] = "UNCERTAIN" if uncertain else "MATCHED"
            entry["effects"] = applied
            if error:
                entry["error"] = error
            reason_code = "DATA_UNCERTAIN" if uncertain else (rule.get("reason") or rid)
            for area, status in applied.items():
                if area not in result or status not in SEVERITY:
                    continue
                cur = result[area]
                cur["reasons"].append(
                    {"rule_id": rid, "reason": reason_code, "status": status, "uncertain": uncertain}
                )
                if SEVERITY[status] > SEVERITY[cur["status"]]:
                    cur["status"] = status
            trace.append(entry)
    except Exception as exc:  # pragma: no cover - jaring pengaman terakhir
        engine_error = str(exc)
        for a in areas:
            result[a] = {
                "status": "NEEDS_REVIEW",
                "reasons": [{"rule_id": None, "reason": "ENGINE_ERROR", "status": "NEEDS_REVIEW", "uncertain": True}],
            }

    for a, r in result.items():
        decisive = [x["reason"] for x in r["reasons"] if x["status"] == r["status"]]
        decisive = list(dict.fromkeys(decisive))
        if not decisive and r["status"] == "ALLOWED":
            decisive = ["ALL_CLEAR"]
        r["decisive"] = decisive

    return {"areas": result, "flags": flags, "trace": trace, "engine_error": engine_error}
