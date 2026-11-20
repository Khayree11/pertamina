# HBAC — Health-Based Access Control (Prototipe Tender)

Platform yang menghubungkan **tensi harian (wajib)**, **MCU tahunan**, dan **riwayat komorbid** pekerja untuk menghasilkan
**status kelayakan per area** (Dingin, Panas, Ketinggian, Gas/BBM), lalu menerjemahkannya menjadi **hak akses kartu**.

> Alat bantu keputusan, **bukan diagnosis medis**. Ambang batas, aturan, dokumen SOP, dan seluruh data pekerja adalah
> **contoh simulasi** — wajib divalidasi dokter perusahaan & pemilik kebijakan K3 sebelum produksi.

## Fitur

| Area | Isi |
|---|---|
| Akun | Login, **registrasi mandiri pekerja** (persetujuan data kesehatan wajib), 2 role (Pekerja, Admin K3) |
| Lengkapi profil | Wizard setelah registrasi: **data umum** (jabatan, unit, lokasi, WA, tgl lahir, jenis kelamin, kontak darurat) → **MCU tahunan** (wajib, boleh menyusul; unggah JPG/PNG/PDF) → **komorbid** (atau nyatakan tidak ada) |
| Pembaca MCU | PDF format **“Kesimpulan Medical Check Up”** dibaca otomatis di server sendiri (tanpa AI eksternal) → ±30 variabel tampil dengan **patokan** & status (Normal / Perlu perhatian / Kosong) → pekerja **memeriksa & mengoreksi** lalu menyimpan. Cek identitas (nama & tgl lahir vs profil), NIK hanya 4 digit terakhir, variabel yang diubah ditandai untuk admin, saran temuan relevan per area. Gambar/PDF hasil scan → isi variabel manual dengan template yang sama |
| Pekerja | Input tensi harian + grafik riwayat, MCU, komorbid, status kartu per area, simulasi tap, Asisten AI, WhatsApp (log), profil & privasi |
| Rule engine | Deterministik & dapat dijelaskan (bukan LLM), logika tiga-nilai: data tak pasti → `NEEDS_REVIEW`, gabungan aturan = status paling ketat, aturan berversi (JSON) + simulasi dampak + persetujuan dokter |
| Admin | Dashboard kepatuhan, daftar & detail pekerja (penjelasan keputusan), antrian review, verifikasi MCU/komorbid, override (alasan wajib, durasi pendek, konfirmasi risiko, hard stop, dicabut otomatis), aturan, log WA, **pengaturan WhatsApp API**, integrasi & dokumen RAG, audit log (append-only + rantai hash) |
| Kartu akses | Mock Access Control System: hanya menerima izin per area (tanpa data medis), cache saat gangguan, Device API untuk reader |
| Asisten AI | Gemini API + RAG dokumen SOP/FAQ. **Bisa mengobrol natural** (salam, terima kasih, K3 umum) namun **tetap dalam batas**: tolak topik di luar K3, tanpa diagnosis/obat/dosis, tak bisa mengubah akses, deteksi kondisi darurat, sanitizer data pribadi. **Memori percakapan**: tersimpan di database per pengguna, dibuka lagi otomatis saat kembali ke halaman Asisten (riwayat, percakapan baru, hapus); ±10 pesan terakhir (versi tersanitasi) dipakai sebagai konteks AI. Tanpa API key → mode lokal |
| WhatsApp | Satu arah. **Tempat khusus**: Admin → *Pengaturan WhatsApp* (atau `.env`). Mendukung **Meta Cloud API** & **gateway HTTP** (Fonnte/Wablas/Qontak). Kosong/tidak lengkap → **otomatis SIMULASI** |

## Menjalankan di Windows (tanpa Docker)

Prasyarat: Python 3.12+, Node.js 20+, **PostgreSQL 14+** (service PostgreSQL harus berjalan sebelum backend dijalankan).
Tanpa `DATABASE_URL` aplikasi memakai SQLite (hanya untuk uji cepat).

> **Penting:** port **8000 = API backend** (tanpa tampilan; halaman awalnya hanya info). **Aplikasinya dibuka di
> http://localhost:3000**. Keduanya harus berjalan bersamaan di dua terminal.

### Setiap kali menjalankan (setup sudah selesai)

Terminal 1 — backend:
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload
```
Terminal 2 — frontend:
```powershell
cd frontend
npm run dev
```
Lalu buka **http://localhost:3000**. Dokumentasi API: http://localhost:8000/docs.

### Setup pertama kali (cukup sekali per komputer)

Lewati langkah yang sudah pernah dilakukan — mis. jika folder `backend\.venv`, `frontend\node_modules`, dan
`backend\.env` sudah ada, langsung ke bagian *Setiap kali menjalankan*.

```powershell
# 1) Lingkungan Python (hanya jika backend\.venv belum ada)
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 2) File konfigurasi — HANYA jika backend\.env belum ada (copy akan MENIMPA .env yang sudah berisi koneksi database)
if (!(Test-Path .env)) { copy .env.example .env }

# 3) Database PostgreSQL — membuat role & database `hbac` (+ `hbac_test`) lalu menulis DATABASE_URL ke backend\.env.
#    Diminta password superuser `postgres`. Menjalankannya ulang aman: password role `hbac` diganti dan .env ikut diperbarui.
.\.venv\Scripts\python.exe scripts\init_postgres.py

# 4) Dependensi frontend (hanya jika frontend\node_modules belum ada)
cd ..\frontend
npm install
```

Data demo terisi otomatis saat database kosong. Isi ulang data demo dari nol (hentikan backend dulu):
`.\.venv\Scripts\python.exe -m app.seed --reset` dari folder `backend`.

### Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `http://localhost:8000` menampilkan *Not Found* / halaman info | Normal — itu API. Buka **http://localhost:3000**. |
| `python -m venv .venv` gagal *Permission denied* / *WinError 32* | `.venv` sudah ada dan sedang dipakai server yang berjalan. Tidak perlu dibuat ulang. Jika memang ingin membuat ulang: hentikan backend (Ctrl+C), hapus folder `backend\.venv`, lalu ulangi langkah 1. |
| `pip install` gagal *Access is denied* pada file `.pyd`/`.exe` | Ada proses Python yang masih memakai paket (backend berjalan). Hentikan backend lalu ulangi. |
| `error while attempting to bind on address ... 8000` | Port 8000 sudah dipakai backend lain. Hentikan yang lama atau pakai `--port 8001` (lalu set `BACKEND_URL=http://127.0.0.1:8001` sebelum `npm run dev`). |
| Backend gagal start: `connection ... 127.0.0.1, port 5432 failed: Connection refused` | Service PostgreSQL belum berjalan. Buka *Services* Windows → **postgresql-x64-18 → Start**. |
| Backend gagal start: `password authentication failed for user "hbac"` | `.env` tertimpa / password berubah. Jalankan ulang `scripts\init_postgres.py`. |
| Aplikasi menampilkan *Server backend tidak merespons* | Backend (terminal 1) belum berjalan atau berhenti. |
| Perubahan kode backend tidak terlihat | Jalankan uvicorn dengan `--reload`, atau hentikan (Ctrl+C) lalu jalankan ulang. |

## Menjalankan dengan Docker Compose

```bash
docker compose up --build
```
Buka http://localhost:3000. Atur `POSTGRES_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY`, dan `WHATSAPP_*` lewat file `.env` di folder ini.

## Deploy ke VPS (Ubuntu 22.04/24.04, minimal 1 vCPU / 2 GB RAM)

Tidak perlu Docker di komputer lokal — image dibangun di VPS. Dari PowerShell di folder proyek:

```powershell
# 1) Buat paket upload (tanpa .env, data lokal, node_modules, .venv)
powershell -ExecutionPolicy Bypass -File .\deploy\buat-paket.ps1 -Server IP_VPS
# 2) Upload ke VPS (password root dari email/panel penyedia VPS)
scp .\hbac-deploy.tar.gz root@IP_VPS:/root/
# 3) Masuk ke VPS
ssh root@IP_VPS
```

Di VPS (pertama kali **dan** setiap update):

```bash
mkdir -p /root/hbac && tar -xzf /root/hbac-deploy.tar.gz -C /root/hbac && bash /root/hbac/deploy/install.sh
```

`install.sh` memasang swap 2 GB, Docker, firewall (SSH/80/443), membuat `.env.prod` berisi rahasia acak (bertanya: domain,
API key Gemini, mode demo, password situs), build image satu per satu, menjalankan PostgreSQL + backend + frontend + Caddy,
dan menjadwalkan backup harian ke `/root/hbac-backups`. Skrip lain di `deploy/`:

| Skrip | Kegunaan |
|---|---|
| `set-domain.sh hbac.domain.id` | Pakai domain + HTTPS otomatis (A record domain harus sudah ke IP VPS); `--ip` untuk kembali ke IP |
| `site-password.sh` | Kunci seluruh situs dengan username/password (disarankan selama mode demo); `--off` untuk menghapus |
| `backup.sh` | Backup manual database + unggahan MCU (otomatis tiap 02:00, disimpan 7 hari) |

Di server, akun contoh memakai password acak (`DEMO_PASSWORD` di `/root/hbac/.env.prod`), bukan password lokal di bawah.
Opsional: `.github/workflows/deploy.yml` untuk deploy otomatis setiap push ke GitHub (butuh repo git + secrets SSH).

## Akun demo

Mode demo menampilkan tombol login satu klik di halaman login untuk akun contoh hasil seed (admin, kesehatan, keamanan,
pekerja) dan, secara bawaan, akun **pekerja hasil registrasi** (grup "Akun hasil registrasi", tanpa password — halaman
registrasi menampilkan peringatan). Matikan dengan `DEMO_LIST_REGISTERED=false` bila ada yang mendaftar dengan data asli;
akun staf di luar seed tidak pernah bisa dibuka satu klik. Password lokal semua akun demo: `Hbac-Demo-2026` (bisa diganti lewat
`DEMO_PASSWORD` di `.env`). Admin: `admin`. Pekerja: `budi`, `siti`, `andi`, `dewi`, `rizky`,
`fajar`, `wulan`, `teguh`, `rina`, `joko`, `yusuf`, `maya` — masing-masing mewakili skenario (lihat halaman login).

## Alur demo (§9 dokumen perencanaan)

1. Daftar akun baru di **/register** → lengkapi profil (data umum → MCU *isi nanti* → komorbid) — atau login sebagai **budi**.
2. Input tensi (mis. 148/94) → status per area dievaluasi ulang.
3. **Status Kartu**: Panas & Ketinggian `DENIED`, Dingin & Gas/BBM `NEEDS_REVIEW` (ambang simulasi).
4. Notifikasi WhatsApp tercatat (simulasi, atau terkirim bila API diisi).
5. **Simulasi Tap** → `GRANTED` / `TEMPORARY` / `DENIED` dengan alasan non-medis.
6. Admin: dashboard → **Antrian Review** → keputusan review/override dengan alasan → tercatat di audit log.
7. **Asisten AI**: “Kenapa saya tidak bisa masuk area ketinggian?” → status dari sistem + penjelasan dari SOP, tanpa data pribadi ke LLM.
   Tinggalkan halaman lalu kembali — percakapan tetap ada; tanya “tadi saya bertanya apa?”.
8. **MCU Tahunan** → unggah PDF “Kesimpulan Medical Check Up” → periksa/koreksi variabel (patokan & status) → simpan →
   admin memverifikasi di **Antrian Review** (variabel yang diubah pekerja ditandai beserta nilai hasil baca aslinya).

## Konfigurasi penting

- **Gemini**: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.5-flash-lite`) + `GEMINI_FALLBACK_MODELS`. Kuota tier gratis
  berubah-ubah — cek di Google AI Studio. Produksi: tier berbayar/enterprise atau model on-premise.
  Perilaku asisten diatur lewat instruksi sistem, contoh percakapan, dan guardrail di `backend/app/ai/chat.py`
  (tanpa fine-tuning model, yang memerlukan dataset & layanan berbayar).
- **WhatsApp**: prioritas *pengaturan admin* → `.env` → simulasi. Pesan dikirim lewat antrian di latar belakang.
  Meta Cloud API: pesan teks hanya dalam jendela 24 jam — untuk notifikasi satu arah gunakan template yang disetujui.
  Token disimpan di database dan selalu ditampilkan bertopeng; produksi sebaiknya memakai secret manager.
- **Database**: skema dibuat otomatis + migrasi kolom aditif ringan (`app/db_migrate.py`). Produksi: gunakan Alembic.
- **Template MCU**: variabel & patokan di `backend/app/mcu/template.py`, pola pembacaan di `backend/app/mcu/parser.py`.
  Patokan bersifat contoh (mis. BMI Asia-Pasifik, TD < 140/90) — sesuaikan dengan kebijakan dokter perusahaan.
  Berkas unggahan yang tidak jadi disimpan dihapus otomatis setelah 24 jam.

## Pengujian

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```
Jika `TEST_DATABASE_URL` terisi (otomatis oleh `init_postgres.py`), tes berjalan di PostgreSQL database `hbac_test`
(tabel dihapus & dibuat ulang); jika tidak, di SQLite sementara.

## Struktur

```
backend/   FastAPI · SQLAlchemy · rule engine (app/rules) · layanan (app/services) · AI/RAG (app/ai) · dokumen SOP (knowledge/)
frontend/  Next.js 16 · Tailwind 4 · SWR — halaman pekerja, admin, register, lengkapi-profil
docker-compose.yml
```

## Batasan prototipe (lihat §8 dokumen)

Data kesehatan ke Gemini tier gratis (sudah dianonimkan), hanya 2 role (admin merangkap validasi medis), override admin
(dikendalikan), tensi saja bukan penentu final, input tensi manual (tersedia input oleh petugas), aturan masih dummy,
kebijakan fallback saat sistem down perlu ditetapkan IT/K3/medis, registrasi mandiri sebaiknya dicocokkan dengan data HR.
