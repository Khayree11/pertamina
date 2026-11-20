def test_staff_demo_accounts_listed_and_backfilled(client):
    from app.db import SessionLocal
    from app.seed import ensure_demo_staff

    client.cookies.clear()
    accounts = {a["username"]: a for a in client.get("/api/auth/demo-accounts").json()["accounts"]}
    assert accounts["klinik"]["role"] == "HEALTH" and accounts["security"]["role"] == "SECURITY"
    assert accounts["klinik"]["scenario"] and accounts["security"]["scenario"]
    assert client.post("/api/auth/demo-login", json={"username": "klinik"}).status_code == 200
    client.cookies.clear()
    # Database yang sudah berisi akun tidak diubah (idempoten).
    with SessionLocal() as db:
        assert ensure_demo_staff(db) == []


def test_ensure_demo_staff_fills_old_database(tmp_path):
    """Database lama (sebelum role HEALTH/SECURITY ada) mendapat akun staf baru tanpa reset."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app.db import Base
    from app.models import User
    from app.seed import ensure_demo_staff

    engine = create_engine(f"sqlite:///{tmp_path / 'lama.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(User(username="admin", password_hash="x", role="ADMIN", full_name="Admin lama"))
        db.flush()
        assert ensure_demo_staff(db) == ["klinik", "security"]
        roles = dict(db.execute(select(User.username, User.role)).all())
        assert roles == {"admin": "ADMIN", "klinik": "HEALTH", "security": "SECURITY"}
        assert ensure_demo_staff(db) == []
    engine.dispose()


def test_health_and_security_access_boundaries(client, login):
    login("security")
    security_dashboard = client.get("/api/admin/dashboard")
    assert security_dashboard.status_code == 403
    assert client.get("/api/admin/badge").status_code == 403
    assert client.get("/api/admin/review-queue").status_code == 403

    workers = client.get("/api/admin/employees").json()["items"]
    assert workers
    forbidden_list_keys = {"bp_today", "mcu", "urgent", "pending_verifications", "fit_to_drive"}
    assert not forbidden_list_keys.intersection(workers[0])

    worker = next(item for item in workers if item["employee_code"] == "PTM-1001")
    detail = client.get(f"/api/admin/employees/{worker['id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert "fit_to_drive" not in body
    assert body["bp_history"] == []
    assert body["mcu"] == []
    assert body["comorbidities"] == []
    assert all("reasons" not in area for area in body["card"])

    login("klinik")
    assert client.get("/api/admin/dashboard").status_code == 200
    assert client.get("/api/admin/review-queue").status_code == 200
    health_workers = client.get("/api/admin/employees").json()["items"]
    assert "bp_today" in health_workers[0]
