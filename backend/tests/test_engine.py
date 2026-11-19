"""Uji rule engine terhadap tabel aturan ilustratif dokumen §5."""
import copy
import random

from app.rules.engine import evaluate
from app.rules.validation import validate_config
from app.seed import load_default_rules

CFG = load_default_rules()


def facts(**over):
    base = {
        "bp.submitted_today": True,
        "bp.readings_today": 1,
        "bp.systolic": 120,
        "bp.diastolic": 80,
        "bp.pulse": 72,
        "bp.inconsistent_today": False,
        "mcu.exists": True,
        "mcu.age_days": 100,
        "mcu.expired": False,
        "mcu.verified": True,
        "mcu.conclusion": "FIT",
        "mcu.restricted_areas": [],
        "comorbid.active": [],
        "comorbid.uncontrolled": [],
        "comorbid.unverified": [],
    }
    base.update({k.replace("__", "."): v for k, v in over.items()})
    return base


def statuses(f, cfg=CFG):
    return {a: r["status"] for a, r in evaluate(cfg, f)["areas"].items()}


def test_default_rules_valid():
    assert validate_config(CFG) == []


def test_all_clear():
    assert set(statuses(facts()).values()) == {"ALLOWED"}
    res = evaluate(CFG, facts())
    assert res["areas"]["HOT"]["decisive"] == ["ALL_CLEAR"]


def test_no_bp_today_denies_all_special():
    f = facts(bp__submitted_today=False, bp__readings_today=0, bp__systolic=None, bp__diastolic=None, bp__pulse=None)
    res = evaluate(CFG, f)
    assert {a: r["status"] for a, r in res["areas"].items()} == {
        "COLD": "DENIED", "HOT": "DENIED", "HEIGHT": "DENIED", "RESTRICTED_GAS": "DENIED"
    }
    assert all(r["decisive"] == ["BP_NOT_SUBMITTED"] for r in res["areas"].values())


def test_high_bp_systolic():
    assert statuses(facts(bp__systolic=145, bp__diastolic=85)) == {
        "COLD": "NEEDS_REVIEW", "HOT": "DENIED", "HEIGHT": "DENIED", "RESTRICTED_GAS": "NEEDS_REVIEW"
    }


def test_high_bp_diastolic_only():
    s = statuses(facts(bp__systolic=130, bp__diastolic=92))
    assert s["HEIGHT"] == "DENIED" and s["HOT"] == "DENIED" and s["COLD"] == "NEEDS_REVIEW"


def test_threshold_boundary():
    assert set(statuses(facts(bp__systolic=139, bp__diastolic=89)).values()) == {"ALLOWED"}
    assert statuses(facts(bp__systolic=140, bp__diastolic=70))["HEIGHT"] == "DENIED"


def test_very_high_bp_denies_all_and_flags():
    res = evaluate(CFG, facts(bp__systolic=182, bp__diastolic=100))
    assert set(r["status"] for r in res["areas"].values()) == {"DENIED"}
    assert "URGENT_REVIEW" in res["flags"]


def test_heart_disease():
    assert statuses(facts(comorbid__active=["HEART_DISEASE"])) == {
        "COLD": "ALLOWED", "HOT": "NEEDS_REVIEW", "HEIGHT": "NEEDS_REVIEW", "RESTRICTED_GAS": "NEEDS_REVIEW"
    }


def test_asthma_only_gas():
    assert statuses(facts(comorbid__active=["ASTHMA_COPD"])) == {
        "COLD": "ALLOWED", "HOT": "ALLOWED", "HEIGHT": "ALLOWED", "RESTRICTED_GAS": "NEEDS_REVIEW"
    }


def test_mcu_expired():
    assert set(statuses(facts(mcu__expired=True, mcu__age_days=400)).values()) == {"NEEDS_REVIEW"}


def test_mcu_missing_is_safe_default_without_noise():
    f = facts(**{"mcu__exists": False, "mcu__age_days": None, "mcu__expired": None, "mcu__verified": None,
                 "mcu__conclusion": None, "mcu__restricted_areas": None})
    res = evaluate(CFG, f)
    assert set(r["status"] for r in res["areas"].values()) == {"NEEDS_REVIEW"}
    # Aturan MCU lain dijaga 'mcu.exists' sehingga tidak menghasilkan alasan DATA_UNCERTAIN.
    assert all(r["decisive"] == ["MCU_MISSING"] for r in res["areas"].values())


def test_mcu_unverified_and_unfit():
    assert set(statuses(facts(mcu__verified=False)).values()) == {"NEEDS_REVIEW"}
    assert set(statuses(facts(mcu__conclusion="UNFIT")).values()) == {"DENIED"}


def test_mcu_restriction_and_empty_restriction_is_uncertain():
    s = statuses(facts(mcu__conclusion="FIT_WITH_RESTRICTION", mcu__restricted_areas=["HEIGHT"]))
    assert s == {"COLD": "ALLOWED", "HOT": "ALLOWED", "HEIGHT": "RESTRICTED", "RESTRICTED_GAS": "ALLOWED"}
    s2 = statuses(facts(mcu__conclusion="FIT_WITH_RESTRICTION", mcu__restricted_areas=[]))
    assert set(s2.values()) == {"NEEDS_REVIEW"}


def test_uncontrolled_and_other_comorbid():
    s = statuses(facts(comorbid__active=["DIABETES"], comorbid__uncontrolled=["DIABETES"]))
    assert s["HEIGHT"] == "NEEDS_REVIEW" and s["HOT"] == "NEEDS_REVIEW" and s["COLD"] == "ALLOWED"
    s2 = statuses(facts(comorbid__active=["OTHER"], comorbid__uncontrolled=["OTHER"], comorbid__unverified=["OTHER"]))
    assert set(s2.values()) == {"NEEDS_REVIEW"}


def test_inconsistent_bp_needs_review():
    assert set(statuses(facts(bp__inconsistent_today=True)).values()) == {"NEEDS_REVIEW"}


def test_most_restrictive_wins():
    s = statuses(facts(bp__systolic=150, bp__diastolic=95, comorbid__active=["HEART_DISEASE"]))
    assert s == {"COLD": "NEEDS_REVIEW", "HOT": "DENIED", "HEIGHT": "DENIED", "RESTRICTED_GAS": "NEEDS_REVIEW"}


def test_missing_fact_never_allowed():
    # Tensi tercatat tetapi nilainya hilang -> tidak pasti -> NEEDS_REVIEW, bukan ALLOWED.
    res = evaluate(CFG, facts(bp__systolic=None, bp__diastolic=None))
    assert all(r["status"] == "NEEDS_REVIEW" for r in res["areas"].values())
    assert any(t["outcome"] == "UNCERTAIN" for t in res["trace"])


def test_broken_rule_is_uncertain_not_allowed():
    cfg = copy.deepcopy(CFG)
    cfg["rules"].append({"id": "RX", "name": "rusak", "when": {"fact": "bp.systolic", "op": "??"},
                         "effects": {"HOT": "DENIED"}, "reason": "BP_HIGH"})
    s = statuses(facts(), cfg)
    assert s["HOT"] == "NEEDS_REVIEW" and s["COLD"] == "ALLOWED"


def test_order_independent():
    f = facts(bp__systolic=150, bp__diastolic=95, comorbid__active=["ASTHMA_COPD"])
    expected = statuses(f)
    for seed in range(5):
        cfg = copy.deepcopy(CFG)
        random.Random(seed).shuffle(cfg["rules"])
        assert statuses(f, cfg) == expected


def test_validation_rejects_bad_config():
    cfg = copy.deepcopy(CFG)
    cfg["rules"][0]["when"] = {"fact": "tidak.ada", "op": "is_true"}
    cfg["rules"][1]["effects"] = {"HOT": "ALLOWED"}
    cfg["rules"][2]["id"] = cfg["rules"][3]["id"]
    errors = validate_config(cfg)
    assert any("tidak dikenal" in e for e in errors)
    assert any("ALLOWED tidak berpengaruh" in e for e in errors)
    assert any("duplikat" in e for e in errors)
