# HBAC — Panduan Implementasi 4 Perubahan (Agen)

> **Dokumen ini dibuat oleh planning agent** untuk memandu agen lain mengimplementasikan 4 permintaan perubahan pada proyek HBAC (Health-Based Access Control).  
> Baca seluruh dokumen sebelum menyentuh kode. Kerjakan tiap fase secara berurutan karena ada dependensi antar perubahan.

---

## Peta Fase Kerja

| Fase | Poin | Topik | Estimasi Kompleksitas |
|:----:|:----:|:------|:---------------------:|
| A | 3 | Penamaan: "zona uap bbm" → "paparan bbm" | Rendah |
| B | 1 | Unit pada form register/profil → Dropdown MOR I–V | Rendah–Sedang |
| C | 2 | Status boleh berkendara berdasarkan MCU harian | Sedang–Tinggi |
| D | 4 | Tambah role Kesehatan & Security | Tinggi |

> **Urutan yang disarankan: A → B → C → D** (dari paling kecil dampaknya ke paling besar, agar tidak ada konflik merge).

---

## FASE A — Penamaan: "Zona Uap BBM" → "Paparan BBM"

### Deskripsi
Perubahan murni **label/teks tampilan**. Kode area internal `RESTRICTED_GAS` **tidak diubah** (menjaga konsistensi database, audit log, dan ACS). Hanya teks yang dilihat pengguna yang disesuaikan.

### Kata kunci pencarian cepat
- Backend: `uap BBM`, `Gas/Uap BBM`, `uap`
- Frontend: `Gas/BBM`, `uap`

---

### A.1 — Backend: `backend/app/constants.py`

**Lokasi persis:** Baris 27–31.

```python
# SEBELUM
"RESTRICTED_GAS": {
    "label": "Area Terbatas Gas/Uap BBM",
    "short": "Gas/BBM",
    "risk": "Beban respirasi, kondisi jantung, kondisi paru",
},

# SESUDAH
"RESTRICTED_GAS": {
    "label": "Area Paparan BBM",
    "short": "Paparan BBM",
    "risk": "Beban respirasi, paparan uap hidrokarbon, kondisi jantung, kondisi paru",
},
```

---

### A.2 — Backend: `backend/app/seed.py`

Perbarui deskripsi ruangan demo (baris ±98–99):

```python
# SEBELUM
("GAS-01", "Tank Farm BBM", "RESTRICTED_GAS", "Tank Farm Utara", "Contoh area terbatas gas/uap BBM"),
("GAS-02", "Rumah Pompa BBM (confined space)", "RESTRICTED_GAS", "Rumah Pompa BBM", "Contoh area terbatas gas/uap BBM"),

# SESUDAH
("GAS-01", "Tank Farm BBM", "RESTRICTED_GAS", "Tank Farm Utara", "Contoh area paparan BBM"),
("GAS-02", "Rumah Pompa BBM (confined space)", "RESTRICTED_GAS", "Rumah Pompa BBM", "Contoh area paparan BBM"),
```

---

### A.3 — Backend: `backend/app/mcu/parser.py`

Baris ±256 — teks saran spirometri:

```python
# SEBELUM
out.append({"code": "SPIRO", "text": "Fungsi paru (spirometri) tidak normal — relevan untuk area gas/uap BBM.", ...})

# SESUDAH
out.append({"code": "SPIRO", "text": "Fungsi paru (spirometri) tidak normal — relevan untuk area paparan BBM.", ...})
```

---

### A.4 — Backend: `backend/app/ai/chat.py`

Cari dan ganti semua kemunculan `gas/uap BBM` atau `uap BBM` pada teks prompt/contoh di file ini menjadi `paparan BBM`. Jangan ubah kata kode regex/filter (baris ±93 yang berisi `uap|bbm` — itu keyword retriever, bukan label tampilan, **biarkan apa adanya**).

---

### A.5 — Backend: `backend/knowledge/01_sop_akses_area_khusus.md`

Baris 16 — deskripsi area RESTRICTED_GAS:

```markdown
# SEBELUM
- Area Terbatas Gas/Uap BBM (RESTRICTED_GAS): ... paparan uap hidrokarbon ...

# SESUDAH
- Area Paparan BBM (RESTRICTED_GAS): ... paparan uap hidrokarbon/BBM ...
```

Perbarui juga referensi "Gas/BBM" atau "gas/uap BBM" lain di file knowledge yang sama dan di file `03_faq_screening_harian.md` jika ada (cari dengan grep `uap`).

---

### A.6 — Frontend: `frontend/src/components/status.tsx`

```typescript
// SEBELUM (baris ±102)
RESTRICTED_GAS: "Gas/BBM",

// SESUDAH
RESTRICTED_GAS: "Paparan BBM",
```

---

### A.7 — Frontend: `frontend/src/app/login/page.tsx`

```typescript
// SEBELUM (baris ±19)
["Area khusus", "Wilayah dingin, area panas, ketinggian, serta gas dan uap BBM."],

// SESUDAH
["Area khusus", "Wilayah dingin, area panas, ketinggian, serta area paparan BBM."],
```

---

### A.8 — Verifikasi Fase A

Setelah semua perubahan:
1. Jalankan `grep -r "uap BBM\|Gas/BBM\|gas/uap" backend/ frontend/src/` — pastikan **tidak ada hasil tersisa** (kecuali di komentar kode jika memang diizinkan).
2. Restart backend dan buka `/api/meta` → field `areas[3].label` harus berisi `"Area Paparan BBM"`.
3. Buka halaman **Status Kartu** di frontend → label kartu keempat harus `"Paparan BBM"`.

---

## FASE B — Unit pada Register/Profil: Dropdown MOR I–V

### Deskripsi
Saat ini:
- Halaman **Register** (`/register`) tidak memiliki field unit sama sekali.
- Halaman **Lengkapi Profil** (`/lengkapi-profil`) memiliki field unit berupa `<input>` dengan `<datalist>` opsi lama (CDU, Maintenance, dll).

Yang diminta: field unit jadi **dropdown wajib** dengan opsi `MOR I`, `MOR II`, `MOR III`, `MOR IV`, `MOR V`, ditambahkan ke **halaman register** juga.

### Daftar opsi unit (konstanta)
```
MOR I
MOR II
MOR III
MOR IV
MOR V
```

---

### B.1 — Backend: `backend/app/schemas.py`

Tambahkan validasi `unit` pada `RegisterIn` (baris ±33–68):

```python
VALID_UNITS = ["MOR I", "MOR II", "MOR III", "MOR IV", "MOR V"]

class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=3, max_length=128)
    employee_code: str = Field(min_length=3, max_length=32)
    unit: str                                                     # TAMBAHAN BARU
    phone: str = Field(min_length=9, max_length=20)
    email: str | None = Field(default=None, max_length=128)
    consent: bool = False

    # ... validator yang sudah ada ...

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str) -> str:
        v = v.strip()
        if v not in VALID_UNITS:
            raise ValueError(f"Unit harus salah satu dari: {', '.join(VALID_UNITS)}")
        return v
```

Juga perbarui `GeneralProfileIn` (baris ±95) dengan validasi yang sama:

```python
class GeneralProfileIn(BaseModel):
    # ...
    unit: str = Field(min_length=2, max_length=128)
    # ...

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str) -> str:
        v = v.strip()
        if v not in VALID_UNITS:
            raise ValueError(f"Unit harus salah satu dari: {', '.join(VALID_UNITS)}")
        return v
```

> **Catatan:** Definisikan `VALID_UNITS` sebagai konstanta di paling atas `schemas.py` (atau di `constants.py`) agar dapat dipakai kedua skema.

---

### B.2 — Backend: `backend/app/routers/auth.py`

Pada fungsi `register()` (baris ±77–87), simpan `unit` saat membuat `Employee`:

```python
emp = Employee(
    employee_code=body.employee_code,
    full_name=body.full_name,
    phone=body.phone,
    unit=body.unit,                   # TAMBAHAN BARU
    card_number=next_card_number(db),
    card_active=True,
    registration_source="SELF",
    created_at=now,
)
```

> **Database:** Kolom `unit` sudah ada di tabel `employees` (`models.py` baris 30). **Tidak perlu migrasi DDL**.

---

### B.3 — Frontend: `frontend/src/lib/auth.tsx`

Tambahkan `unit` pada tipe `RegisterData`:

```typescript
export type RegisterData = {
  username: string;
  password: string;
  full_name: string;
  employee_code: string;
  unit: string;             // TAMBAHAN BARU
  phone: string;
  email: string | null;
  consent: boolean;
};
```

---

### B.4 — Frontend: `frontend/src/app/register/page.tsx`

1. Tambahkan konstanta opsi unit (letakkan di luar komponen, di atas fungsi `RegisterPage`):

```typescript
const UNIT_OPTIONS = ["MOR I", "MOR II", "MOR III", "MOR IV", "MOR V"] as const;
```

2. Tambahkan `unit: ""` ke state form `f`:

```typescript
const [f, setF] = useState({ full_name: "", employee_code: "", username: "", unit: "", phone: "", email: "", password: "", confirm: "" });
```

3. Tambahkan validasi `unit` ke array wajib diisi:

```typescript
for (const k of ["full_name", "employee_code", "username", "unit", "phone", "password"] as const)
  if (!f[k].trim()) er[k] = "Wajib diisi";
```

4. Kirim `unit` pada payload `register()`:

```typescript
const u = await register({
  username: f.username.trim().toLowerCase(),
  password: f.password,
  full_name: f.full_name,
  employee_code: f.employee_code,
  unit: f.unit,            // TAMBAHAN BARU
  phone: f.phone,
  email: f.email || null,
  consent,
});
```

5. Tambahkan field dropdown `Unit` pada JSX form (letakkan setelah field Employee ID dan sebelum field Username):

```tsx
// Pastikan Select sudah diimpor dari "@/components/ui"
import { Alert, Button, Card, Checkbox, Field, Input, Select } from "@/components/ui";

// Di dalam <div className="grid gap-4 sm:grid-cols-2">:
<Field label="Unit" required error={errors.unit} htmlFor="r-unit">
  <Select id="r-unit" value={f.unit} onChange={(e) => setF((x) => ({ ...x, unit: e.target.value }))}>
    <option value="">— Pilih Unit —</option>
    {UNIT_OPTIONS.map((u) => (
      <option key={u} value={u}>{u}</option>
    ))}
  </Select>
</Field>
```

---

### B.5 — Frontend: `frontend/src/components/profile.tsx`

Ganti konstanta `UNITS` lama (baris 36) dan ubah field unit dari `<input>+<datalist>` menjadi `<Select>`:

```typescript
// SEBELUM (baris 36)
const UNITS = ["Unit Pengolahan (CDU)", "Maintenance", "Tank Farm & Distribusi", "Laboratorium QC", "Utilities", "Terminal LNG", "HSE"];

// SESUDAH
const UNIT_OPTIONS = ["MOR I", "MOR II", "MOR III", "MOR IV", "MOR V"] as const;
```

Ganti JSX field unit (baris ±97–103) dari `<Input>` + `<datalist>` menjadi:

```tsx
<Field label="Unit" required error={errors.unit} htmlFor="g-unit">
  <Select id="g-unit" value={f.unit} onChange={set("unit")}>
    <option value="">— Pilih Unit —</option>
    {UNIT_OPTIONS.map((u) => (
      <option key={u} value={u}>{u}</option>
    ))}
  </Select>
</Field>
```

> Komponen `Select` sudah diimpor di baris 8 file ini — tidak perlu tambah impor baru.

---

### B.6 — Verifikasi Fase B

1. Buka halaman `/register` → field **Unit** harus muncul sebagai dropdown dengan 5 pilihan MOR.
2. Coba submit tanpa memilih unit → harus muncul error validasi.
3. Daftar dengan unit yang dipilih → profil pekerja baru harus menampilkan unit yang sesuai.
4. Buka halaman `/lengkapi-profil` → field unit harus dropdown MOR juga.
5. Pastikan admin yang melihat detail pekerja (`/admin/pekerja/[id]`) menampilkan nilai unit baru.

---

## FASE C — Status Boleh Berkendara Berdasarkan MCU Harian

### Deskripsi
Tambahkan penilaian kelayakan berkendara harian (Fit to Drive / FTD) yang dihitung bersamaan dengan evaluasi area kerja, bersumber dari data yang **sudah ada** (tensi harian + MCU tahunan). Tidak memerlukan input data baru dari pekerja.

**Logika bisnis (simulasi — perlu validasi dokter sebelum produksi):**
- Jika tensi hari ini **belum diinput** → `UNFIT_TO_DRIVE` (alasan: `FTD_BP_NOT_SUBMITTED`)
- Jika tensi hari ini sistolik ≥ 180 atau diastolik ≥ 110 → `UNFIT_TO_DRIVE` (alasan: `FTD_BP_VERY_HIGH`)
- Jika tensi hari ini sistolik ≥ 140 atau diastolik ≥ 90 → `UNFIT_TO_DRIVE` (alasan: `FTD_BP_HIGH`)
- Jika MCU terbaru menunjukkan `UNFIT` → `UNFIT_TO_DRIVE` (alasan: `FTD_MCU_UNFIT`)
- Jika MCU terbaru expired atau belum diverifikasi → `UNFIT_TO_DRIVE` (alasan: `FTD_MCU_INVALID`)
- Jika komorbid Epilepsi aktif → `UNFIT_TO_DRIVE` (alasan: `FTD_EPILEPSY`)
- Jika semua kondisi aman → `FIT_TO_DRIVE`

**Prinsip penting:** Status FTD bersifat informatif di dashboard, **tidak terhubung ke sistem kartu akses area** (itu domain berbeda). Status ini relevan khususnya bagi Awak Mobil Tangki (AMT).

---

### C.1 — Backend: `backend/app/constants.py`

Tambahkan blok konstanta baru di bawah baris `BP_SOURCES`:

```python
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
```

---

### C.2 — Backend: `backend/app/services/facts.py`

Tambahkan fungsi `evaluate_fit_to_drive()` di bawah fungsi `build_facts()`:

```python
from ..constants import FIT_TO_DRIVE, UNFIT_TO_DRIVE, VERIFIED

def evaluate_fit_to_drive(facts: dict, comorbidities: list, config: dict) -> dict:
    """
    Menghitung status kelayakan berkendara dari fakta yang sudah dibangun.
    Mengembalikan dict: { status, reasons: [str] }
    """
    settings = config.get("settings", {})
    sys_hi   = int(settings.get("bp_high_systolic",     140))
    dia_hi   = int(settings.get("bp_high_diastolic",     90))
    sys_crit = int(settings.get("bp_critical_systolic", 180))
    dia_crit = int(settings.get("bp_critical_diastolic",110))

    reasons = []

    # 1. Tensi belum diinput hari ini — langsung UNFIT (tidak perlu cek lain)
    if not facts.get("bp.submitted_today"):
        return {"status": UNFIT_TO_DRIVE, "reasons": ["FTD_BP_NOT_SUBMITTED"]}

    # 2. Nilai tensi
    sys = facts.get("bp.systolic") or 0
    dia = facts.get("bp.diastolic") or 0
    if sys >= sys_crit or dia >= dia_crit:
        reasons.append("FTD_BP_VERY_HIGH")
    elif sys >= sys_hi or dia >= dia_hi:
        reasons.append("FTD_BP_HIGH")

    # 3. Status MCU
    if not facts.get("mcu.exists") or facts.get("mcu.expired"):
        reasons.append("FTD_MCU_INVALID")
    elif not facts.get("mcu.verified"):
        reasons.append("FTD_MCU_INVALID")
    elif facts.get("mcu.conclusion") == "UNFIT":
        reasons.append("FTD_MCU_UNFIT")

    # 4. Epilepsi aktif
    for c in comorbidities:
        if getattr(c, "condition_code", None) == "EPILEPSY" and getattr(c, "active", False):
            reasons.append("FTD_EPILEPSY")
            break

    if reasons:
        return {"status": UNFIT_TO_DRIVE, "reasons": reasons}
    return {"status": FIT_TO_DRIVE, "reasons": []}
```

---

### C.3 — Backend: `backend/app/services/assessment.py`

Impor fungsi baru dan panggil setelah `build_facts()`:

```python
from .facts import build_facts, evaluate_fit_to_drive, active_comorbidities  # tambah import baru

def run_assessment(...):
    now = now or utcnow()
    rv = get_active_rules(db)
    config = rv.config
    facts, meta = build_facts(db, employee, config, now)
    result = evaluate(config, facts)

    # === TAMBAHAN: Evaluasi Fit to Drive ===
    comorbs = active_comorbidities(db, employee.id)
    ftd = evaluate_fit_to_drive(facts, comorbs, config)
    # ======================================

    # Simpan ke meta AssessmentRun:
    run = AssessmentRun(
        id=uuid4().hex,
        employee_id=employee.id,
        assessed_at=now,
        trigger=trigger,
        rule_version_id=rv.id,
        rule_version_label=f"v{rv.version} · {rv.label}",
        facts=facts,
        meta={
            **meta,
            "ftd_status": ftd["status"],    # TAMBAHAN — tidak perlu kolom baru
            "ftd_reasons": ftd["reasons"],  # TAMBAHAN — disimpan di JSON meta
        },
        trace=result["trace"],
        flags=result["flags"],
        summary={a: r["status"] for a, r in result["areas"].items()},
        engine_error=result["engine_error"],
        valid_until=valid_until,
        actor_user_id=actor.id if actor else None,
    )
    # sisa kode tidak berubah...
```

---

### C.4 — Backend: `backend/app/services/views.py`

Tambahkan fungsi serialisasi FTD baru:

```python
from ..constants import FTD_STATUS_LABELS, FTD_REASONS

def ftd_view(run) -> dict | None:
    """Serialisasi status Fit to Drive dari AssessmentRun."""
    if run is None or not run.meta:
        return None
    status = run.meta.get("ftd_status")
    reasons_codes = run.meta.get("ftd_reasons", [])
    if not status:
        return None
    return {
        "status": status,
        "status_label": FTD_STATUS_LABELS.get(status, status),
        "reasons": [
            {
                "code": code,
                "short": FTD_REASONS.get(code, {}).get("short", code),
                "detail": FTD_REASONS.get(code, {}).get("detail"),
            }
            for code in reasons_codes
        ],
        "assessed_at": iso(run.assessed_at) if run and run.assessed_at else None,
    }
```

---

### C.5 — Backend: `backend/app/routers/me.py`

Cari endpoint yang mengembalikan data kartu pekerja (cari `GET /api/me/card` atau endpoint serupa). Tambahkan field `fit_to_drive`:

```python
from ..services.views import card_view, ftd_view  # tambah ftd_view

# Di endpoint GET /api/me/card (atau nama endpoint yang ada):
run = db.get(AssessmentRun, emp.latest_run_id) if emp.latest_run_id else None
return {
    "areas": [card_view(db, emp, area) for area in ...],  # sudah ada
    "assessment": _assessment_meta(run),                   # sudah ada
    "fit_to_drive": ftd_view(run),                        # TAMBAHAN BARU
}
```

---

### C.6 — Frontend: `frontend/src/lib/types.ts`

Tambahkan interface FTD setelah interface `AssessmentMeta`:

```typescript
export interface FitToDrive {
  status: "FIT_TO_DRIVE" | "UNFIT_TO_DRIVE";
  status_label: string;
  reasons: { code: string; short: string; detail?: string }[];
  assessed_at: string | null;
}
```

---

### C.7 — Frontend: Komponen Baru `FitToDriveBadge`

Tambahkan di bagian bawah `frontend/src/components/status.tsx`:

```tsx
import type { FitToDrive } from "@/lib/types";
// Tambahkan Car ke import lucide-react yang sudah ada di file ini
import { ..., Car } from "lucide-react";

export function FitToDriveBadge({ ftd }: { ftd: FitToDrive }) {
  const isFit = ftd.status === "FIT_TO_DRIVE";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isFit
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-rose-200 bg-rose-50/60",
      )}
    >
      <div className="flex items-center gap-2">
        <Car className={cn("size-5", isFit ? "text-emerald-600" : "text-rose-600")} />
        <span className={cn("font-semibold text-sm", isFit ? "text-emerald-700" : "text-rose-700")}>
          {ftd.status_label}
        </span>
      </div>
      {!isFit && ftd.reasons.length > 0 && (
        <ul className="mt-2 space-y-1">
          {ftd.reasons.map((r) => (
            <li key={r.code} className="text-sm text-rose-600">
              • {r.short}
            </li>
          ))}
        </ul>
      )}
      {ftd.assessed_at && (
        <p className="mt-2 text-xs text-slate-400">
          Dievaluasi: {new Date(ftd.assessed_at).toLocaleString("id-ID")}
        </p>
      )}
    </div>
  );
}
```

---

### C.8 — Frontend: `frontend/src/app/(app)/dashboard/page.tsx`

Tambahkan tampilan FTD di beranda pekerja:

```tsx
import { FitToDriveBadge } from "@/components/status";
import type { FitToDrive } from "@/lib/types";

// Pastikan endpoint /api/me/card di-fetch (kemungkinan sudah ada useSWR di halaman ini)
// Jika response-nya belum mengandung fit_to_drive, tambahkan setelah Fase C.5 selesai.
// Tambahkan field fit_to_drive ke tipe data fetch:
const { data: cardData } = useSWR<{ areas: CardArea[]; fit_to_drive: FitToDrive | null }>(
  "/api/me/card"
);

// Di dalam JSX (di bawah ringkasan tensi/status kartu):
{cardData?.fit_to_drive && (
  <section>
    <h2 className="mb-2 text-sm font-semibold text-slate-700">
      Status Berkendara Hari Ini
    </h2>
    <FitToDriveBadge ftd={cardData.fit_to_drive} />
  </section>
)}
```

---

### C.9 — Verifikasi Fase C

1. Login sebagai pekerja yang **belum input tensi** → `GET /api/me/card` harus mengembalikan `fit_to_drive.status = "UNFIT_TO_DRIVE"` dengan reasons `["FTD_BP_NOT_SUBMITTED"]`.
2. Input tensi normal → status berubah menjadi `FIT_TO_DRIVE`.
3. Input tensi sistolik ≥ 140 → status `UNFIT_TO_DRIVE` dengan reasons `["FTD_BP_HIGH"]`.
4. Dashboard pekerja menampilkan badge FTD yang sesuai.
5. Pastikan status FTD **tidak mempengaruhi** status area kartu (COLD, HOT, HEIGHT, RESTRICTED_GAS) — ini hanya informasi tambahan.

---

## FASE D — Tambah Role Kesehatan (HEALTH) dan Security (SECURITY)

### Deskripsi dan Prinsip Desain

Penambahan 2 role baru dengan hak akses berbeda:

| Role | Akses yang Dimiliki | Akses yang TIDAK Boleh |
|------|--------------------|-----------------------|
| **HEALTH** (Petugas Kesehatan/Klinik) | Verifikasi MCU, antrian review medis, detail kesehatan pekerja, input tensi untuk pekerja, status FTD | Kelola aturan kelayakan, pengaturan sistem, audit log penuh, override permanen |
| **SECURITY** (Petugas Keamanan/Gerbang) | Simulasi tap kartu, daftar status kartu pekerja (hanya status izin, **tanpa data medis**), log akses gerbang | Rekam medis pekerja, nilai tensi/MCU, komorbid, detail diagnosis apapun |

> **Prinsip UU PDP:** Role Security **dilarang keras** mengakses data kesehatan pekerja. Backend wajib mengembalikan 403 jika Security mencoba endpoint kesehatan.

---

### D.1 — Backend: `backend/app/constants.py`

```python
# SEBELUM
ROLE_WORKER = "WORKER"
ROLE_ADMIN = "ADMIN"

# SESUDAH
ROLE_WORKER = "WORKER"
ROLE_ADMIN = "ADMIN"
ROLE_HEALTH = "HEALTH"      # Petugas kesehatan / klinik
ROLE_SECURITY = "SECURITY"  # Petugas keamanan / gerbang

ROLE_LABELS = {
    ROLE_WORKER:   "Pekerja",
    ROLE_ADMIN:    "Admin K3",
    ROLE_HEALTH:   "Petugas Kesehatan",
    ROLE_SECURITY: "Petugas Keamanan",
}

# Role non-pekerja yang punya akses panel staf
STAFF_ROLES = [ROLE_ADMIN, ROLE_HEALTH, ROLE_SECURITY]
```

---

### D.2 — Backend: `backend/app/deps.py`

Tambahkan dependency baru di bawah `require_worker()`:

```python
from .constants import ROLE_ADMIN, ROLE_HEALTH, ROLE_SECURITY, ROLE_WORKER

def require_health(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Hanya HEALTH (atau ADMIN sebagai superrole) yang bisa akses."""
    if user.role not in (ROLE_HEALTH, ROLE_ADMIN):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Fitur ini hanya untuk petugas kesehatan atau admin K3"
        )
    return user

def require_security(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Hanya SECURITY (atau ADMIN) yang bisa akses."""
    if user.role not in (ROLE_SECURITY, ROLE_ADMIN):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Fitur ini hanya untuk petugas keamanan atau admin K3"
        )
    return user

def require_staff(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """ADMIN, HEALTH, atau SECURITY — semua kecuali WORKER."""
    if user.role == ROLE_WORKER:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Fitur ini tidak tersedia untuk akun pekerja"
        )
    return user
```

---

### D.3 — Backend: Pemetaan Hak Akses Endpoint

**Prinsip:** Semua endpoint `require_admin` yang tidak disebut di tabel ini **tetap** `require_admin`.

| Endpoint | Sebelum | Sesudah | Catatan |
|----------|---------|---------|---------|
| `GET /api/admin/workers` | `require_admin` | `require_staff` | Security perlu lihat daftar kartu |
| `GET /api/admin/workers/{id}` | `require_admin` | Conditional (lihat bawah) | HEALTH: full; SECURITY: strip data medis |
| `GET /api/admin/review` | `require_admin` | `require_health` | Antrian review MCU/komorbid |
| `POST /api/admin/mcu/{id}/verify` | `require_admin` | `require_health` | Verifikasi MCU |
| `POST /api/admin/workers/{id}/bp` | `require_admin` | `require_health` | Input tensi oleh petugas |
| Pengaturan sistem (WhatsApp, aturan, audit) | `require_admin` | **Tetap `require_admin`** | Tidak dibuka ke HEALTH/SECURITY |

**Implementasi filter detail pekerja untuk Security** di `admin.py`:

```python
from ..constants import ROLE_SECURITY

@router.get("/api/admin/workers/{worker_id}")
def worker_detail(
    worker_id: int,
    user: CurrentUser = Depends(require_staff),
    db: Session = Depends(get_db),
):
    emp = db.get(Employee, worker_id)
    if not emp:
        raise HTTPException(404, "Pekerja tidak ditemukan")

    # Security hanya mendapat profil dasar + status kartu (tanpa nilai medis)
    if user.role == ROLE_SECURITY:
        return {
            "employee": employee_basic(emp),
            "card_areas": card_view(db, emp),   # hanya status area, bukan alasan medis
        }

    # HEALTH dan ADMIN mendapat data lengkap (kode yang sudah ada)
    return full_worker_detail(db, emp, user)
```

---

### D.4 — Backend: Endpoint Tambahan: Buat Akun Staf

Role HEALTH dan SECURITY **tidak boleh** dibuat via `/api/auth/register` (itu untuk WORKER saja). Tambahkan endpoint baru di `admin.py`:

```python
class CreateStaffIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=3, max_length=128)
    role: Literal["HEALTH", "SECURITY"]

@router.post("/api/admin/staff")
def create_staff(
    body: CreateStaffIn,
    user: CurrentUser = Depends(require_admin),   # hanya ADMIN
    db: Session = Depends(get_db),
):
    if db.scalar(select(User.id).where(User.username == body.username)):
        raise HTTPException(409, "Username sudah dipakai")
    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        full_name=body.full_name,
        is_active=True,
        created_at=utcnow(),
    )
    db.add(new_user)
    db.commit()
    return {"id": new_user.id, "username": new_user.username, "role": new_user.role}
```

---

### D.5 — Backend: `backend/app/seed.py`

Tambahkan akun demo untuk dua role baru:

```python
from .constants import ROLE_ADMIN, ROLE_WORKER, ROLE_HEALTH, ROLE_SECURITY, ...

# Di dalam fungsi seed, setelah membuat admin:

# Akun demo Petugas Kesehatan
health_user = User(
    username="klinik",
    password_hash=hash_password("demo1234"),
    role=ROLE_HEALTH,
    full_name="Dr. Sari Dewi (Klinik K3)",
    is_active=True,
    created_at=now,
)
db.add(health_user)

# Akun demo Petugas Keamanan
security_user = User(
    username="security",
    password_hash=hash_password("demo1234"),
    role=ROLE_SECURITY,
    full_name="Ahmad Fadil (Security Gate)",
    is_active=True,
    created_at=now,
)
db.add(security_user)
```

Tambahkan `"klinik"` dan `"security"` ke list `DEMO_USERNAMES` agar muncul di endpoint `/api/auth/demo-accounts`.

---

### D.6 — Frontend: `frontend/src/lib/types.ts`

```typescript
// SEBELUM (baris 1)
export type Role = "WORKER" | "ADMIN";

// SESUDAH
export type Role = "WORKER" | "ADMIN" | "HEALTH" | "SECURITY";
```

---

### D.7 — Frontend: `frontend/src/lib/auth.tsx`

Perbarui fungsi `homeFor()`:

```typescript
export function homeFor(user: User | null): string {
  if (!user) return "/login";
  if (user.role === "ADMIN")    return "/admin";
  if (user.role === "HEALTH")   return "/health";     // TAMBAHAN
  if (user.role === "SECURITY") return "/security";   // TAMBAHAN
  return user.onboarding && !user.onboarding.completed ? "/lengkapi-profil" : "/dashboard";
}
```

---

### D.8 — Frontend: Halaman Baru untuk Role HEALTH

Buat `frontend/src/app/(app)/health/page.tsx`:

```tsx
"use client";
// Dashboard petugas kesehatan
// Konten:
// - Jumlah MCU belum diverifikasi
// - Jumlah antrian review hari ini
// - Shortcut ke /admin/review (pakai komponen yang sudah ada)
// - Ringkasan kepatuhan tensi per unit (MOR I–V)
// - Shortcut ke daftar pekerja /admin/pekerja
//
// Agen: implementasikan sesuai gaya komponen yang ada di halaman /admin/page.tsx
// sebagai referensi tampilan.
```

---

### D.9 — Frontend: Halaman Baru untuk Role SECURITY

Buat `frontend/src/app/(app)/security/page.tsx`:

```tsx
"use client";
// Dashboard pos keamanan
// Konten:
// - Form simulasi tap kartu (reuse komponen dari /tap/page.tsx)
// - Log akses gerbang terkini (hanya: nama, kode, hasil tap, area, waktu)
// - TIDAK ADA: nilai tensi, MCU, komorbid, alasan medis apapun
//
// Agen: gunakan /tap/page.tsx sebagai referensi; hapus semua data medis dari view.
```

---

### D.10 — Frontend: `frontend/src/components/AppShell.tsx`

Tambahkan konstanta navigasi baru dan perbarui logika pemilihan:

```typescript
const HEALTH_NAV: NavGroup[] = [
  {
    title: "Review Medis",
    items: [
      { href: "/health",         label: "Dashboard",          icon: LayoutDashboard },
      { href: "/admin/review",   label: "Antrian Review MCU", icon: Inbox, badgeKey: "total" },
      { href: "/admin/pekerja",  label: "Daftar Pekerja",     icon: Users },
    ],
  },
  {
    title: "Lainnya",
    items: [
      { href: "/asisten", label: "Asisten AI K3", icon: Bot },
    ],
  },
];

const SECURITY_NAV: NavGroup[] = [
  {
    title: "Pos Keamanan",
    items: [
      { href: "/security", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tap",      label: "Simulasi Tap Kartu", icon: ScanLine },
    ],
  },
];

// Perbarui logika pemilihan grup navigasi (baris ±245–246):
const groups =
  user.role === "ADMIN"    ? ADMIN_NAV :
  user.role === "HEALTH"   ? HEALTH_NAV :
  user.role === "SECURITY" ? SECURITY_NAV :
  WORKER_NAV;

// Perbarui label role di sidebar (baris ±182):
const roleLabel =
  user.role === "ADMIN"    ? "Admin K3" :
  user.role === "HEALTH"   ? "Petugas Kesehatan" :
  user.role === "SECURITY" ? "Petugas Keamanan" :
  `${user.employee?.employee_code} · Pekerja`;
```

---

### D.11 — Frontend: `frontend/src/app/(app)/layout.tsx`

Tambahkan guard proteksi halaman baru:

```typescript
// Tambahkan ke useEffect yang sudah ada (atau buat useEffect baru):
useEffect(() => {
  if (!user || loading) return;
  if (pathname.startsWith("/health") && user.role !== "HEALTH" && user.role !== "ADMIN")
    router.replace(homeFor(user));
  if (pathname.startsWith("/security") && user.role !== "SECURITY" && user.role !== "ADMIN")
    router.replace(homeFor(user));
}, [pathname, user, loading, router]);
```

---

### D.12 — Frontend: `frontend/src/app/login/page.tsx`

Tambahkan tampilan demo untuk akun baru. Cari bagian yang memfilter `admins` dan `workers`, tambahkan filter baru:

```typescript
const admins    = accounts.filter((a) => a.role === "ADMIN");
const workers   = accounts.filter((a) => a.role === "WORKER");
const healthAcc = accounts.filter((a) => a.role === "HEALTH");   // TAMBAHAN
const secAcc    = accounts.filter((a) => a.role === "SECURITY"); // TAMBAHAN

// Tambahkan grup baru di JSX setelah grup admins:
{healthAcc.length > 0 && (
  <div>
    <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
      Petugas Kesehatan
    </p>
    {healthAcc.map((a) => <DemoRow key={a.username} acc={a} busy={busy} onClick={() => quick(a)} />)}
  </div>
)}
{secAcc.length > 0 && (
  <div>
    <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
      Petugas Keamanan
    </p>
    {secAcc.map((a) => <DemoRow key={a.username} acc={a} busy={busy} onClick={() => quick(a)} />)}
  </div>
)}
```

---

### D.13 — Verifikasi Fase D

1. Login sebagai `klinik` → diarahkan ke `/health`, hanya menu kesehatan yang muncul.
2. Login sebagai `security` → diarahkan ke `/security`, hanya menu keamanan yang muncul.
3. Akun `security` mencoba akses URL `/admin/review` → mendapat redirect ke `/security`.
4. Akun `security` mencoba `GET /api/admin/review` langsung → mendapat **HTTP 403**.
5. Akun `klinik` mencoba akses `/admin/aturan` atau `/admin/whatsapp` → mendapat redirect.
6. Akun `klinik` mencoba `GET /api/admin/workers/{id}` → mendapat data lengkap termasuk medis.
7. Akun `security` mencoba `GET /api/admin/workers/{id}` → mendapat data **tanpa** nilai tensi/MCU.
8. Akun `security` dapat melihat simulasi tap kartu.
9. Akun `klinik` dapat memverifikasi MCU pekerja via `/admin/review`.
10. Registrasi mandiri baru tetap menghasilkan role `WORKER`.
11. Akun `admin` tetap bisa mengakses semua halaman tanpa batasan.
12. Jalankan ulang seed: `python -m app.seed --reset` dan pastikan akun `klinik` + `security` muncul di halaman login demo.

---

## Urutan Implementasi & Checklist Lengkap

```
[x] FASE A — Penamaan "Paparan BBM"
    [x] A.1  backend/app/constants.py — label RESTRICTED_GAS
    [x] A.2  backend/app/seed.py — deskripsi ruangan demo
    [x] A.3  backend/app/mcu/parser.py — teks saran spirometri
    [x] A.4  backend/app/ai/chat.py — teks prompt (bukan keyword regex)
    [x] A.5  backend/knowledge/01_sop_akses_area_khusus.md — dan file knowledge lain
    [x] A.6  frontend/src/components/status.tsx — AREA_SHORT
    [x] A.7  frontend/src/app/login/page.tsx — deskripsi fitur
    [x] A.8  Verifikasi: grep, /api/meta, halaman Status Kartu

[x] FASE B — Dropdown Unit MOR I–V
    [x] B.1  backend/app/schemas.py — VALID_UNITS + RegisterIn + GeneralProfileIn
    [x] B.2  backend/app/routers/auth.py — simpan unit saat register
    [x] B.3  frontend/src/lib/auth.tsx — tipe RegisterData
    [x] B.4  frontend/src/app/register/page.tsx — state + validasi + JSX Select
    [x] B.5  frontend/src/components/profile.tsx — konstanta + JSX Select
    [x] B.6  Verifikasi: form register, form profil, detail admin

[x] FASE C — Status Boleh Berkendara (FTD)
    [x] C.1  backend/app/constants.py — FTD constants
    [x] C.2  backend/app/services/facts.py — evaluate_fit_to_drive()
    [x] C.3  backend/app/services/assessment.py — panggil FTD + simpan ke meta
    [x] C.4  backend/app/services/views.py — ftd_view()
    [x] C.5  backend/app/routers/me.py — field fit_to_drive di response
    [x] C.6  frontend/src/lib/types.ts — interface FitToDrive
    [x] C.7  frontend/src/components/status.tsx — FitToDriveBadge komponen
    [x] C.8  frontend/src/app/(app)/dashboard/page.tsx — tampilkan FitToDriveBadge
    [x] C.9  Verifikasi: status FTD per skenario tensi + tidak ganggu area kartu

[x] FASE D — Role Kesehatan & Security
    [x] D.1  backend/app/constants.py — ROLE_HEALTH, ROLE_SECURITY, ROLE_LABELS
    [x] D.2  backend/app/deps.py — require_health(), require_security(), require_staff()
    [x] D.3  backend/app/routers/admin.py & access.py — pemetaan hak akses endpoint
    [x] D.4  backend/app/routers/admin.py — endpoint POST /api/admin/staff
    [x] D.5  backend/app/seed.py — akun demo klinik + security
    [x] D.6  frontend/src/lib/types.ts — Role union type
    [x] D.7  frontend/src/lib/auth.tsx — homeFor()
    [x] D.8  frontend/src/app/(app)/health/page.tsx — buat halaman baru
    [x] D.9  frontend/src/app/(app)/security/page.tsx — buat halaman baru
    [x] D.10 frontend/src/components/AppShell.tsx — navigasi + label role
    [x] D.11 frontend/src/app/(app)/layout.tsx — guard proteksi halaman
    [x] D.12 frontend/src/app/login/page.tsx — demo accounts
    [x] D.13 Verifikasi: semua skenario akses role
```

---

## Catatan Penting untuk Agen

1. **Jangan ubah nama kode area** `RESTRICTED_GAS` di database, models, enum frontend, atau logika aturan — hanya label tampilan yang berubah (Fase A).
2. **Jangan tambahkan kolom database baru** untuk FTD — gunakan kolom JSON `meta` yang sudah ada di `AssessmentRun` (Fase C).
3. **Role HEALTH dan SECURITY tidak boleh dibuat via `/api/auth/register`** — hanya admin yang boleh membuat akun staf baru via endpoint baru `POST /api/admin/staff` (Fase D.4).
4. **Data medis pekerja** (nilai tensi, MCU, komorbid, alasan detail status) **tidak boleh dikirim ke role SECURITY** — ini bukan hanya UX, ini kepatuhan prinsip UU PDP No. 27/2022.
5. Setelah setiap fase, **jalankan backend** (`uvicorn app.main:app --port 8000 --reload`) dan pastikan tidak ada import error atau Pydantic validation error sebelum lanjut ke fase berikutnya.
6. File seed dijalankan ulang dengan perintah dari folder `backend/`: `python -m app.seed --reset`. Lakukan ini setelah Fase D selesai untuk mendapatkan akun demo lengkap.
7. `VALID_UNITS` sebaiknya didefinisikan **sekali saja** (di `constants.py` atau di paling atas `schemas.py`) dan diimpor ke tempat yang membutuhkannya — hindari duplikasi konstanta.
