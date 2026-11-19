"""Uji alur demo end-to-end (§9) melalui API."""
import copy
from datetime import timedelta

import pytest
from sqlalchemy import select, text

from app.db import SessionLocal, engine
from app.models import AccessOverride, CardAccess, Employee
from app.services.scheduler import run_sweep
from app.timeutil import utcnow

DEVICE_KEY = "dev-device-key-change-me"


def card_map(card):
    return {c["area"]["code"]: c for c in card}


def test_worker_without_bp_is_denied_then_allowed(client, login):
    login("budi")
    d = client.get("/api/me/dashboard").json()
    assert d["today"]["bp_submitted"] is False
    cm = card_map(d["card"])
    assert {c["status"] for c in cm.values()} == {"DENIED"}
    assert cm["HEIGHT"]["reasons"][0]["code"] == "BP_NOT_SUBMITTED"

    tap = client.post("/api/acs/tap", json={"identifier": "CARD-0001001", "room_code": "HGT-01"}).json()
    assert tap["result"] == "DENIED" and tap["reason_category"] == "NOT_SCREENED_TODAY"
    # Akses umum tetap aktif.
    gate = client.post("/api/acs/tap", json={"identifier": "PTM-1001", "room_code": "GEN-GATE-01"}).json()
    assert gate["result"] == "GRANTED"

    r = client.post("/api/me/bp", json={"systolic": 120, "diastolic": 80, "pulse": 72})
    assert r.status_code == 200, r.text
    assert {c["status"] for c in r.json()["card"]} == {"ALLOWED"}
    tap = client.post("/api/acs/tap", json={"identifier": "CARD-0001001", "room_code": "HGT-01"}).json()
    assert tap["result"] == "GRANTED"


def test_high_bp_matches_rule_table(client, login):
    login("budi")
    r = client.post("/api/me/bp", json={"systolic": 150, "diastolic": 95})
    assert r.status_code == 200, r.text
    cm = card_map(r.json()["card"])
    assert cm["HEIGHT"]["status"] == "DENIED" and cm["HOT"]["status"] == "DENIED"
    assert cm["COLD"]["status"] == "NEEDS_REVIEW" and cm["RESTRICTED_GAS"]["status"] == "NEEDS_REVIEW"
    # Notifikasi WA tidak boleh memuat nilai tensi.
    notifs = client.get("/api/me/notifications").json()["items"]
    assert any(n["template"] == "CARD_STATUS_CHANGED" for n in notifs)
    assert all("150" not in n["message"] and "95" not in n["message"] for n in notifs)
    # Alasan untuk pekerja hanya versi singkat (tanpa field detail).
    assert "detail" not in cm["HEIGHT"]["reasons"][0]


def test_bp_validation(client, login):
    login("budi")
    r = client.post("/api/me/bp", json={"systolic": 80, "diastolic": 90})
    assert r.status_code == 422
    assert "Sistolik" in r.json()["detail"]
    r = client.post("/api/me/bp", json={"systolic": 300, "diastolic": 90})
    assert r.status_code == 422


def test_worker_boundaries(client, login):
    login("budi")
    assert client.get("/api/admin/dashboard").status_code == 403
    r = client.post("/api/acs/tap", json={"identifier": "PTM-1002", "room_code": "HGT-01"})
    assert r.status_code == 403


def test_override_controls_and_temporary_tap(client, login):
    login("admin")
    emps = {e["employee_code"]: e for e in client.get("/api/admin/employees").json()["items"]}
    siti = emps["PTM-1002"]
    assert siti["areas"]["RESTRICTED_GAS"]["status"] == "NEEDS_REVIEW"

    base = {"employee_id": siti["id"], "area_code": "RESTRICTED_GAS", "new_status": "ALLOWED",
            "duration_minutes": 60, "reason": "Review spirometri hari ini baik, izin terbatas"}
    r = client.post("/api/admin/overrides", json=base)
    assert r.status_code == 400 and "konfirmasi risiko" in r.json()["detail"]
    r = client.post("/api/admin/overrides", json={**base, "duration_minutes": 13 * 60, "risk_acknowledged": True})
    assert r.status_code == 400
    r = client.post("/api/admin/overrides", json={**base, "reason": "pendek"})
    assert r.status_code == 422
    r = client.post("/api/admin/overrides", json={**base, "risk_acknowledged": True, "kind": "REVIEW_DECISION"})
    assert r.status_code == 200, r.text
    cm = card_map(r.json()["card"])
    assert cm["RESTRICTED_GAS"]["source"] == "OVERRIDE" and cm["RESTRICTED_GAS"]["status"] == "ALLOWED"

    tap = client.post("/api/acs/tap", json={"identifier": "PTM-1002", "room_code": "GAS-01"}).json()
    assert tap["result"] == "TEMPORARY" and tap["valid_until"]

    teguh = emps["PTM-1008"]
    r = client.post("/api/admin/overrides", json={"employee_id": teguh["id"], "area_code": "HOT", "new_status": "ALLOWED",
                                                  "duration_minutes": 60, "reason": "Mencoba membuka akses panas",
                                                  "risk_acknowledged": True})
    assert r.status_code == 400 and "hard stop" in r.json()["detail"]


def test_override_auto_revoked_when_condition_worsens(client, login):
    login("siti")
    r = client.post("/api/me/bp", json={"systolic": 186, "diastolic": 116})
    assert r.status_code == 200, r.text
    cm = card_map(r.json()["card"])
    assert cm["RESTRICTED_GAS"]["source"] == "AUTO" and cm["RESTRICTED_GAS"]["status"] == "DENIED"
    login("admin")
    items = client.get("/api/admin/overrides", params={"state": "AUTO_REVOKED"}).json()["items"]
    assert any(o["employee"]["employee_code"] == "PTM-1002" for o in items)
    queue = client.get("/api/admin/review-queue").json()
    assert any(u["employee"]["employee_code"] == "PTM-1002" for u in queue["urgent"])


def test_mcu_verification_flow(client, login):
    login("admin")
    queue = client.get("/api/admin/review-queue").json()
    pend = [m for m in queue["pending_mcu"] if m["employee"]["employee_code"] == "PTM-1009"]
    assert pend
    emps = {e["employee_code"]: e for e in client.get("/api/admin/employees").json()["items"]}
    assert set(v["status"] for v in emps["PTM-1009"]["areas"].values()) == {"NEEDS_REVIEW"}
    r = client.post(f"/api/admin/mcu/{pend[0]['id']}/verify", json={"decision": "VERIFIED", "note": "Sesuai dokumen klinik"})
    assert r.status_code == 200, r.text
    emps = {e["employee_code"]: e for e in client.get("/api/admin/employees").json()["items"]}
    assert set(v["status"] for v in emps["PTM-1009"]["areas"].values()) == {"ALLOWED"}


def test_worker_mcu_upload_is_unverified(client, login):
    login("dewi")
    r = client.post(
        "/api/me/mcu",
        data={"mcu_date": "2026-01-05", "conclusion": "FIT_WITH_RESTRICTION", "restricted_areas": ""},
    )
    assert r.status_code == 400  # restriksi wajib memilih area
    pdf = b"%PDF-1.4\n%demo\n"
    from app.timeutil import today_local

    r = client.post(
        "/api/me/mcu",
        data={"mcu_date": today_local().isoformat(), "conclusion": "FIT", "provider": "Klinik Uji"},
        files={"file": ("hasil.pdf", pdf, "application/pdf")},
    )
    assert r.status_code == 200, r.text
    item = r.json()["item"]
    assert item["verification_status"] == "UNVERIFIED" and item["has_document"]
    assert set(c["status"] for c in r.json()["card"]) == {"NEEDS_REVIEW"}
    assert client.get(f"/api/files/mcu/{item['id']}").status_code == 200
    login("budi")
    assert client.get(f"/api/files/mcu/{item['id']}").status_code == 403


def test_comorbid_input_and_lock_after_verification(client, login):
    login("maya")
    r = client.post("/api/me/comorbidities", json={"condition_code": "EPILEPSY", "controlled": True})
    assert r.status_code == 200, r.text
    cid = r.json()["item"]["id"]
    assert card_map(r.json()["card"])["HEIGHT"]["status"] == "NEEDS_REVIEW"
    login("admin")
    assert client.post(f"/api/admin/comorbidities/{cid}/verify", json={"decision": "VERIFIED", "note": "Sesuai rekam medis"}).status_code == 200
    login("maya")
    r = client.patch(f"/api/me/comorbidities/{cid}", json={"active": False})
    assert r.status_code == 400


def test_chat_fallback_and_sanitizer(client, login):
    login("budi")
    r = client.post("/api/chat", json={"question": "Kenapa saya tidak bisa masuk area ketinggian?"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["provider_status"] == "FALLBACK_NO_KEY"
    assert d["status_block"] and d["status_block"]["focus_area"] == "HEIGHT"
    assert d["sources"]
    assert set(d["sent_to_ai"]["personal_context"]) <= {"comorbid_categories", "area"}

    q = "Saya Budi Santoso PTM-1001 kartu CARD-0001001, tensi 150/95 tanggal 10/11/2026, hp 081234567890, boleh masuk area panas?"
    d = client.post("/api/chat", json={"question": q}).json()
    sent = d["sent_to_ai"]["question"]
    for leaked in ("Budi", "Santoso", "PTM-1001", "CARD-0001001", "150/95", "10/11/2026", "081234567890"):
        assert leaked not in sent, (leaked, sent)
    login("admin")
    logs = client.get("/api/admin/ai-logs").json()["items"]
    assert logs and all("Budi" not in (l["sanitized_question"] or "") for l in logs)


def test_device_api(client):
    r = client.post("/api/device/v1/tap", json={"card_number": "CARD-0001010", "room_code": "HGT-01"})
    assert r.status_code == 401
    r = client.post("/api/device/v1/tap", json={"card_number": "CARD-0001010", "room_code": "HGT-01"},
                    headers={"X-Device-Key": DEVICE_KEY})
    assert r.status_code == 200 and r.json()["result"] in ("GRANTED", "TEMPORARY", "DENIED")
    r = client.get("/api/device/v1/cards/CARD-0001010/permissions", headers={"X-Device-Key": DEVICE_KEY})
    assert r.status_code == 200
    # Sistem kartu tidak menerima data medis.
    perm = r.json()["permissions"][0]
    assert set(perm) == {"area", "area_label", "permission", "valid_until", "reason_category", "max_duration_minutes"}


def test_acs_outage_uses_cache_then_resyncs(client, login):
    login("admin")
    emps = {e["employee_code"]: e for e in client.get("/api/admin/employees").json()["items"]}
    joko = emps["PTM-1010"]
    assert joko["areas"]["HEIGHT"]["status"] == "ALLOWED"
    assert client.post("/api/admin/integrations/acs-outage", json={"simulate_outage": True}).status_code == 200
    r = client.post("/api/admin/overrides", json={"employee_id": joko["id"], "area_code": "HEIGHT", "new_status": "DENIED",
                                                  "duration_minutes": 30, "reason": "Pekerja tampak pucat, tunda kerja ketinggian"})
    assert r.status_code == 200, r.text
    tap = client.post("/api/acs/tap", json={"identifier": "PTM-1010", "room_code": "HGT-01"}).json()
    assert tap["result"] == "GRANTED"  # reader masih memakai cache izin terakhir
    r = client.post("/api/admin/integrations/acs-outage", json={"simulate_outage": False})
    assert r.json()["retried"] >= 1
    tap = client.post("/api/acs/tap", json={"identifier": "PTM-1010", "room_code": "HGT-01"}).json()
    assert tap["result"] == "DENIED" and tap["reason_category"] == "ADMIN_RESTRICTED"


def test_scheduler_expires_override_and_stale_status(client, login):
    with SessionLocal() as db:
        ov = db.scalars(select(AccessOverride).where(AccessOverride.state == "ACTIVE")).first()
        assert ov is not None
        ov.valid_until = utcnow() - timedelta(minutes=1)
        emp = db.scalars(select(Employee).where(Employee.employee_code == "PTM-1011")).first()
        for ca in db.scalars(select(CardAccess).where(CardAccess.employee_id == emp.id)):
            ca.auto_valid_until = utcnow() - timedelta(minutes=1)
        db.commit()
        ov_id = ov.id
    stats = run_sweep()
    assert stats["overrides_expired"] >= 1 and stats["reassessed"] >= 1
    with SessionLocal() as db:
        assert db.get(AccessOverride, ov_id).state == "EXPIRED"


def test_rule_version_preview_and_activation(client, login):
    login("admin")
    rules = client.get("/api/admin/rules").json()["items"]
    active = next(r for r in rules if r["status"] == "ACTIVE")
    cfg = copy.deepcopy(client.get(f"/api/admin/rules/{active['id']}").json()["config"])
    r02 = next(r for r in cfg["rules"] if r["id"] == "R02")
    r02["when"]["all"][1]["any"][0]["value"] = 150
    r02["when"]["all"][1]["any"][1]["value"] = 95

    bad = copy.deepcopy(cfg)
    bad["rules"][0]["effects"] = {"HOT": "ALLOWED"}
    assert client.post("/api/admin/rules/preview", json={"config": bad}).status_code == 422

    prev = client.post("/api/admin/rules/preview", json={"config": cfg}).json()
    assert any(c["employee"]["employee_code"] == "PTM-1003" for c in prev["changes"])
    created = client.post("/api/admin/rules", json={"label": "Uji ambang 150/95", "config": cfg}).json()
    r = client.post(f"/api/admin/rules/{created['id']}/activate",
                    json={"approved_by_name": "dr. Penguji", "approval_note": "Uji otomatis"})
    assert r.status_code == 200 and r.json()["reassessed"] == 12
    assert client.get("/api/meta").json()["rule_version"]["version"] == created["version"]
    # Kembalikan versi awal.
    r = client.post(f"/api/admin/rules/{active['id']}/activate",
                    json={"approved_by_name": "dr. Penguji", "approval_note": "Rollback uji"})
    assert r.status_code == 200


def test_audit_chain_and_append_only(client, login):
    login("admin")
    v = client.get("/api/admin/audit/verify").json()
    assert v["ok"] is True and v["checked"] > 10
    with pytest.raises(Exception):
        with engine.begin() as conn:
            conn.execute(text("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = 1"))
    with pytest.raises(Exception):
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM audit_logs WHERE id = 1"))
    assert client.get("/api/admin/audit/verify").json()["ok"] is True


def test_root_page_points_to_frontend(client):
    r = client.get("/")
    assert r.status_code == 200 and "localhost:3000" in r.text and "/docs" in r.text


def test_light_status_endpoints(client, login):
    login("rizky")
    s = client.get("/api/me/status").json()
    assert s["bp_submitted"] is False and set(s["areas"]) == {"COLD", "HOT", "HEIGHT", "RESTRICTED_GAS"}
    login("admin")
    b = client.get("/api/admin/badge").json()
    assert b["total"] == b["urgent"] + b["needs_review_pairs"] + b["pending_verifications"]


def test_dashboard_and_integrations(client, login):
    login("admin")
    d = client.get("/api/admin/dashboard").json()
    assert d["kpi"]["total_workers"] == 12
    assert len(d["compliance_trend"]) == 14
    i = client.get("/api/admin/integrations").json()
    assert i["rag"]["chunks"] > 10 and i["ai"]["configured"] is False
    assert client.post("/api/admin/notifications/remind-missing-bp").status_code == 200
