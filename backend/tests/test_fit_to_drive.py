from types import SimpleNamespace

from app.constants import FIT_TO_DRIVE, UNFIT_TO_DRIVE
from app.services.facts import evaluate_fit_to_drive


def facts(**values):
    base = {
        "bp.submitted_today": True,
        "bp.systolic": 120,
        "bp.diastolic": 80,
        "mcu.exists": True,
        "mcu.expired": False,
        "mcu.verified": True,
        "mcu.conclusion": "FIT",
    }
    base.update(values)
    return base


def test_missing_bp_is_immediately_unfit():
    result = evaluate_fit_to_drive(facts(**{"bp.submitted_today": False}), [], {"settings": {}})
    assert result == {"status": UNFIT_TO_DRIVE, "reasons": ["FTD_BP_NOT_SUBMITTED"]}


def test_normal_bp_and_verified_mcu_is_fit():
    result = evaluate_fit_to_drive(facts(), [], {"settings": {}})
    assert result == {"status": FIT_TO_DRIVE, "reasons": []}


def test_bp_thresholds_use_configured_values():
    config = {"settings": {"bp_high_systolic": 130, "bp_high_diastolic": 85, "bp_critical_systolic": 170, "bp_critical_diastolic": 105}}
    high = evaluate_fit_to_drive(facts(**{"bp.systolic": 130}), [], config)
    critical = evaluate_fit_to_drive(facts(**{"bp.diastolic": 105}), [], config)
    assert high["reasons"] == ["FTD_BP_HIGH"]
    assert critical["reasons"] == ["FTD_BP_VERY_HIGH"]


def test_invalid_mcu_and_active_epilepsy_are_reported_together():
    epilepsy = SimpleNamespace(condition_code="EPILEPSY", active=True)
    result = evaluate_fit_to_drive(
        facts(**{"mcu.verified": False, "mcu.conclusion": "PENDING"}),
        [epilepsy],
        {"settings": {}},
    )
    assert result["status"] == UNFIT_TO_DRIVE
    assert result["reasons"] == ["FTD_MCU_INVALID", "FTD_EPILEPSY"]


def test_unfit_or_expired_mcu_is_reported():
    unfit = evaluate_fit_to_drive(facts(**{"mcu.conclusion": "UNFIT"}), [], {"settings": {}})
    expired = evaluate_fit_to_drive(facts(**{"mcu.expired": True}), [], {"settings": {}})
    assert unfit["reasons"] == ["FTD_MCU_UNFIT"]
    assert expired["reasons"] == ["FTD_MCU_INVALID"]
