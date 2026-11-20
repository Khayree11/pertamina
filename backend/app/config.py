from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # .../backend


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "HBAC — Health-Based Access Control (Prototipe)"
    environment: str = "development"

    # Database: PostgreSQL (postgresql+psycopg://user:pass@host:5432/hbac).
    # Kosong = SQLite di backend/data/hbac.db (cadangan untuk pengembangan cepat).
    database_url: str = f"sqlite:///{(BASE_DIR / 'data' / 'hbac.db').as_posix()}"

    # Auth
    jwt_secret: str = "dev-only-secret-change-me-before-any-deployment"
    jwt_expire_minutes: int = 720
    cookie_name: str = "hbac_session"
    cookie_secure: bool = False

    timezone: str = "Asia/Jakarta"
    demo_mode: bool = True
    # Mode demo: akun PEKERJA hasil registrasi ikut tampil & bisa dibuka satu klik (tanpa password).
    # Matikan (false) bila orang sungguhan mendaftar dengan data kesehatan asli.
    demo_list_registered: bool = True
    seed_on_startup: bool = True
    # Password akun demo hasil seed. Di server publik isi dengan nilai acak (skrip deploy membuatnya otomatis).
    demo_password: str = ""
    cors_origins: str = "http://localhost:3000"

    data_dir: str = str(BASE_DIR / "data")
    knowledge_dir: str = str(BASE_DIR / "knowledge")
    max_upload_mb: int = 5

    # Gemini (tier gratis). Cek kuota terbaru di Google AI Studio — jangan diasumsikan.
    gemini_api_key: str = ""  # isi lewat GEMINI_API_KEY di backend/.env (jangan tulis key di kode)
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_fallback_models: str = "gemini-3.1-flash-lite,gemini-2.5-flash-lite"
    gemini_api_base: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout_seconds: float = 30.0
    gemini_max_retries: int = 3
    gemini_max_output_tokens: int = 1024
    gemini_thinking_level: str = ""  # kosong = default model; MINIMAL/LOW/MEDIUM/HIGH untuk Gemini 3+

    allow_self_registration: bool = True

    # WhatsApp API — kosong = mode SIMULASI. Bisa juga diatur admin lewat UI (menimpa .env).
    whatsapp_provider: str = ""  # META_CLOUD | GENERIC_HTTP | (kosong = simulasi)
    whatsapp_api_base: str = "https://graph.facebook.com"
    whatsapp_api_version: str = "v23.0"
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_template_name: str = ""
    whatsapp_template_lang: str = "id"
    whatsapp_gateway_url: str = ""
    whatsapp_gateway_token: str = ""
    whatsapp_gateway_auth_header: str = "Authorization"
    whatsapp_gateway_phone_field: str = "target"
    whatsapp_gateway_message_field: str = "message"
    whatsapp_gateway_format: str = "json"  # json | form

    # Integrasi (mock)
    device_api_key: str = "dev-device-key-change-me"
    k3_onduty_phone: str = "+6281100000000"
    k3_onduty_label: str = "Petugas K3 on-duty"

    # Scheduler internal
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 60
    reminder_hour_local: int = 7

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def model_chain(self) -> list[str]:
        models = [self.gemini_model.strip()]
        models += [m.strip() for m in self.gemini_fallback_models.split(",") if m.strip()]
        seen: list[str] = []
        for m in models:
            if m and m not in seen:
                seen.append(m)
        return seen

    @property
    def upload_dir(self) -> Path:
        return Path(self.data_dir) / "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
