"""Klien Gemini API (REST generateContent) dengan lapisan abstraksi model.

* Satu konfigurasi nama model (GEMINI_MODEL) + daftar cadangan (GEMINI_FALLBACK_MODELS).
* Retry + exponential backoff untuk 429/5xx; pindah ke model cadangan jika kuota habis.
* Mengembalikan status terstruktur agar pemanggil bisa memberi pesan fallback.
"""
from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field

import httpx

from ..config import get_settings
from ..timeutil import iso, utcnow


@dataclass
class GenerationResult:
    ok: bool
    text: str = ""
    model: str | None = None
    status: str = "OK"  # OK / NO_KEY / QUOTA_EXHAUSTED / ERROR / BLOCKED
    error: str | None = None
    attempts: list[dict] = field(default_factory=list)
    usage: dict | None = None


_stats_lock = threading.Lock()
_stats: dict = {
    "calls": 0,
    "ok": 0,
    "quota_exhausted": 0,
    "errors": 0,
    "last_status": None,
    "last_model": None,
    "last_error": None,
    "last_call_at": None,
}


def stats() -> dict:
    with _stats_lock:
        return dict(_stats)


def _record(result: GenerationResult) -> None:
    with _stats_lock:
        _stats["calls"] += 1
        _stats["last_status"] = result.status
        _stats["last_model"] = result.model
        _stats["last_error"] = result.error
        _stats["last_call_at"] = iso(utcnow())
        if result.ok:
            _stats["ok"] += 1
        elif result.status == "QUOTA_EXHAUSTED":
            _stats["quota_exhausted"] += 1
        else:
            _stats["errors"] += 1


def _model_major(model: str) -> int:
    m = re.search(r"gemini-(\d+)", model)
    return int(m.group(1)) if m else 0


def _retry_delay_seconds(body: dict) -> float | None:
    for d in (body.get("error") or {}).get("details") or []:
        if str(d.get("@type", "")).endswith("RetryInfo"):
            raw = str(d.get("retryDelay", "")).rstrip("s")
            try:
                return float(raw)
            except ValueError:
                return None
    return None


def configured() -> bool:
    return bool(get_settings().gemini_api_key.strip())


def build_contents(user_text: str, history: list[tuple[str, str]] | None) -> list[dict]:
    """Riwayat percakapan multi-giliran (user/model bergantian, diawali user)."""
    contents: list[dict] = []
    for role, text in history or []:
        r = "model" if role in ("assistant", "model") else "user"
        if not text.strip():
            continue
        if not contents and r == "model":
            continue
        if contents and contents[-1]["role"] == r:
            contents[-1]["parts"][0]["text"] += "\n" + text
        else:
            contents.append({"role": r, "parts": [{"text": text}]})
    if contents and contents[-1]["role"] == "user":
        contents.append({"role": "model", "parts": [{"text": "(lanjut)"}]})
    contents.append({"role": "user", "parts": [{"text": user_text}]})
    return contents


def generate(
    system_instruction: str,
    user_text: str,
    client: httpx.Client | None = None,
    history: list[tuple[str, str]] | None = None,
) -> GenerationResult:
    s = get_settings()
    if not configured():
        result = GenerationResult(ok=False, status="NO_KEY", error="GEMINI_API_KEY belum diatur")
        return result

    attempts: list[dict] = []
    own_client = client is None
    client = client or httpx.Client(timeout=s.gemini_timeout_seconds)
    last_status, last_error = "ERROR", None
    try:
        for model in s.model_chain:
            body: dict = {
                "systemInstruction": {"parts": [{"text": system_instruction}]},
                "contents": build_contents(user_text, history),
                "generationConfig": {"maxOutputTokens": s.gemini_max_output_tokens},
            }
            if s.gemini_thinking_level and _model_major(model) >= 3:
                body["generationConfig"]["thinkingConfig"] = {"thinkingLevel": s.gemini_thinking_level.upper()}
            url = f"{s.gemini_api_base.rstrip('/')}/models/{model}:generateContent"
            for attempt in range(1, max(1, s.gemini_max_retries) + 1):
                t0 = time.perf_counter()
                try:
                    resp = client.post(
                        url,
                        headers={"x-goog-api-key": s.gemini_api_key, "Content-Type": "application/json"},
                        json=body,
                    )
                except httpx.HTTPError as exc:
                    attempts.append({"model": model, "attempt": attempt, "error": type(exc).__name__})
                    last_status, last_error = "ERROR", f"Jaringan: {type(exc).__name__}"
                    time.sleep(min(2 ** (attempt - 1), 4))
                    continue
                ms = int((time.perf_counter() - t0) * 1000)
                attempts.append({"model": model, "attempt": attempt, "http": resp.status_code, "ms": ms})
                try:
                    data = resp.json()
                except ValueError:
                    data = {}
                if resp.status_code == 200:
                    if (data.get("promptFeedback") or {}).get("blockReason"):
                        result = GenerationResult(
                            ok=False, model=model, status="BLOCKED", attempts=attempts,
                            error=f"Diblokir: {data['promptFeedback']['blockReason']}",
                        )
                        _record(result)
                        return result
                    parts = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts")) or []
                    text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
                    if text:
                        result = GenerationResult(
                            ok=True, text=text, model=model, attempts=attempts, usage=data.get("usageMetadata")
                        )
                        _record(result)
                        return result
                    last_status, last_error = "ERROR", "Respons kosong dari model"
                    break
                if resp.status_code == 429:
                    delay = _retry_delay_seconds(data)
                    last_status, last_error = "QUOTA_EXHAUSTED", "Kuota/rate limit tercapai (429)"
                    if attempt < s.gemini_max_retries and (delay is None or delay <= 8):
                        time.sleep(delay if delay is not None else min(2 ** (attempt - 1), 4))
                        continue
                    break  # coba model cadangan
                if resp.status_code in (500, 502, 503, 504):
                    last_status, last_error = "ERROR", f"Server Gemini {resp.status_code}"
                    time.sleep(min(2 ** (attempt - 1), 4))
                    continue
                if resp.status_code == 404:
                    last_status, last_error = "ERROR", f"Model {model} tidak ditemukan"
                    break  # coba model cadangan
                msg = (data.get("error") or {}).get("message") or f"HTTP {resp.status_code}"
                result = GenerationResult(ok=False, model=model, status="ERROR", error=msg[:300], attempts=attempts)
                _record(result)
                return result
        result = GenerationResult(ok=False, status=last_status, error=last_error, attempts=attempts)
        _record(result)
        return result
    finally:
        if own_client:
            client.close()
