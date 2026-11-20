"""Pembaca otomatis dokumen MCU — berjalan LOKAL (isi MCU tidak dikirim ke layanan AI eksternal).

Alur: PDF teks -> ekstraksi teks (pypdf) -> pencocokan pola label format 'Kesimpulan Medical Check Up'
-> nilai variabel + baris sumber + peringatan. Gambar / PDF hasil scan: belum ada OCR lokal,
pengguna mengisi variabel secara manual dengan template yang sama.
"""
from __future__ import annotations

import io
import re
from datetime import date

from .template import FIELDS, TEMPLATE_ID, statuses

MONTHS_ID = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6, "juli": 7,
    "agustus": 8, "september": 9, "oktober": 10, "november": 11, "desember": 12,
}
_TRAILING_DATE = re.compile(r"\s*\b\d{1,2}\s+(?:" + "|".join(MONTHS_ID) + r")\s+\d{4}\s*$", re.I)
LAB_KEYS = [
    ("hematologi", ("hematologi", "darah rutin", "darah lengkap")),
    ("kimia_darah", ("kimia darah",)),
    ("urinalisa", ("urinalisa", "urinalisis", "urin")),
    ("faeces", ("faeces", "feses", "tinja")),
]
NONLAB_KEYS = [
    ("ekg", ("ekg", "elektrokardiogra")),
    ("audiometri", ("audiometri",)),
    ("spirometri", ("spirometri",)),
    ("rontgen", ("rontgen", "thorax", "radiologi", "x-ray")),
]


def extract_text(data: bytes, mime: str) -> tuple[str, str]:
    """Kembalikan (teks, status). Status: OK / NO_TEXT / IMAGE / ERROR."""
    if mime == "application/pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            text = "\n".join((p.extract_text() or "") for p in reader.pages[:6])
        except Exception:
            return "", "ERROR"
        text = text.replace("\xa0", " ")
        return (text, "OK") if len(text.strip()) > 40 else ("", "NO_TEXT")
    return "", "IMAGE"


def _date_dmy(s: str | None) -> str | None:
    if not s:
        return None
    m = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m:
        d, mo, y = map(int, m.groups())
    else:
        m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", s)
        if not m or m.group(2).lower() not in MONTHS_ID:
            return None
        d, mo, y = int(m.group(1)), MONTHS_ID[m.group(2).lower()], int(m.group(3))
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def _num(s: str | None) -> float | None:
    if s is None:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _section(lines: list[str], start: str, stops: list[str]) -> list[str]:
    out, inside = [], False
    for ln in lines:
        low = ln.lower()
        if not inside and low.startswith(start):
            inside = True
            continue
        if inside and any(low.startswith(s) for s in stops):
            break
        if inside:
            out.append(ln)
    return out


def _match_item(text: str, keys) -> str | None:
    low = text.lower()
    for key, names in keys:
        if any(low.startswith(n) or f" {n}" in f" {low}" for n in names):
            return key
    return None


def map_assessment(text: str | None) -> str:
    low = (text or "").strip().lower()
    if not low or low in ("-", "--"):
        return "PENDING"
    if "unfit" in low or "tidak fit" in low:
        return "UNFIT"
    if "restrik" in low or "restrict" in low or "terbatas" in low:
        return "FIT_WITH_RESTRICTION"
    if "fit" in low:
        return "FIT"
    return "PENDING"


def parse_text(text: str) -> dict:
    """Ekstrak variabel dari teks dokumen. Hasil: values, sources (baris asal), warnings, recognized."""
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    flat = " ".join(lines)
    values: dict = {k: ([] if f["type"] == "list" else None) for k, f in FIELDS.items()}
    sources: dict[str, str] = {}
    warnings: list[str] = []

    def put(key, value, src):
        if value not in (None, "", []):
            values[key] = value
            sources[key] = src[:200]

    recognized = "kesimpulan medical check up" in flat.lower() or "medical check up" in flat.lower()

    # --- Identitas (label-label bisa berada dalam satu baris) ---
    if m := re.search(r"Perusahaan\s*:\s*(.+?)(?=\s+NIK\s*:|$)", flat, re.I):
        put("company", m.group(1).strip(), m.group(0))
    if m := re.search(r"\bNIK\s*:\s*(\d{6,20})", flat, re.I):
        nik = m.group(1)
        put("nik_masked", "•" * max(0, len(nik) - 4) + nik[-4:], "NIK : (disamarkan)")
    if m := re.search(r"Nama\s*:\s*(.+?)\s*\(\s*([LP])\s*\)", flat, re.I):
        put("patient_name", m.group(1).strip(), "Nama : (dibaca)")
        put("sex", m.group(2).upper(), m.group(0)[-3:])
    if m := re.search(r"Dept/?\s*Bagian\s*:\s*(.+?)(?=\s+Tanggal Lahir\s*:|$)", flat, re.I):
        put("department", m.group(1).strip(), m.group(0))
    if m := re.search(r"Tanggal Lahir\s*:\s*(\d{1,2}/\d{1,2}/\d{4})", flat, re.I):
        put("birth_date", _date_dmy(m.group(1)), "Tanggal Lahir : (dibaca)")
    if m := re.search(r"Tanggal MCU\s*:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})", flat, re.I):
        put("mcu_date", _date_dmy(m.group(1)), m.group(0))
    if m := re.search(r"No\.?\s*MCU\s*:\s*([A-Za-z0-9/-]+)", flat, re.I):
        put("mcu_number", m.group(1), m.group(0))

    # --- Kesimpulan umum (baris per baris) ---
    for ln in lines:
        low = ln.lower()
        if m := re.match(r"Riwayat Alergi\s*:\s*(.+)", ln, re.I):
            put("allergy", m.group(1).strip(), ln)
        elif m := re.search(r"^(.*?)\(?\s*Body Mass Index\s*:\s*([\d.,]+)\s*\)?", ln, re.I):
            put("bmi", _num(m.group(2)), ln)
            put("bmi_category", m.group(1).strip(" (") or None, ln)
        elif "self reporting questionnaire" in low or re.match(r"(skor\s+)?srq\b", low):
            if m := re.search(r":\s*(.+)$", ln):
                put("srq", m.group(1).strip(), ln)
        elif "napfa" in low:
            if m := re.search(r"(\d+(?:[.,]\d+)?)\s*\(([^)]*)\)", ln):
                put("napfa_score", _num(m.group(1)), ln)
                put("napfa_category", m.group(2).strip(), ln)
        elif "kardiovaskular" in low:
            if m := re.search(r":\s*(-?\d+(?:[.,]\d+)?)\s*(?:\(([^)]*)\))?", ln):
                put("cardio_score", _num(m.group(1)), ln)
                put("cardio_note", (m.group(2) or "").strip() or None, ln)
        elif low.startswith("romberg"):
            if m := re.search(r":\s*(.+)$", ln):
                put("romberg", m.group(1).strip(), ln)
        elif m := re.search(r"^([A-Za-z][^()]*?)\(\s*(\d{2,3})\s*/\s*(\d{2,3})\s*\)", ln):
            if values.get("bp_systolic") is None:
                put("bp_systolic", _num(m.group(2)), ln)
                put("bp_diastolic", _num(m.group(3)), ln)
                put("bp_category", m.group(1).strip(), ln)

    # --- Laboratorium & non-laboratorium ---
    def parse_items(section, keys, other_key):
        for ln in section:
            item = ln.lstrip("-•* ").strip()
            if not item:
                continue
            if ":" in item:
                name, result = [x.strip() for x in item.split(":", 1)]
            else:
                name, result = item, ""
            key = _match_item(name, keys)
            if key and result:
                put(key, result, ln)
            else:
                values[other_key] = values[other_key] + [item]
                sources[other_key] = (sources.get(other_key, "") + " | " + ln).strip(" |")[:200]

    lab = _section(lines, "pemeriksaan laboratorium", ["pemeriksaan non laboratorium", "pemeriksaan non-laboratorium", "saran", "catatan"])
    parse_items(lab, LAB_KEYS, "lab_other")
    nonlab = _section(lines, "pemeriksaan non", ["saran", "catatan"])
    parse_items(nonlab, NONLAB_KEYS, "nonlab_other")

    # --- Penilaian, saran, catatan, validasi dokter ---
    pen = _section(lines, "penilaian", ["kesimpulan"])
    if pen:
        put("assessment", " ".join(pen).strip(), "Penilaian")
    saran = _section(lines, "saran", ["catatan", "pindai", "scan to check"])
    if saran:
        put("advice", "\n".join(_join_wrapped(saran)), "Saran")
    catatan = _section(lines, "catatan", ["pindai", "scan to check", "dokumen hasil", "validasi oleh"])
    # Tanggal validasi dokter ("08 September 2026") bisa menempel di akhir catatan bila tidak ada teks QR di antaranya.
    notes = _TRAILING_DATE.sub("", " ".join(catatan)).strip()
    if notes:
        put("notes", notes, "Catatan")
    if m := re.search(r"(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+Validasi Oleh", flat, re.I):
        put("validation_date", _date_dmy(m.group(1)), m.group(0))
    if m := re.search(r"Validasi Oleh,?\s*(.+?)\s+Dokter Pemeriksa", flat, re.I):
        put("doctor_name", m.group(1).strip(), "Validasi Oleh … Dokter Pemeriksa")
    if "sistem informasi laboratorium" in flat.lower() and "kimia farma" in flat.lower():
        put("provider", "Kimia Farma Laboratorium & Klinik", "teks dokumen")

    if not recognized:
        warnings.append("Format dokumen tidak dikenali sebagai 'Kesimpulan Medical Check Up' — periksa semua variabel.")
    if not values.get("mcu_date"):
        warnings.append("Tanggal MCU tidak terbaca — wajib diisi manual.")
    found = sum(1 for k, v in values.items() if v not in (None, "", []))
    return {
        "template_id": TEMPLATE_ID,
        "recognized": recognized and found >= 5,
        "values": values,
        "sources": sources,
        "warnings": warnings,
        "found_count": found,
    }


def _join_wrapped(lines: list[str]) -> list[str]:
    """Gabungkan baris yang terpotong (baris berikut diawali huruf kecil) menjadi kalimat utuh."""
    out: list[str] = []
    for ln in lines:
        prev_open = bool(out) and not out[-1].rstrip().endswith((".", ":", ")"))
        if out and (ln[:1].islower() or (prev_open and not ln[:1].isupper())):
            out[-1] = out[-1].rstrip() + " " + ln
        else:
            out.append(ln)
    return out


# ---------------------------------------------------------------- analisis lanjutan


def _abnormal(values: dict, key: str) -> bool:
    return statuses({key: values.get(key)}).get(key) == "PERHATIAN"


def suggestions(values: dict) -> list[dict]:
    """Temuan yang relevan untuk keputusan akses (SARAN untuk dokter/admin, bukan keputusan otomatis)."""
    out: list[dict] = []
    sys_, dia = values.get("bp_systolic"), values.get("bp_diastolic")
    cat = (values.get("bp_category") or "").lower()
    if (sys_ and sys_ >= 140) or (dia and dia >= 90) or "hipertensi" in cat:
        out.append({"code": "BP", "text": "Tekanan darah saat MCU di atas ambang (hipertensi).",
                    "areas": ["HEIGHT", "HOT"], "comorbid": "HYPERTENSION"})
    if _abnormal(values, "spirometri"):
        out.append({"code": "SPIRO", "text": "Fungsi paru (spirometri) tidak normal — relevan untuk area paparan BBM.",
                    "areas": ["RESTRICTED_GAS"], "comorbid": None})
    if _abnormal(values, "ekg"):
        out.append({"code": "EKG", "text": "EKG tidak dalam batas normal — perlu evaluasi jantung.",
                    "areas": ["HOT", "HEIGHT", "RESTRICTED_GAS"], "comorbid": None})
    score = values.get("cardio_score")
    if score is not None and score >= 5:
        out.append({"code": "CARDIO", "text": "Skor risiko kardiovaskular tinggi — konsultasi dokter.",
                    "areas": ["HOT", "HEIGHT"], "comorbid": None})
    if _abnormal(values, "romberg"):
        out.append({"code": "ROMBERG", "text": "Romberg test positif (gangguan keseimbangan) — relevan untuk ketinggian.",
                    "areas": ["HEIGHT"], "comorbid": None})
    bmi = values.get("bmi")
    if bmi is not None and bmi >= 30:
        out.append({"code": "BMI", "text": "BMI ≥ 30 — toleransi panas & kerja ketinggian perlu diperhatikan.",
                    "areas": ["HOT", "HEIGHT"], "comorbid": None})
    for key, label in (("rontgen", "Rontgen"), ("audiometri", "Audiometri"), ("kimia_darah", "Kimia darah"),
                       ("urinalisa", "Urinalisa"), ("hematologi", "Hematologi"), ("faeces", "Faeces")):
        if _abnormal(values, key):
            out.append({"code": key.upper(), "text": f"{label}: {values.get(key)}", "areas": [], "comorbid": None})
    for item in values.get("lab_other") or []:
        out.append({"code": "LAB_OTHER", "text": f"Temuan laboratorium: {item}", "areas": [], "comorbid": None})
    for item in values.get("nonlab_other") or []:
        out.append({"code": "NONLAB_OTHER", "text": f"Temuan non-laboratorium: {item}", "areas": [], "comorbid": None})
    return out


def summary_text(values: dict) -> str:
    parts = []
    if values.get("bmi") is not None:
        parts.append(f"BMI {values['bmi']:g}" + (f" ({values['bmi_category']})" if values.get("bmi_category") else ""))
    if values.get("bp_systolic") is not None:
        parts.append(f"TD {values['bp_systolic']:g}/{(values.get('bp_diastolic') or 0):g}"
                     + (f" ({values['bp_category']})" if values.get("bp_category") else ""))
    for key in ("ekg", "audiometri", "spirometri", "rontgen", "kimia_darah", "urinalisa", "hematologi", "faeces", "romberg", "srq"):
        if values.get(key) and _abnormal(values, key):
            parts.append(f"{FIELDS[key]['label']}: {values[key]}")
    parts += [str(x) for x in (values.get("lab_other") or [])]
    parts += [str(x) for x in (values.get("nonlab_other") or [])]
    return "; ".join(parts)[:2000] or "Hasil dalam batas normal."


def identity_check(values: dict, full_name: str | None, birth_date: str | None) -> dict:
    def toks(s):
        return {t for t in re.findall(r"[a-z]+", (s or "").lower()) if len(t) > 1}

    doc_name, prof = toks(values.get("patient_name")), toks(full_name)
    name_match = None
    if doc_name and prof:
        overlap = len(doc_name & prof) / max(1, min(len(doc_name), len(prof)))
        name_match = overlap >= 0.5
    bd = values.get("birth_date")
    bd_match = None if not (bd and birth_date) else bd == birth_date
    return {"name_match": name_match, "birth_date_match": bd_match}


def diff_fields(original: dict, final: dict) -> list[str]:
    """Variabel yang diubah pengguna dibanding hasil baca otomatis."""
    changed = []
    for key, f in FIELDS.items():
        if f.get("readonly"):
            continue
        a, b = original.get(key), final.get(key)
        if f["type"] == "list":
            a = [str(x).strip().lower() for x in (a or [])]
            b = [str(x).strip().lower() for x in (b or [])]
        elif f["type"] == "number":
            a = None if a in (None, "") else round(float(a), 2)
            b = None if b in (None, "") else round(float(b), 2)
        else:
            a = (str(a).strip().lower() if a else "")
            b = (str(b).strip().lower() if b else "")
        if a != b:
            changed.append(key)
    return changed
