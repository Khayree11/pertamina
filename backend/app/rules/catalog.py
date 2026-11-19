"""Katalog fakta yang boleh dipakai aturan. Fakta dihitung oleh services/facts.py."""

FACT_CATALOG: dict[str, dict] = {
    "bp.submitted_today": {"type": "bool", "label": "Tensi hari ini sudah diinput"},
    "bp.systolic": {"type": "number", "label": "Sistolik pengukuran terakhir hari ini (mmHg)"},
    "bp.diastolic": {"type": "number", "label": "Diastolik pengukuran terakhir hari ini (mmHg)"},
    "bp.pulse": {"type": "number", "label": "Nadi pengukuran terakhir hari ini (bpm, opsional)"},
    "bp.readings_today": {"type": "number", "label": "Jumlah pengukuran tensi hari ini"},
    "bp.inconsistent_today": {"type": "bool", "label": "Pengukuran hari ini saling tidak konsisten"},
    "mcu.exists": {"type": "bool", "label": "Ada data MCU tahunan"},
    "mcu.age_days": {"type": "number", "label": "Umur MCU terakhir (hari)"},
    "mcu.expired": {"type": "bool", "label": "MCU terakhir kedaluwarsa"},
    "mcu.verified": {"type": "bool", "label": "MCU terakhir sudah diverifikasi"},
    "mcu.conclusion": {"type": "enum", "label": "Kesimpulan dokter pada MCU terakhir"},
    "mcu.restricted_areas": {"type": "list", "label": "Area yang direstriksi dokter (MCU)"},
    "comorbid.active": {"type": "list", "label": "Komorbid aktif"},
    "comorbid.uncontrolled": {
        "type": "list",
        "label": "Komorbid aktif yang tidak terkontrol / status terkontrol belum diverifikasi",
    },
    "comorbid.unverified": {"type": "list", "label": "Komorbid aktif yang belum diverifikasi"},
}

KNOWN_FLAGS = {"URGENT_REVIEW"}

OPS_BY_TYPE = {
    "bool": {"is_true", "is_false", "exists", "not_exists", "==", "!="},
    "number": {"==", "!=", ">", ">=", "<", "<=", "exists", "not_exists", "in", "not_in"},
    "enum": {"==", "!=", "in", "not_in", "exists", "not_exists"},
    "list": {"contains", "not_contains", "exists", "not_exists"},
}
