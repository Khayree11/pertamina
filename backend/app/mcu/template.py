"""Template variabel patokan MCU, mengikuti format dokumen 'KESIMPULAN MEDICAL CHECK UP'
(contoh: laporan resume MCU laboratorium klinik).

Nilai patokan (rujukan) adalah CONTOH umum — sesuaikan dengan klinik & dokter perusahaan.
"""
from __future__ import annotations

TEMPLATE_ID = "KESIMPULAN_MCU_V1"

NORMAL_DBN = ["dalam batas normal", "normal", "dbn", "tidak ada kelainan"]

SECTIONS: list[dict] = [
    {
        "key": "identity",
        "label": "Identitas pada dokumen",
        "fields": [
            {"key": "company", "label": "Perusahaan", "type": "text"},
            {"key": "patient_name", "label": "Nama", "type": "text", "check": "name"},
            {"key": "sex", "label": "Jenis kelamin", "type": "enum", "options": {"L": "Laki-laki", "P": "Perempuan"}},
            {"key": "nik_masked", "label": "NIK (disamarkan)", "type": "text", "readonly": True,
             "ref_label": "Hanya 4 digit terakhir yang disimpan"},
            {"key": "department", "label": "Dept/Bagian", "type": "text"},
            {"key": "birth_date", "label": "Tanggal lahir", "type": "date", "check": "birth_date"},
            {"key": "mcu_date", "label": "Tanggal MCU", "type": "date", "required": True},
            {"key": "mcu_number", "label": "No. MCU", "type": "text"},
        ],
    },
    {
        "key": "general",
        "label": "Kesimpulan pemeriksaan umum",
        "fields": [
            {"key": "allergy", "label": "Riwayat alergi", "type": "text", "info": True,
             "normal_text": ["tidak ada", "-", "disangkal"], "ref_label": "Tidak ada"},
            {"key": "bmi", "label": "Body Mass Index (BMI)", "type": "number", "unit": "kg/m²",
             "ref": {"min": 18.5, "max": 22.9}, "ref_label": "Normoweight 18,5–22,9 (klasifikasi Asia-Pasifik)"},
            {"key": "bmi_category", "label": "Kategori BMI", "type": "text",
             "normal_text": ["normoweight", "normal"], "ref_label": "Normoweight"},
            {"key": "bp_systolic", "label": "Tekanan darah sistolik", "type": "number", "unit": "mmHg",
             "ref": {"max": 139}, "ref_label": "< 140 mmHg"},
            {"key": "bp_diastolic", "label": "Tekanan darah diastolik", "type": "number", "unit": "mmHg",
             "ref": {"max": 89}, "ref_label": "< 90 mmHg"},
            {"key": "bp_category", "label": "Kategori tekanan darah", "type": "text",
             "normal_text": ["normal", "optimal", "normotensi"], "ref_label": "Normal / optimal"},
            {"key": "srq", "label": "Self Reporting Questionnaire (SRQ)", "type": "text",
             "normal_text": ["normal"], "ref_label": "Normal (skor SRQ-20 < 6)"},
            {"key": "napfa_score", "label": "Skor NAPFA (kebugaran)", "type": "number", "info": True},
            {"key": "napfa_category", "label": "Keterangan NAPFA", "type": "text",
             "normal_text": ["baik", "sangat baik", "baik sekali"], "ref_label": "Baik"},
            {"key": "cardio_score", "label": "Skor kardiovaskular", "type": "number",
             "ref": {"max": 1}, "ref_label": "≤ 1 risiko rendah · 2–4 sedang · ≥ 5 tinggi (contoh: Jakarta Cardiovascular Score)"},
            {"key": "cardio_note", "label": "Keterangan skor kardiovaskular", "type": "text", "info": True},
            {"key": "romberg", "label": "Romberg test", "type": "text", "normal_text": ["negatif"], "ref_label": "Negatif"},
        ],
    },
    {
        "key": "lab",
        "label": "Pemeriksaan laboratorium",
        "fields": [
            {"key": "hematologi", "label": "Hematologi / darah rutin", "type": "text", "normal_text": NORMAL_DBN,
             "ref_label": "Dalam Batas Normal"},
            {"key": "kimia_darah", "label": "Kimia darah", "type": "text", "normal_text": NORMAL_DBN, "ref_label": "Dalam Batas Normal"},
            {"key": "urinalisa", "label": "Urinalisa", "type": "text", "normal_text": NORMAL_DBN, "ref_label": "Dalam Batas Normal"},
            {"key": "faeces", "label": "Pemeriksaan faeces", "type": "text", "normal_text": NORMAL_DBN, "ref_label": "Dalam Batas Normal"},
            {"key": "lab_other", "label": "Temuan laboratorium lain", "type": "list", "ref_label": "Tidak ada temuan"},
        ],
    },
    {
        "key": "nonlab",
        "label": "Pemeriksaan non-laboratorium",
        "fields": [
            {"key": "ekg", "label": "EKG", "type": "text", "normal_text": NORMAL_DBN, "ref_label": "Dalam Batas Normal"},
            {"key": "audiometri", "label": "Audiometri", "type": "text", "normal_text": NORMAL_DBN, "ref_label": "Dalam Batas Normal"},
            {"key": "spirometri", "label": "Spirometri", "type": "text", "normal_text": NORMAL_DBN, "ref_label": "Dalam Batas Normal"},
            {"key": "rontgen", "label": "Rontgen thorax", "type": "text", "normal_text": NORMAL_DBN, "ref_label": "Dalam Batas Normal"},
            {"key": "nonlab_other", "label": "Temuan non-laboratorium lain", "type": "list", "ref_label": "Tidak ada temuan"},
        ],
    },
    {
        "key": "assessment",
        "label": "Penilaian, saran & validasi",
        "fields": [
            {"key": "assessment", "label": "Penilaian (kategori fitness)", "type": "text", "info": True,
             "ref_label": "Fit / Fit dengan catatan / Unfit (jika diisi klinik)"},
            {"key": "advice", "label": "Saran", "type": "longtext", "info": True},
            {"key": "notes", "label": "Catatan", "type": "longtext", "info": True},
            {"key": "doctor_name", "label": "Dokter pemeriksa (validasi)", "type": "text"},
            {"key": "validation_date", "label": "Tanggal validasi dokter", "type": "date"},
            {"key": "provider", "label": "Klinik / laboratorium", "type": "text"},
        ],
    },
]

FIELDS: dict[str, dict] = {f["key"]: f for s in SECTIONS for f in s["fields"]}
TEXT_MAX = {"text": 300, "longtext": 3000, "enum": 8, "date": 10}


def public_template() -> dict:
    return {"id": TEMPLATE_ID, "sections": SECTIONS}


def field_status(key: str, value) -> str:
    """NORMAL / PERHATIAN / INFO / KOSONG berdasarkan patokan."""
    f = FIELDS.get(key)
    if f is None:
        return "INFO"
    if value in (None, "", []):
        return "KOSONG"
    if f["type"] == "list":
        return "PERHATIAN" if any(str(v).strip() for v in value) else "KOSONG"
    if f["type"] == "number":
        ref = f.get("ref")
        if not ref:
            return "INFO"
        try:
            v = float(value)
        except (TypeError, ValueError):
            return "PERHATIAN"
        if ("min" in ref and v < ref["min"]) or ("max" in ref and v > ref["max"]):
            return "PERHATIAN"
        return "NORMAL"
    normal = f.get("normal_text")
    if normal:
        low = str(value).strip().lower()
        if any(low == n or low.startswith(n) for n in normal):
            return "NORMAL"
        return "INFO" if f.get("info") else "PERHATIAN"
    return "INFO"


def statuses(values: dict) -> dict[str, str]:
    return {k: field_status(k, values.get(k)) for k in FIELDS}


def clean_values(raw: dict) -> dict:
    """Normalisasi masukan pengguna: hanya kunci template, tipe & panjang dibatasi."""
    out: dict = {}
    for key, f in FIELDS.items():
        if f.get("readonly"):
            continue
        v = raw.get(key)
        t = f["type"]
        if t == "list":
            items = v if isinstance(v, list) else ([v] if v else [])
            out[key] = [str(x).strip()[:300] for x in items if str(x).strip()][:20]
        elif t == "number":
            if v in (None, ""):
                out[key] = None
            else:
                try:
                    out[key] = round(float(str(v).replace(",", ".")), 2)
                except ValueError:
                    raise ValueError(f"{f['label']}: harus berupa angka")
        else:
            s = str(v).strip() if v is not None else ""
            out[key] = s[: TEXT_MAX.get(t, 300)]
    return out
