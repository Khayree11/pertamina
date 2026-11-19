import threading
from datetime import timezone

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.types import TypeDecorator

from .config import get_settings

settings = get_settings()

_connect_args = {"check_same_thread": False, "timeout": 30} if settings.is_sqlite else {}
engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=not settings.is_sqlite,
)

if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - koneksi
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.close()


def db_label() -> str:
    """Nama mesin database untuk ditampilkan."""
    return {"postgresql": "PostgreSQL", "sqlite": "SQLite"}.get(engine.dialect.name, engine.dialect.name)


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# Semua penulisan (request mutasi + scheduler) diserialkan dalam satu proses supaya
# rantai hash audit log konsisten. Untuk multi-instance gunakan advisory lock PostgreSQL.
WRITE_LOCK = threading.Lock()


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """Simpan datetime sebagai UTC naive di DB, kembalikan sebagai UTC aware."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)
