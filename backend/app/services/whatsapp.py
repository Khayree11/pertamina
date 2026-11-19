"""Penyedia WhatsApp: SIMULASI (default), WhatsApp Cloud API (Meta), atau gateway HTTP generik.

Konfigurasi dibaca dari pengaturan admin (tabel app_settings, kunci "whatsapp") lalu dari .env.
Jika tidak ada konfigurasi yang lengkap, sistem OTOMATIS memakai mode simulasi.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AppSetting
from ..timeutil import utcnow

SETTING_KEY = "whatsapp"
PROVIDERS = {
    "SIMULATION": "Simulasi (tanpa pengiriman nyata)",
    "META_CLOUD": "WhatsApp Business Cloud API (Meta)",
    "GENERIC_HTTP": "Gateway HTTP (mis. Fonnte, Wablas, Qontak)",
}
SECRET_FIELDS = {"access_token", "gateway_token"}
FIELDS = {
    "META_CLOUD": ["api_base", "api_version", "phone_number_id", "access_token", "template_name", "template_lang"],
    "GENERIC_HTTP": ["gateway_url", "gateway_token", "gateway_auth_header", "gateway_phone_field", "gateway_message_field", "gateway_format"],
}
REQUIRED = {
    "META_CLOUD": ["phone_number_id", "access_token"],
    "GENERIC_HTTP": ["gateway_url", "gateway_token"],
}


@dataclass
class WAConfig:
    provider: str = "SIMULATION"
    source: str = "none"  # db | env | none
    values: dict = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)

    @property
    def active(self) -> bool:
        return self.provider in REQUIRED and not self.missing


def _env_values() -> tuple[str, dict]:
    s = get_settings()
    vals = {
        "api_base": s.whatsapp_api_base,
        "api_version": s.whatsapp_api_version,
        "phone_number_id": s.whatsapp_phone_number_id,
        "access_token": s.whatsapp_access_token,
        "template_name": s.whatsapp_template_name,
        "template_lang": s.whatsapp_template_lang,
        "gateway_url": s.whatsapp_gateway_url,
        "gateway_token": s.whatsapp_gateway_token,
        "gateway_auth_header": s.whatsapp_gateway_auth_header,
        "gateway_phone_field": s.whatsapp_gateway_phone_field,
        "gateway_message_field": s.whatsapp_gateway_message_field,
        "gateway_format": s.whatsapp_gateway_format,
    }
    return (s.whatsapp_provider or "").strip().upper(), vals


def resolve(db: Session) -> WAConfig:
    env_provider, env_vals = _env_values()
    row = db.get(AppSetting, SETTING_KEY)
    if row and row.value.get("provider"):
        provider, source = row.value["provider"], "db"
        values = {**env_vals, **{k: v for k, v in (row.value.get("values") or {}).items() if v not in (None, "")}}
    elif env_provider in REQUIRED:
        provider, source, values = env_provider, "env", env_vals
    else:
        return WAConfig()
    if provider not in REQUIRED:
        return WAConfig(provider="SIMULATION", source=source, values=values)
    missing = [f for f in REQUIRED[provider] if not str(values.get(f) or "").strip()]
    return WAConfig(provider=provider, source=source, values=values, missing=missing)


def mask(value: str | None) -> str:
    if not value:
        return ""
    return "•" * 6 + value[-4:] if len(value) > 6 else "•" * len(value)


def public_view(cfg: WAConfig) -> dict:
    vals = {k: (mask(v) if k in SECRET_FIELDS else v) for k, v in cfg.values.items()}
    return {
        "mode": "AKTIF" if cfg.active else "SIMULASI",
        "provider": cfg.provider,
        "provider_label": PROVIDERS.get(cfg.provider, cfg.provider),
        "source": cfg.source,
        "values": vals,
        "secrets_set": {k: bool(cfg.values.get(k)) for k in SECRET_FIELDS},
        "missing": cfg.missing,
        "providers": PROVIDERS,
        "fields": FIELDS,
        "required": REQUIRED,
    }


def save(db: Session, provider: str, values: dict, user_id: int) -> WAConfig:
    provider = (provider or "SIMULATION").upper()
    if provider not in PROVIDERS:
        raise ValueError("Provider tidak dikenal")
    row = db.get(AppSetting, SETTING_KEY)
    old = dict((row.value.get("values") or {}) if row else {})
    clean: dict = {}
    for k in set(FIELDS.get("META_CLOUD", []) + FIELDS.get("GENERIC_HTTP", [])):
        v = values.get(k)
        if k in SECRET_FIELDS:
            # Kosong / masih bertopeng = pertahankan token lama.
            if v is None or str(v).strip() == "" or str(v).startswith("•"):
                v = old.get(k, "")
        clean[k] = str(v).strip()[:2000] if v is not None else ""
    if row is None:
        row = AppSetting(key=SETTING_KEY)
        db.add(row)
    row.value = {"provider": provider, "values": clean}
    row.updated_at = utcnow()
    row.updated_by_user_id = user_id
    db.flush()
    return resolve(db)


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    return digits


@dataclass
class SendResult:
    ok: bool
    status: str  # SIMULATED / SENT / FAILED
    provider: str
    detail: str | None = None


def send(cfg: WAConfig, to_phone: str, message: str, client: httpx.Client | None = None) -> SendResult:
    if not cfg.active:
        return SendResult(True, "SIMULATED", "MOCK_WHATSAPP")
    to = normalize_phone(to_phone)
    if len(to) < 9:
        return SendResult(False, "FAILED", cfg.provider, "Nomor tujuan tidak valid")
    v = cfg.values
    own = client is None
    client = client or httpx.Client(timeout=15)
    try:
        if cfg.provider == "META_CLOUD":
            url = f"{v.get('api_base', 'https://graph.facebook.com').rstrip('/')}/{v.get('api_version') or 'v23.0'}/{v['phone_number_id']}/messages"
            if v.get("template_name"):
                body = {
                    "messaging_product": "whatsapp",
                    "to": to,
                    "type": "template",
                    "template": {
                        "name": v["template_name"],
                        "language": {"code": v.get("template_lang") or "id"},
                        "components": [{"type": "body", "parameters": [{"type": "text", "text": message[:1000]}]}],
                    },
                }
            else:
                body = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": message[:4096]}}
            resp = client.post(url, json=body, headers={"Authorization": f"Bearer {v['access_token']}"})
        else:
            header = v.get("gateway_auth_header") or "Authorization"
            payload = {v.get("gateway_phone_field") or "target": to, v.get("gateway_message_field") or "message": message}
            headers = {header: v["gateway_token"]}
            if (v.get("gateway_format") or "json").lower() == "form":
                resp = client.post(v["gateway_url"], data=payload, headers=headers)
            else:
                resp = client.post(v["gateway_url"], json=payload, headers=headers)
        if 200 <= resp.status_code < 300:
            return SendResult(True, "SENT", cfg.provider, f"HTTP {resp.status_code}")
        return SendResult(False, "FAILED", cfg.provider, f"HTTP {resp.status_code}: {resp.text[:200]}")
    except httpx.HTTPError as exc:
        return SendResult(False, "FAILED", cfg.provider, f"Jaringan: {type(exc).__name__}")
    finally:
        if own:
            client.close()
