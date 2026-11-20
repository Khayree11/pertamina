# Actionable Implementation Plan — Fase A–D

Dokumen ini menerjemahkan [PLANNING_AGENT.md](./PLANNING_AGENT.md) menjadi daftar kerja yang dapat dieksekusi dan diverifikasi. Fokusnya adalah melengkapi bagian yang belum selesai tanpa mengulang implementasi yang sudah ada.

## Status saat ini

- **Fase A:** sebagian selesai; masih ada label `Gas/BBM` pada knowledge dan frontend.
- **Fase B:** implementasi utama selesai; test dan data seed masih memakai unit lama.
- **Fase C:** implementasi utama selesai; belum ada test terfokus.
- **Fase D:** implementasi role dasar selesai; isolasi data Security dan kontrak dashboard HEALTH belum benar.
- **Frontend typecheck:** lulus.
- **Backend test:** 54 lulus, 5 gagal; tiga kegagalan terkait langsung dengan field `unit` baru.

## Urutan kerja dan dependency

1. **A — Menuntaskan label Paparan BBM**
2. **B — Menstabilkan unit MOR I–V dan test registrasi**
3. **C — Menambahkan test dan memastikan evaluasi FTD**
4. **D — Memperbaiki isolasi Security dan dashboard HEALTH**
5. **Verifikasi integrasi seluruh fase**

Fase D bergantung pada kontrak data Fase C dan endpoint pekerja yang digunakan frontend. Jangan mengubah kode area internal `RESTRICTED_GAS`.

---

## Fase A — Menuntaskan label Paparan BBM

### A1. Inventarisasi label

Cari semua kemunculan berikut pada `backend/knowledge/` dan `frontend/src/`:

```text
Gas/BBM
gas/uap BBM
uap BBM
Area Terbatas Gas/BBM
```

Pisahkan:

- **Wajib diubah:** label, deskripsi, teks bantuan, knowledge, dan copy UI.
- **Jangan diubah:** `RESTRICTED_GAS`, keyword retriever, regex/filter, nama enum, dan data historis yang bergantung pada kode internal.

### A2. Perbarui knowledge dan frontend

Perbarui sekurang-kurangnya:

- [backend/knowledge/01_sop_akses_area_khusus.md](./backend/knowledge/01_sop_akses_area_khusus.md)
- [backend/knowledge/02_prosedur_kartu_akses.md](./backend/knowledge/02_prosedur_kartu_akses.md)
- [frontend/src/app/(app)/komorbid/page.tsx](./frontend/src/app/(app)/komorbid/page.tsx)
- [frontend/src/app/lengkapi-profil/page.tsx](./frontend/src/app/lengkapi-profil/page.tsx)

Gunakan istilah tampilan yang konsisten:

- `Area Paparan BBM`
- `Paparan BBM`

### A3. Acceptance criteria

- Tidak ada lagi label lama pada `backend/knowledge/` dan `frontend/src/`.
- `RESTRICTED_GAS` tetap tidak berubah.
- `/api/meta` tetap mengembalikan area code `RESTRICTED_GAS`.
- Label kartu dan halaman komorbid/profil menampilkan `Paparan BBM`.

### A4. Verifikasi

```powershell
rg -n "Gas/BBM|gas/uap BBM|uap BBM|Area Terbatas Gas/BBM" backend/knowledge frontend/src
```

Expected result: tidak ada hasil, kecuali keyword teknis yang memang sengaja dipertahankan dan didokumentasikan.

---

## Fase B — Menstabilkan unit MOR I–V

### B1. Tetapkan satu sumber konstanta

Pertahankan `VALID_UNITS` hanya di [backend/app/constants.py](./backend/app/constants.py), lalu gunakan untuk:

- `RegisterIn`
- `GeneralProfileIn`
- endpoint lain yang menerima perubahan unit
- test dan seed

Jangan membuat daftar MOR kedua di backend.

### B2. Sesuaikan test registrasi

Perbarui [backend/tests/test_registration_whatsapp.py](./backend/tests/test_registration_whatsapp.py):

- Tambahkan `"unit": "MOR I"` pada payload `NEW`.
- Gunakan `"MOR II"` pada payload profil general.
- Tambahkan test bahwa unit kosong ditolak.
- Tambahkan test bahwa unit di luar MOR I–V ditolak.
- Pastikan test duplicate username/employee code tetap mencapai status `409`, bukan berhenti di validasi `422`.

### B3. Sesuaikan data seed

Perbarui [backend/app/seed.py](./backend/app/seed.py) agar semua pekerja demo memakai salah satu:

```text
MOR I
MOR II
MOR III
MOR IV
MOR V
```

Pertahankan distribusi data demo yang berguna untuk pengujian, tetapi ganti unit lama dengan MOR yang relevan.

### B4. Validasi frontend dan backend

Periksa:

- [frontend/src/app/register/page.tsx](./frontend/src/app/register/page.tsx)
- [frontend/src/components/profile.tsx](./frontend/src/components/profile.tsx)
- [frontend/src/lib/auth.tsx](./frontend/src/lib/auth.tsx)
- [backend/app/routers/auth.py](./backend/app/routers/auth.py)

Acceptance criteria:

- Register tidak dapat dikirim tanpa unit.
- Dropdown hanya memiliki MOR I–V.
- Profil existing worker dapat disimpan dengan unit MOR.
- Detail admin menampilkan unit yang dipilih.

### B5. Verifikasi

```powershell
Set-Location .\backend
& .\.venv\Scripts\python.exe -m pytest -q tests/test_registration_whatsapp.py
Set-Location ..\frontend
npm run typecheck
```

---

## Fase C — Menyelesaikan dan menguji Fit to Drive

### C1. Review kontrak evaluasi

Pastikan [backend/app/services/facts.py](./backend/app/services/facts.py) memenuhi prioritas berikut:

1. Tensi belum diinput → `FTD_BP_NOT_SUBMITTED`.
2. Tensi kritis → `FTD_BP_VERY_HIGH`.
3. Tensi tinggi → `FTD_BP_HIGH`.
4. MCU tidak ada, expired, atau belum diverifikasi → `FTD_MCU_INVALID`.
5. MCU `UNFIT` → `FTD_MCU_UNFIT`.
6. Epilepsi aktif → `FTD_EPILEPSY`.
7. Tidak ada alasan → `FIT_TO_DRIVE`.

Status FTD harus tetap informatif dan tidak boleh mengubah status area kartu.

### C2. Tambahkan test unit FTD

Buat test terfokus, misalnya pada `backend/tests/test_fit_to_drive.py`, untuk:

- BP belum dikirim.
- BP normal dengan MCU valid dan verified.
- BP high.
- BP very high.
- MCU tidak ada.
- MCU expired.
- MCU belum verified.
- MCU `UNFIT`.
- epilepsi aktif.
- beberapa alasan sekaligus.
- konfigurasi threshold custom.

Test harus memeriksa `status` dan daftar `reasons`, bukan hanya keberadaan response.

### C3. Tambahkan test endpoint

Tambahkan coverage untuk:

- `GET /api/me/card`
- response memiliki `fit_to_drive`
- perubahan status setelah submit BP
- status area tetap sama walaupun FTD berubah

### C4. Verifikasi frontend

Periksa:

- [frontend/src/components/status.tsx](./frontend/src/components/status.tsx)
- [frontend/src/app/(app)/dashboard/page.tsx](./frontend/src/app/(app)/dashboard/page.tsx)
- [frontend/src/app/(app)/kartu/page.tsx](./frontend/src/app/(app)/kartu/page.tsx)
- [frontend/src/app/(app)/tensi/page.tsx](./frontend/src/app/(app)/tensi/page.tsx)

Acceptance criteria:

- Badge menampilkan label FIT/UNFIT.
- Alasan hanya tampil saat UNFIT.
- Timestamp ditampilkan jika tersedia.
- Null response tidak menyebabkan crash.

### C5. Verifikasi

```powershell
Set-Location .\backend
& .\.venv\Scripts\python.exe -m pytest -q tests/test_fit_to_drive.py tests/test_api_flow.py
Set-Location ..\frontend
npm run typecheck
```

---

## Fase D — Menyelesaikan role HEALTH dan SECURITY

### D1. Tetapkan matriks akses backend

Gunakan dependency berikut secara konsisten:

- `require_admin`: konfigurasi, override, audit penuh, integrasi, pembuatan staf.
- `require_health`: review MCU/komorbid dan input tensi petugas.
- `require_security`: endpoint keamanan bila diperlukan.
- `require_staff`: endpoint bersama yang telah difilter dengan aman.

Jangan hanya mengandalkan guard frontend.

### D2. Sanitasi response daftar pekerja untuk Security

Masalah utama saat ini berada pada `/api/admin/employees`, karena response bersama mengandung field medis.

Pisahkan serializer:

- `employee_row_admin_health()`: boleh mengandung BP, MCU, pending verification, urgent.
- `employee_row_security()`: hanya:
  - id
  - employee code
  - nama
  - unit/jabatan bila diperlukan
  - nomor kartu/status kartu
  - status area kartu

Security tidak boleh menerima:

- nilai tensi
- status atau detail MCU
- komorbid
- `urgent`
- `pending_verifications`
- alasan medis
- `fit_to_drive`

Gunakan serializer Security untuk endpoint daftar pekerja dan detail pekerja.

### D3. Hilangkan FTD dari detail Security

Pada branch `ROLE_SECURITY` di [backend/app/routers/admin.py](./backend/app/routers/admin.py):

- hapus `fit_to_drive`
- pertahankan `latest_run: None`
- pertahankan `bp_history`, `mcu`, `comorbidities`, `overrides`, dan `audit` kosong
- pastikan `card` hanya berisi status izin area tanpa decisive medical reason

Tambahkan regression test yang melakukan request sebagai Security dan memastikan key medis tidak ada.

### D4. Batasi endpoint dashboard dan badge

Tentukan akses endpoint berikut:

- `/api/admin/dashboard`: ADMIN dan HEALTH saja.
- `/api/admin/badge`: ADMIN dan HEALTH saja.
- `/api/admin/employees`: STAFF, tetapi response Security harus sanitized.
- `/api/admin/employees/{id}`: ADMIN/HEALTH full; SECURITY sanitized.
- `/api/admin/review-queue`: HEALTH dan ADMIN.

Jika endpoint memiliki data medis, jangan cukup hanya memakai `require_staff`.

### D5. Perbaiki kontrak dashboard HEALTH

Selaraskan [frontend/src/app/(app)/health/page.tsx](./frontend/src/app/(app)/health/page.tsx) dengan response backend.

Pilih satu pendekatan dan konsisten:

1. Ubah frontend agar menggunakan key backend yang sudah ada; atau
2. Ubah backend agar mengembalikan key yang digunakan frontend.

Rekomendasi: gunakan key backend yang sudah dipakai halaman admin, lalu definisikan type `Dash` sesuai response aktual.

Minimum KPI yang harus tampil:

- total pekerja
- screening hari ini
- pekerja belum screening
- pending verification
- urgent review
- ringkasan area

### D6. Verifikasi navigasi dan guard

Periksa:

- [frontend/src/components/AppShell.tsx](./frontend/src/components/AppShell.tsx)
- [frontend/src/app/(app)/layout.tsx](./frontend/src/app/(app)/layout.tsx)
- [frontend/src/lib/auth.tsx](./frontend/src/lib/auth.tsx)
- [frontend/src/app/login/page.tsx](./frontend/src/app/login/page.tsx)

Acceptance criteria:

- HEALTH diarahkan ke `/health`.
- SECURITY diarahkan ke `/security`.
- WORKER tidak dapat membuka halaman staf.
- SECURITY tidak dapat membuka review medis.
- ADMIN tetap memiliki akses penuh.
- Backend tetap mengembalikan `403` walaupun URL dipanggil langsung.

### D7. Tambahkan test role dan privacy

Buat test terfokus untuk:

- login/demo account HEALTH dan SECURITY
- `GET /api/admin/review-queue`: HEALTH `200`, SECURITY `403`
- verify MCU: HEALTH `200`, SECURITY `403`
- input BP petugas: HEALTH `200`, SECURITY `403`
- daftar pekerja Security tidak mengandung field medis
- detail pekerja Security tidak mengandung FTD/MCU/BP/komorbid
- detail pekerja HEALTH mengandung data yang diperlukan
- dashboard Security tidak dapat mengakses endpoint dashboard medis
- registrasi publik selalu menghasilkan `WORKER`

---

## Verifikasi akhir seluruh fase

### Static checks

```powershell
rg -n "Gas/BBM|gas/uap BBM|uap BBM|Area Terbatas Gas/BBM" backend/knowledge frontend/src
rg -n "Unit Pengolahan|Maintenance|Tank Farm & Distribusi|Laboratorium QC|Utilities|Terminal LNG|HSE" backend/app/seed.py backend/tests
```

Hasil yang diharapkan:

- pencarian label lama tidak menghasilkan label UI/knowledge lama;
- seed dan test baru tidak lagi memakai unit lama.

### Backend

```powershell
Set-Location .\backend
& .\.venv\Scripts\python.exe -m pytest -q
```

### Frontend

```powershell
Set-Location .\frontend
npm run typecheck
npm run build
```

### Smoke test manual

1. Login sebagai `klinik`.
2. Pastikan dashboard HEALTH menampilkan KPI tanpa `undefined`.
3. Login sebagai `security`.
4. Pastikan hanya menu keamanan yang muncul.
5. Panggil endpoint detail pekerja sebagai Security dan inspeksi JSON.
6. Pastikan tidak ada BP, MCU, komorbid, FTD, atau alasan medis.
7. Login sebagai worker dan cek dropdown unit MOR.
8. Cek label kartu dan knowledge menggunakan istilah Paparan BBM.
9. Uji FTD dengan BP normal, BP tinggi, dan BP belum diinput.
10. Pastikan status area kartu tidak ikut berubah karena FTD.

## Definition of Done

Fase A–D dianggap selesai hanya jika:

- seluruh acceptance criteria tiap fase terpenuhi;
- test baru untuk unit, FTD, role, dan privacy tersedia;
- seluruh test backend lulus;
- frontend typecheck dan build lulus;
- tidak ada kebocoran data medis ke Security;
- tidak ada label lama `Gas/BBM` pada UI/knowledge yang seharusnya sudah diperbarui;
- perubahan tidak mengubah kode internal `RESTRICTED_GAS`.
