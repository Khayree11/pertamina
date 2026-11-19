"""Sanitizer — batas data yang boleh keluar ke LLM (§6, keputusan: data dianonimkan).

BOLEH dikirim (whitelist):  kategori komorbid generik + kategori area yang ditanyakan.
TIDAK BOLEH dikirim:        nama, Employee ID, nomor kartu/telepon, nilai tensi, tanggal,
                            isi dokumen MCU, atau identitas apa pun.

Pertanyaan bebas dari pengguna juga dibersihkan (redaksi pola PII) sebelum dikirim.
"""
from __future__ import annotations

import re
from collections import Counter

from ..constants import AREA_INFO, SPECIAL_AREAS

WHITELIST_KEYS = ("comorbid_categories", "area")

# Label generik (tanpa teks bebas) untuk kategori komorbid yang boleh dikirim.
GENERIC_COMORBID = {
    "HYPERTENSION": "hipertensi",
    "DIABETES": "diabetes",
    "ASTHMA_COPD": "asma/PPOK",
    "HEART_DISEASE": "penyakit jantung",
    "EPILEPSY": "epilepsi",
    # OTHER sengaja tidak dikirim: labelnya teks bebas dan bisa mengidentifikasi.
}

AREA_KEYWORDS = {
    "COLD": ["dingin", "cold", "kriogenik", "lng", "cold storage", "pendingin"],
    "HOT": ["panas", "hot", "heat", "boiler", "furnace", "tungku"],
    "HEIGHT": ["ketinggian", "height", "tinggi", "menara", "scaffolding", "perancah", "platform"],
    "RESTRICTED_GAS": ["gas", "bbm", "uap", "tank farm", "tangki", "pompa bbm", "restricted", "terbatas"],
}

_MONTHS = "januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sep|okt|nov|des"
_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("id_pekerja", re.compile(r"\b(?:PTM|EMP|ID|CARD|KRT)[-\s]?\d{3,}\b", re.IGNORECASE)),
    # Tanggal diproses sebelum pola tensi agar "10/11/2026" tidak terbaca sebagai tensi.
    ("tanggal", re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b")),
    ("tanggal", re.compile(rf"\b\d{{1,2}}\s+(?:{_MONTHS})\.?\s+\d{{2,4}}\b", re.IGNORECASE)),
    ("telepon", re.compile(r"(?:\+?62[\s-]?|\b0)8[\d\s-]{7,14}\d")),
    ("nilai_tensi", re.compile(r"\b\d{2,3}\s*/\s*\d{2,3}\b")),
    ("nilai_medis", re.compile(r"\b\d{2,3}(?:[.,]\d+)?\s*(?:mmhg|bpm|mg/dl|mg|kg|cm|%)", re.IGNORECASE)),
    ("nomor", re.compile(r"\b\d{5,}\b")),
]


def detect_area(text: str) -> str | None:
    t = (text or "").lower()
    hits = [(a, sum(t.count(k) for k in kws)) for a, kws in AREA_KEYWORDS.items()]
    hits = [h for h in hits if h[1] > 0]
    if not hits:
        return None
    hits.sort(key=lambda x: x[1], reverse=True)
    return hits[0][0]


def redact(text: str, names: list[str] | None = None, identifiers: list[str] | None = None) -> tuple[str, dict]:
    counts: Counter = Counter()
    out = text or ""
    for ident in identifiers or []:
        if ident and len(ident) >= 3:
            pattern = re.compile(re.escape(ident), re.IGNORECASE)
            out, n = pattern.subn("[id]", out)
            counts["id_pekerja"] += n
    for label, pattern in _PATTERNS:
        out, n = pattern.subn(f"[{label}]", out)
        counts[label] += n
    # Nama: nama lengkap dulu, lalu token nama penanya (>= 3 huruf).
    for name in sorted({n for n in (names or []) if n}, key=len, reverse=True):
        pattern = re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE)
        out, n = pattern.subn("[nama]", out)
        counts["nama"] += n
    return out, {k: v for k, v in counts.items() if v}


def build_personal_context(comorbid_codes: list[str], area_code: str | None, personalize: bool) -> dict:
    ctx: dict = {}
    if personalize:
        cats = sorted({GENERIC_COMORBID[c] for c in comorbid_codes if c in GENERIC_COMORBID})
        if cats:
            ctx["comorbid_categories"] = cats
    if area_code in SPECIAL_AREAS:
        ctx["area"] = f"{AREA_INFO[area_code]['label']} ({area_code})"
    # Penjagaan terakhir: hanya kunci whitelist yang lolos.
    return {k: v for k, v in ctx.items() if k in WHITELIST_KEYS}


def name_tokens(full_names: list[str], own_name: str | None) -> list[str]:
    out: list[str] = []
    for n in full_names:
        n = (n or "").strip()
        if n:
            out.append(n)
    if own_name:
        out.extend(t for t in own_name.split() if len(t) >= 3)
    return out
