"""Konstanta domain. Aturan kelayakan TIDAK ada di sini — aturan ada di konfigurasi
rule_versions (JSON) supaya bisa diubah tanpa deploy ulang."""

ROLE_WORKER = "WORKER"
ROLE_ADMIN = "ADMIN"
ROLE_HEALTH = "HEALTH"
ROLE_SECURITY = "SECURITY"

ROLE_LABELS = {
    ROLE_WORKER: "Pekerja",
    ROLE_ADMIN: "Admin K3",
    ROLE_HEALTH: "Petugas Kesehatan",
    ROLE_SECURITY: "Petugas Keamanan",
}

STAFF_ROLES = [ROLE_ADMIN, ROLE_HEALTH, ROLE_SECURITY]

VALID_UNITS = ["MOR I", "MOR II", "MOR III", "MOR IV", "MOR V"]

# --- Area -----------------------------------------------------------------
SPECIAL_AREAS = ["COLD", "HOT", "HEIGHT", "RESTRICTED_GAS"]
GENERAL_AREA = "GENERAL"

AREA_INFO = {
    "COLD": {
        "label": "Wilayah Dingin",
        "short": "Dingin",
        "risk": "Stres suhu dingin, beban kardiovaskular",
    },
    "HOT": {
        "label": "Area Panas",
        "short": "Panas",
        "risk": "Heat stress, dehidrasi, beban kardiovaskular",
    },
    "HEIGHT": {
        "label": "Ketinggian",
        "short": "Ketinggian",
        "risk": "Risiko pingsan/jatuh, hipertensi tak terkontrol",
    },
    "RESTRICTED_GAS": {
        "label": "Area Paparan BBM",
        "short": "Paparan BBM",
        "risk": "Beban respirasi, paparan uap hidrokarbon, kondisi jantung, kondisi paru",
    },
    "GENERAL": {
        "label": "Akses Umum",
        "short": "Umum",
        "risk": "Area non-khusus (kantor, gerbang)",
    },
}

# --- Status kelayakan ----------------------------------------------------
ALLOWED = "ALLOWED"
RESTRICTED = "RESTRICTED"
NEEDS_REVIEW = "NEEDS_REVIEW"
DENIED = "DENIED"
STATUSES = [ALLOWED, RESTRICTED, NEEDS_REVIEW, DENIED]
# Kombinasi beberapa aturan selalu mengambil status paling ketat.
SEVERITY = {ALLOWED: 0, RESTRICTED: 1, NEEDS_REVIEW: 2, DENIED: 3}
STATUS_LABELS = {
    ALLOWED: "Diizinkan",
    RESTRICTED: "Terbatas",
    NEEDS_REVIEW: "Perlu Review",
    DENIED: "Ditolak",
}

# --- Hasil tap kartu ---------------------------------------------------------
GRANTED = "GRANTED"
TEMPORARY = "TEMPORARY"
TAP_DENIED = "DENIED"
TAP_LABELS = {
    GRANTED: "Akses diberikan",
    TEMPORARY: "Akses sementara",
    TAP_DENIED: "Akses ditolak",
}

# --- MCU / verifikasi ----------------------------------------------------
MCU_CONCLUSIONS = {
    "FIT": "Fit",
    "FIT_WITH_RESTRICTION": "Fit dengan restriksi",
    "UNFIT": "Tidak fit (unfit)",
    "PENDING": "Belum ada penilaian dokter perusahaan",
}
MCU_EXTRACTION_LABELS = {
    "AUTO_PDF": "Dibaca otomatis dari PDF",
    "UNRECOGNIZED": "PDF terbaca, format tidak dikenali",
    "PDF_NO_TEXT": "PDF hasil scan — tidak ada teks",
    "IMAGE_NO_OCR": "Gambar — diisi manual",
    "ERROR": "Gagal membaca berkas",
    "MANUAL": "Diisi manual",
}
UNVERIFIED = "UNVERIFIED"
VERIFIED = "VERIFIED"
REJECTED = "REJECTED"
VERIFICATION_LABELS = {
    UNVERIFIED: "Menunggu verifikasi",
    VERIFIED: "Terverifikasi",
    REJECTED: "Ditolak",
}

# --- Override ------------------------------------------------------------------
OVERRIDE_KINDS = {
    "OVERRIDE": "Override admin",
    "REVIEW_DECISION": "Keputusan review",
}
OV_ACTIVE = "ACTIVE"
OV_EXPIRED = "EXPIRED"
OV_REVOKED = "REVOKED"
OV_AUTO_REVOKED = "AUTO_REVOKED"
OV_SUPERSEDED = "SUPERSEDED"
OV_REPLACED = "REPLACED"
OVERRIDE_STATE_LABELS = {
    OV_ACTIVE: "Aktif",
    OV_EXPIRED: "Berakhir (masa berlaku habis)",
    OV_REVOKED: "Dicabut admin",
    OV_AUTO_REVOKED: "Dicabut otomatis (kondisi memburuk)",
    OV_SUPERSEDED: "Tidak diperlukan lagi",
    OV_REPLACED: "Digantikan override baru",
}

# --- Alasan sistem (di luar katalog alasan aturan) --------------------------
SYSTEM_REASONS = {
    "ALL_CLEAR": {
        "short": "Memenuhi syarat (aturan simulasi)",
        "detail": "Tidak ada aturan pembatas yang terpenuhi untuk area ini.",
    },
    "DATA_UNCERTAIN": {
        "short": "Data belum lengkap/tidak pasti — perlu review",
        "detail": "Fakta yang dibutuhkan aturan tidak tersedia. Default aman: NEEDS_REVIEW, bukan ALLOWED.",
    },
    "ENGINE_ERROR": {
        "short": "Evaluasi gagal — default aman, perlu review",
        "detail": "Terjadi kesalahan saat evaluasi aturan. Semua area khusus diset NEEDS_REVIEW.",
    },
    "OVERRIDE": {
        "short": "Diubah oleh admin K3 (override)",
        "detail": "Status berasal dari override admin dengan alasan tercatat di audit log.",
    },
    "REVIEW_DECISION": {
        "short": "Keputusan review admin K3",
        "detail": "Status berasal dari keputusan review admin (catatan wajib) dan bersifat sementara.",
    },
    "STATUS_EXPIRED": {
        "short": "Status kedaluwarsa — menunggu evaluasi ulang",
        "detail": "Masa berlaku status otomatis telah habis.",
    },
    "CARD_INACTIVE": {
        "short": "Kartu nonaktif",
        "detail": "Kartu pekerja dinonaktifkan.",
    },
    "NOT_ASSESSED": {
        "short": "Belum pernah dievaluasi",
        "detail": "Belum ada hasil evaluasi untuk pekerja ini.",
    },
}

# --- Kategori alasan untuk sistem kartu (tanpa detail medis) -----------------
GATE_MESSAGES = {
    "OK": "Silakan masuk.",
    "OVERRIDE_TEMPORARY": "Akses sementara berdasarkan keputusan admin K3.",
    "RESTRICTED_TEMPORARY": "Akses terbatas — patuhi batas durasi dan pendampingan.",
    "NOT_SCREENED_TODAY": "Belum melakukan screening kesehatan hari ini.",
    "HEALTH_REVIEW_REQUIRED": "Menunggu review K3/medis.",
    "NOT_ELIGIBLE": "Tidak memenuhi syarat kesehatan untuk area ini. Hubungi admin K3.",
    "ADMIN_RESTRICTED": "Akses dibatasi oleh admin K3.",
    "STATUS_EXPIRED": "Izin kedaluwarsa — lakukan screening atau verifikasi manual.",
    "CARD_INACTIVE": "Kartu nonaktif.",
    "UNKNOWN_CARD": "Kartu / Employee ID tidak terdaftar.",
    "UNKNOWN_ROOM": "Ruangan / area tidak dikenal.",
    "NOT_SYNCED": "Izin belum tersinkron ke sistem kartu — verifikasi manual.",
}

FLAG_LABELS = {"URGENT_REVIEW": "Review segera"}

BP_SOURCES = {
    "SELF": "Input mandiri",
    "OFFICER": "Input petugas",
    "DEMO_SIM": "Simulasi demo",
}

# --- Status Kelayakan Berkendara (Fit to Drive / FTD) -------------------------
FIT_TO_DRIVE = "FIT_TO_DRIVE"
UNFIT_TO_DRIVE = "UNFIT_TO_DRIVE"

FTD_STATUS_LABELS = {
    FIT_TO_DRIVE: "Boleh Berkendara",
    UNFIT_TO_DRIVE: "Dilarang Berkendara Hari Ini",
}

FTD_REASONS = {
    "FTD_BP_NOT_SUBMITTED": {
        "short": "Tensi hari ini belum diinput",
        "detail": "Screening tensi harian wajib dilakukan sebelum berkendara kendaraan operasional.",
    },
    "FTD_BP_VERY_HIGH": {
        "short": "Tensi sangat tinggi — tidak aman berkendara",
        "detail": "Sistolik >= 180 atau diastolik >= 110 mmHg. Segera temui petugas kesehatan.",
    },
    "FTD_BP_HIGH": {
        "short": "Tensi di atas ambang aman berkendara",
        "detail": "Sistolik >= 140 atau diastolik >= 90 mmHg. Istirahat dan konsultasikan ke klinik.",
    },
    "FTD_MCU_UNFIT": {
        "short": "Kesimpulan MCU tahunan: tidak fit",
        "detail": "Dokter menyatakan tidak fit — termasuk tidak fit berkendara.",
    },
    "FTD_MCU_INVALID": {
        "short": "MCU tahunan kedaluwarsa atau belum diverifikasi",
        "detail": "MCU tidak berlaku — status berkendara tidak dapat dikonfirmasi.",
    },
    "FTD_EPILEPSY": {
        "short": "Riwayat epilepsi/kejang aktif",
        "detail": "Komorbid epilepsi aktif menghalangi izin berkendara kendaraan operasional.",
    },
}
