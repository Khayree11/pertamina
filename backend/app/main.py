import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import func, select
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import audit  # noqa: F401  (mendaftarkan trigger append-only audit log)
from .ai.ingest import ingest_directory, rebuild_index
from .config import get_settings
from .db import WRITE_LOCK, Base, SessionLocal, db_label, engine
from .db_migrate import ensure_columns
from .models import Employee, User
from .routers import access, admin, auth, chat, files, me, meta
from .seed import seed_all
from .services import DomainError
from .services.notifications import dispatch_pending
from .services.scheduler import last_run, run_sweep, scheduler_loop
from .timeutil import iso, utcnow

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("hbac")
settings = get_settings()


def _backfill_profiles(db) -> None:
    """Pekerja lama (sebelum fitur registrasi) dianggap sudah lengkap profilnya."""
    for emp in db.scalars(select(Employee).where(Employee.registration_source.is_(None))):
        emp.registration_source = "ADMIN"
        emp.profile_general_done_at = emp.profile_general_done_at or emp.created_at
        emp.comorbid_declared_at = emp.comorbid_declared_at or emp.created_at
        emp.profile_completed_at = emp.profile_completed_at or emp.created_at


async def dispatch_loop() -> None:  # pragma: no cover - loop latar
    while True:
        await asyncio.sleep(5)
        try:
            await asyncio.to_thread(dispatch_pending)
        except Exception:
            logger.exception("Dispatcher WhatsApp gagal")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Database: %s", engine.url.render_as_string(hide_password=True))
    Base.metadata.create_all(engine)
    ensure_columns(engine)
    with WRITE_LOCK, SessionLocal() as db:
        if settings.seed_on_startup and not db.scalar(select(func.count(User.id))):
            logger.info("Database kosong - mengisi data demo")
            seed_all(db)
        _backfill_profiles(db)
        ingest_directory(db, settings.knowledge_dir)
        db.commit()
        stats = rebuild_index(db)
        logger.info("Indeks RAG: %s", stats)
    if settings.jwt_secret.startswith("dev-only") and settings.environment != "development":
        logger.warning("JWT_SECRET masih default - ganti untuk lingkungan non-development!")
    await asyncio.to_thread(run_sweep)
    tasks = [asyncio.create_task(scheduler_loop()), asyncio.create_task(dispatch_loop())] if settings.scheduler_enabled else []
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(
    title="HBAC — Health-Based Access Control API (Prototipe)",
    description="Prototipe tender: tensi harian + MCU + komorbid -> kelayakan per area -> hak akses kartu.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_store(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        # Data kesehatan tidak boleh di-cache browser/proxy.
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


_FIELD_LABELS = {
    "systolic": "Sistolik",
    "diastolic": "Diastolik",
    "pulse": "Nadi",
    "reason": "Alasan",
    "note": "Catatan",
    "duration_minutes": "Durasi",
    "mcu_date": "Tanggal MCU",
    "conclusion": "Kesimpulan",
    "question": "Pertanyaan",
    "approved_by_name": "Nama penyetuju",
    "approval_note": "Catatan persetujuan",
    "username": "Username",
    "password": "Password",
    "identifier": "Employee ID / kartu",
    "room_code": "Kode ruangan",
}


def _translate(err: dict) -> str:
    t = err.get("type", "")
    ctx = err.get("ctx") or {}
    if t == "missing":
        return "Wajib diisi"
    if t in ("greater_than_equal", "greater_than"):
        return f"Minimal {ctx.get('ge', ctx.get('gt'))}"
    if t in ("less_than_equal", "less_than"):
        return f"Maksimal {ctx.get('le', ctx.get('lt'))}"
    if t == "string_too_short":
        return f"Minimal {ctx.get('min_length')} karakter"
    if t == "string_too_long":
        return f"Maksimal {ctx.get('max_length')} karakter"
    if t in ("int_parsing", "int_type", "int_from_float"):
        return "Harus berupa angka bulat"
    if t.startswith("date") or t.startswith("datetime"):
        return "Format tanggal tidak valid"
    if t in ("literal_error", "enum"):
        return "Pilihan tidak valid"
    if t == "too_long":
        return "Terlalu banyak item"
    if t == "value_error":
        return str(err.get("msg", "")).removeprefix("Value error, ")
    return str(err.get("msg", "Tidak valid"))


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        loc = [str(x) for x in e.get("loc", []) if x not in ("body", "query", "path", "form", "header")]
        field = loc[-1] if loc else ""
        msg = _translate(e)
        label = _FIELD_LABELS.get(field, field)
        errors.append({"field": field, "message": f"{label}: {msg}" if label else msg})
    detail = errors[0]["message"] if errors else "Data tidak valid"
    return JSONResponse(status_code=422, content={"detail": detail, "errors": errors})


@app.exception_handler(DomainError)
async def domain_handler(request: Request, exc: DomainError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=getattr(exc, "headers", None))


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):  # pragma: no cover
    logger.exception("Kesalahan tak tertangani pada %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Terjadi kesalahan pada server"})


for r in (auth.router, meta.router, me.router, admin.router, access.router, chat.router, files.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok", "time": iso(utcnow()), "scheduler": last_run}


@app.get("/", include_in_schema=False, response_class=HTMLResponse)
def root():
    """Port 8000 hanya API. Halaman ini mengarahkan pengguna ke aplikasi web (frontend)."""
    frontend = next((o.strip() for o in settings.cors_origins.split(",") if o.strip()), "http://localhost:3000")
    db = db_label()
    return f"""<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HBAC API</title><style>
body{{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0b1f2a;color:#e2e8f0;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}}
main{{max-width:520px;background:#12303f;border-radius:16px;padding:28px}}h1{{margin:0 0 4px;font-size:22px}}p{{color:#94a3b8;line-height:1.6}}
a.btn{{display:inline-block;background:#17718e;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600;margin:4px 8px 4px 0}}
a.alt{{background:transparent;border:1px solid #2b4a5a}}code{{background:#0b1f2a;padding:2px 6px;border-radius:6px}}</style></head>
<body><main><h1>HBAC API berjalan ✓</h1>
<p>Ini server <strong>API backend</strong> (port 8000) — bukan tampilan aplikasi. Database: <code>{db}</code>.</p>
<p>Buka aplikasi web di <strong>{frontend}</strong> (jalankan <code>npm run dev</code> di folder <code>frontend</code>).</p>
<a class="btn" href="{frontend}">Buka aplikasi HBAC</a><a class="btn alt" href="/docs">Dokumentasi API</a><a class="btn alt" href="/api/health">Status</a>
</main></body></html>"""
