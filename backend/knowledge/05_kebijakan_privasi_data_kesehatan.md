# Kebijakan Privasi Data Kesehatan HBAC (CONTOH SIMULASI)

> Dokumen contoh untuk prototipe HBAC. Ringkasan ini bukan nasihat hukum. Kebijakan final mengikuti ketentuan perusahaan dan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).

## Data yang dikumpulkan

HBAC memproses data berikut: identitas kerja (nama, Employee ID, unit, nomor kartu), hasil tensi harian, hasil MCU tahunan beserta kesimpulan dokter, dan riwayat penyakit penyerta (komorbid). Data kesehatan termasuk data pribadi yang bersifat spesifik menurut UU PDP sehingga memerlukan perlindungan lebih ketat.

## Tujuan pemrosesan

Data kesehatan diproses hanya untuk menilai kelayakan kesehatan pekerja masuk area kerja khusus, demi keselamatan pekerja. Data tidak dipakai untuk tujuan lain seperti penilaian kinerja.

## Siapa yang dapat mengakses

- Pekerja dapat melihat seluruh data kesehatannya sendiri.
- Admin K3 yang berwenang dapat melihat data pekerja untuk monitoring, verifikasi, dan keputusan review. Setiap tindakan admin tercatat di audit log.
- Pada sistem produksi direncanakan ada peran petugas medis tersendiri untuk validasi data MCU dan komorbid.

## Data yang dikirim ke sistem kartu akses

Sistem kartu dan reader hanya menerima status izin per area (diberikan, sementara, atau ditolak), masa berlaku, dan kategori alasan umum. Nilai tensi, diagnosis, dan hasil MCU tidak pernah dikirim ke sistem kartu.

## Data yang dikirim ke chatbot AI

Chatbot memakai layanan AI eksternal (Gemini API tier gratis pada prototipe). Agar risiko privasi minimal, sistem menerapkan sanitizer:

- Yang boleh dikirim: pertanyaan yang sudah dibersihkan dari data pribadi, kategori komorbid generik (misalnya "hipertensi"), dan kategori area yang ditanyakan.
- Yang tidak pernah dikirim: nama, Employee ID, nomor kartu atau telepon, nilai tensi, tanggal, isi dokumen MCU, atau identitas lain.
- Personalisasi berdasarkan kategori komorbid dapat dimatikan oleh pekerja.
- Status akses pribadi dijawab oleh sistem dari database, bukan oleh AI.
- Prompt yang dikirim dicatat dalam bentuk tersanitasi untuk keperluan audit.

Layanan AI tier gratis umumnya memperbolehkan penyedia menggunakan data untuk pengembangan produk. Karena itu, versi produksi direncanakan memakai tier berbayar/enterprise atau model on-premise.

## Notifikasi WhatsApp

Pesan WhatsApp hanya berisi pemberitahuan status akses dan pengingat, tanpa nilai tensi atau diagnosis. Nomor telepon ditampilkan dalam bentuk tersamar pada log sistem.

## Audit log

Setiap input data, evaluasi aturan, perubahan akses, override, aktivasi aturan, dan akses admin ke dokumen MCU dicatat dalam audit log. Audit log bersifat append-only: tidak ada fitur untuk mengubah atau menghapusnya, dan setiap catatan dirangkai dengan hash sehingga perubahan langsung di database dapat terdeteksi.

## Keputusan otomatis dan hak pekerja

HBAC adalah alat bantu keputusan. Kondisi yang tidak pasti diarahkan ke review manusia (NEEDS_REVIEW), dan admin dapat meninjau keputusan dengan alasan tercatat. UU PDP memberi subjek data sejumlah hak, antara lain hak memperoleh informasi tentang pemrosesan data, mengakses dan memperbaiki data, serta mengajukan keberatan atas keputusan yang hanya didasarkan pada pemrosesan otomatis yang berdampak signifikan. Pekerja dapat menghubungi admin K3 atau pejabat pelindungan data perusahaan untuk menggunakan hak tersebut.

## Retensi data (contoh)

Pada prototipe belum ada jadwal penghapusan otomatis. Pada sistem produksi, masa simpan data tensi harian, MCU, dan log perlu ditetapkan bersama tim hukum, K3, dan medis sesuai ketentuan yang berlaku.
