"""Registrasi + pelengkapan profil, pengaturan WhatsApp API, dan percakapan asisten (mode lokal)."""
import httpx

from app.services.notifications import dispatch_pending

NEW = {
    "username": "nanda.k3",
    "password": "Rahasia123",
    "full_name": "Nanda Saputra",
    "employee_code": "ptm-2001",
    "unit": "MOR I",
    "phone": "0812 3456 7801",
    "email": "nanda@contoh.id",
    "consent": True,
}


def test_register_validation(client):
    client.cookies.clear()
    assert client.post("/api/auth/register", json={**NEW, "password": "abcdefgh"}).status_code == 422
    assert client.post("/api/auth/register", json={**NEW, "consent": False}).status_code == 422
    assert client.post("/api/auth/register", json={**NEW, "username": "budi"}).status_code == 409
    assert client.post("/api/auth/register", json={**NEW, "employee_code": "PTM-1001"}).status_code == 409


def test_registered_accounts_in_demo_list_toggle(client, monkeypatch):
    """Akun pekerja hasil registrasi tampil di daftar demo (bawaan), dan hilang bila DEMO_LIST_REGISTERED=false."""
    from app.config import get_settings

    client.cookies.clear()
    real = {**NEW, "username": "pekerja.baru", "employee_code": "ptm-2099", "phone": "0812 3456 7899", "email": "baru@contoh.id"}
    assert client.post("/api/auth/register", json=real).status_code == 200
    client.cookies.clear()

    accounts = {a["username"]: a for a in client.get("/api/auth/demo-accounts").json()["accounts"]}
    assert accounts["pekerja.baru"]["registered"] is True and accounts["pekerja.baru"]["role"] == "WORKER"
    assert accounts["pekerja.baru"]["scenario"].startswith("Akun hasil registrasi")
    assert accounts["budi"]["registered"] is False
    assert client.get("/api/meta").json()["demo_list_registered"] is True
    assert client.post("/api/auth/demo-login", json={"username": "pekerja.baru"}).status_code == 200
    client.cookies.clear()

    monkeypatch.setattr(get_settings(), "demo_list_registered", False)
    names = {a["username"] for a in client.get("/api/auth/demo-accounts").json()["accounts"]}
    assert {"admin", "budi"} <= names and "pekerja.baru" not in names
    assert client.post("/api/auth/demo-login", json={"username": "pekerja.baru"}).status_code == 404
    assert client.post("/api/auth/demo-login", json={"username": "budi"}).status_code == 200
    client.cookies.clear()


def test_register_and_onboarding_flow(client):
    client.cookies.clear()
    r = client.post("/api/auth/register", json=NEW)
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["role"] == "WORKER" and u["employee"]["employee_code"] == "PTM-2001"
    assert u["employee"]["registration_source"] == "SELF"
    assert u["onboarding"]["completed"] is False and u["onboarding"]["next_step"] == "general"
    assert client.post("/api/me/onboarding/complete").status_code == 400

    general = {
        "full_name": "Nanda Saputra",
        "position": "Operator Kilang",
        "unit": "MOR II",
        "work_location": "Kilang Unit III",
        "phone": "081234567801",
        "email": "nanda@contoh.id",
        "birth_date": "1994-05-17",
        "gender": "L",
        "emergency_contact_name": "Rina Saputra",
        "emergency_contact_phone": "081298765432",
    }
    r = client.put("/api/me/profile/general", json=general)
    assert r.status_code == 200, r.text
    assert r.json()["status"]["next_step"] == "mcu" and r.json()["profile"]["phone"] == "+6281234567801"

    st = client.post("/api/me/onboarding/mcu-defer").json()["status"]
    assert st["mcu"] == "DEFERRED" and st["next_step"] == "comorbid"
    st = client.post("/api/me/onboarding/comorbid-none").json()["status"]
    assert st["can_complete"] is True
    st = client.post("/api/me/onboarding/complete").json()["status"]
    assert st["completed"] is True and st["mcu_required"] is True

    # MCU belum ada + tensi belum diinput -> area khusus tetap ditolak (default aman).
    card = client.get("/api/me/card").json()["card"]
    assert {c["status"] for c in card} == {"DENIED"}
    pdf = b"%PDF-1.4\n%hasil\n"
    r = client.post(
        "/api/me/mcu",
        data={"mcu_date": "2026-09-01", "conclusion": "FIT"},
        files={"file": ("mcu.pdf", pdf, "application/pdf")},
    )
    assert r.status_code == 200, r.text
    assert client.get("/api/me/onboarding").json()["status"]["mcu"] == "DONE"
    me = client.get("/api/auth/me").json()["user"]
    assert me["onboarding"]["completed"] is True


def test_register_unit_must_be_mor_option(client):
    client.cookies.clear()
    for unit in ("", "Maintenance", "MOR VI"):
        payload = {**NEW, "username": f"unit-{len(unit)}-{unit or 'empty'}", "employee_code": f"PTM-{3000 + len(unit)}", "unit": unit}
        assert client.post("/api/auth/register", json=payload).status_code == 422


def test_whatsapp_settings_queue_and_dispatch(client, login):
    login("admin")
    s = client.get("/api/admin/settings/whatsapp").json()
    assert s["mode"] == "SIMULASI"

    r = client.put(
        "/api/admin/settings/whatsapp",
        json={"provider": "GENERIC_HTTP", "values": {"gateway_url": "https://gateway.example/send", "gateway_token": "tok-rahasia-9876"}},
    )
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["mode"] == "AKTIF" and "rahasia" not in v["values"]["gateway_token"] and v["values"]["gateway_token"].endswith("9876")

    # Simpan ulang dengan token bertopeng -> token lama dipertahankan.
    r = client.put("/api/admin/settings/whatsapp", json={"provider": "GENERIC_HTTP", "values": {**v["values"], "gateway_format": "form"}})
    assert r.json()["mode"] == "AKTIF" and r.json()["secrets_set"]["gateway_token"] is True

    assert client.post("/api/admin/notifications/remind-missing-bp").status_code == 200
    queued = client.get("/api/admin/notifications", params={"limit": 50}).json()["items"]
    assert any(n["status"] == "QUEUED" for n in queued)

    seen = []

    def handler(req: httpx.Request):
        seen.append((str(req.url), req.headers.get("authorization"), req.content.decode()))
        return httpx.Response(200, json={"status": True})

    res = dispatch_pending(client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert res["sent"] >= 1 and res["failed"] == 0
    assert seen[0][0] == "https://gateway.example/send" and seen[0][1] == "tok-rahasia-9876"
    assert "target=62" in seen[0][2]

    r = client.put("/api/admin/settings/whatsapp", json={"provider": "SIMULATION", "values": {}})
    assert r.json()["mode"] == "SIMULASI"


def test_chat_conversation_local_mode(client, login):
    login("budi")
    d = client.post("/api/chat", json={"question": "halo, apa kabar?"}).json()
    assert d["intent"] == "SMALL_TALK" and d["basis"] == "CONVERSATION" and "Asisten K3" in d["answer"]
    d = client.post("/api/chat", json={"question": "buatkan puisi cinta dong"}).json()
    assert d["basis"] == "OUT_OF_SCOPE"
    d = client.post("/api/chat", json={"question": "tolong saya nyeri dada sekarang di area boiler"}).json()
    assert d["intent"] == "EMERGENCY" and d["basis"] == "SAFETY" and d["sent_to_ai"]["sent"] is False
    d = client.post("/api/chat", json={"question": "apa yang harus dilakukan jika rekan pingsan di area panas?"}).json()
    assert d["intent"] != "EMERGENCY"
    d = client.post("/api/chat", json={"question": "Tips mencegah dehidrasi saat kerja di area panas?"}).json()
    assert d["basis"] == "DOCUMENTS" and d["sources"]
