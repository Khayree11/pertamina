"""Konfigurasi pengujian.

Default: SQLite sementara. Jika TEST_DATABASE_URL tersedia (env atau backend/.env), tes memakai
database PostgreSQL tersebut (`hbac_test`) — tabel dihapus & dibuat ulang di awal sesi (JANGAN arahkan ke database utama).
"""
import os
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _from_env_file(key: str) -> str | None:
    env = BACKEND / ".env"
    if not env.exists():
        return None
    for line in env.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith(f"{key}="):
            return line.split("=", 1)[1].strip() or None
    return None


_TMP = tempfile.mkdtemp(prefix="hbac-test-")
TEST_DB = os.environ.get("TEST_DATABASE_URL") or _from_env_file("TEST_DATABASE_URL")
os.environ["DATABASE_URL"] = TEST_DB or f"sqlite:///{Path(_TMP, 'test.db').as_posix()}"
os.environ["DATA_DIR"] = _TMP
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["SEED_ON_STARTUP"] = "true"
os.environ["DEMO_MODE"] = "true"
os.environ["GEMINI_API_KEY"] = ""
os.environ["WHATSAPP_PROVIDER"] = ""

sys.path.insert(0, str(BACKEND))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import audit  # noqa: E402,F401
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD  # noqa: E402

if TEST_DB:
    from sqlalchemy.engine import make_url  # noqa: E402

    main_db = _from_env_file("DATABASE_URL")
    test_name = make_url(TEST_DB).database
    assert test_name != "hbac" and (not main_db or make_url(main_db).database != test_name), (
        "TEST_DATABASE_URL tidak boleh menunjuk database utama"
    )
    Base.metadata.drop_all(engine)


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def login(client):
    def _login(username: str):
        client.cookies.clear()
        r = client.post("/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})
        assert r.status_code == 200, r.text
        return r.json()["user"]

    return _login
