"""Uji klien Gemini dengan transport tiruan (tanpa memanggil Google)."""
import json

import httpx
import pytest

from app.ai import gemini
from app.config import get_settings


@pytest.fixture
def key(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "gemini_api_key", "test-key")
    monkeypatch.setattr(s, "gemini_model", "gemini-3.5-flash-lite")
    monkeypatch.setattr(s, "gemini_fallback_models", "gemini-2.5-flash-lite")
    monkeypatch.setattr(gemini.time, "sleep", lambda *_: None)
    return s


def _ok(text="Jawaban [1]"):
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]})


def _quota(delay="0s"):
    return httpx.Response(429, json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "details": [
        {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay}]}})


def test_no_key_returns_status():
    assert gemini.generate("sys", "halo").status == "NO_KEY"


def test_success_sends_key_in_header_not_url(key):
    seen = {}

    def handler(req: httpx.Request):
        seen["url"] = str(req.url)
        seen["key"] = req.headers.get("x-goog-api-key")
        seen["body"] = json.loads(req.content)
        return _ok()

    res = gemini.generate("instruksi", "pertanyaan", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert res.ok and res.text == "Jawaban [1]" and res.model == "gemini-3.5-flash-lite"
    assert seen["key"] == "test-key" and "test-key" not in seen["url"]
    assert seen["url"].endswith("/models/gemini-3.5-flash-lite:generateContent")
    assert seen["body"]["systemInstruction"]["parts"][0]["text"] == "instruksi"
    assert "temperature" not in seen["body"]["generationConfig"]


def test_retry_then_success(key):
    calls = iter([_quota(), _ok("ok")])
    res = gemini.generate("s", "u", client=httpx.Client(transport=httpx.MockTransport(lambda r: next(calls))))
    assert res.ok and len(res.attempts) == 2


def test_quota_on_primary_falls_back_to_next_model(key):
    def handler(req):
        return _quota("60s") if "3.5" in str(req.url) else _ok("cadangan")

    res = gemini.generate("s", "u", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert res.ok and res.model == "gemini-2.5-flash-lite" and res.text == "cadangan"


def test_all_quota_exhausted(key):
    res = gemini.generate("s", "u", client=httpx.Client(transport=httpx.MockTransport(lambda r: _quota("60s"))))
    assert not res.ok and res.status == "QUOTA_EXHAUSTED"


def test_thought_parts_are_skipped(key):
    body = {"candidates": [{"content": {"parts": [{"text": "pikiran", "thought": True}, {"text": "jawaban"}]}}]}
    res = gemini.generate("s", "u", client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=body))))
    assert res.text == "jawaban"
