# SOP K3 Akses Area Khusus (CONTOH SIMULASI)

> Dokumen ini adalah CONTOH untuk prototipe HBAC, bukan SOP resmi perusahaan. Ambang batas dan aturan di dalamnya adalah simulasi dan wajib ditetapkan/divalidasi oleh dokter perusahaan serta pemilik kebijakan K3 sebelum dipakai.

## Tujuan

SOP ini mengatur syarat kesehatan minimum bagi pekerja sebelum memasuki area kerja khusus yang memiliki risiko kesehatan lebih tinggi. Tujuannya mencegah kejadian seperti pingsan, jatuh dari ketinggian, heat stroke, atau gangguan pernapasan di area berisiko. Sistem HBAC adalah alat bantu keputusan (penyaring awal), bukan diagnosis medis dan bukan penentu final kelayakan kerja.

## Kategori area khusus

Terdapat empat kategori area khusus. Akses umum (gerbang, kantor) tidak dibatasi oleh screening kesehatan.

- Wilayah Dingin (COLD): contohnya cold room dan area kriogenik terminal LNG. Risiko utama adalah stres suhu dingin dan beban kardiovaskular. Paparan dingin menyempitkan pembuluh darah sehingga dapat menaikkan tekanan darah dan kerja jantung.
- Area Panas (HOT): contohnya ruang boiler dan area furnace. Risiko utama adalah heat stress, dehidrasi, dan beban kardiovaskular. Lingkungan panas meningkatkan denyut jantung dan kehilangan cairan.
- Ketinggian (HEIGHT): contohnya platform menara distilasi dan scaffolding tangki. Risiko utama adalah pingsan atau pusing yang berujung jatuh. Hipertensi tidak terkontrol, gula darah rendah, kejang, dan vertigo meningkatkan risiko ini.
- Area Terbatas Gas/Uap BBM (RESTRICTED_GAS): contohnya tank farm BBM dan rumah pompa (confined space). Risiko utama adalah beban respirasi, paparan uap hidrokarbon, serta beban pada jantung dan paru, terutama saat memakai alat bantu napas.

## Syarat masuk area khusus

Sebelum masuk area khusus, pekerja wajib memenuhi tiga hal berikut:

1. Screening tensi harian sudah diinput pada hari yang sama. Tanpa input tensi hari ini, semua area khusus berstatus DENIED dan hanya akses umum yang aktif.
2. MCU tahunan berlaku (tidak lebih dari 12 bulan) dan sudah diverifikasi. MCU yang kedaluwarsa atau belum diverifikasi membuat area khusus berstatus NEEDS_REVIEW.
3. Data penyakit penyerta (komorbid) dilaporkan dengan jujur. Komorbid tertentu membuat area yang relevan perlu review oleh petugas.

## Ambang tekanan darah (simulasi)

Ambang berikut adalah contoh simulasi dari dokumen perencanaan:

- Tensi dalam rentang normal, tanpa komorbid relevan, dan MCU berlaku: semua area khusus ALLOWED.
- Tensi tinggi, yaitu sistolik 140 mmHg atau lebih, atau diastolik 90 mmHg atau lebih: area Ketinggian dan Panas DENIED; area Dingin dan Gas/BBM NEEDS_REVIEW. Alasannya, tekanan darah tinggi meningkatkan risiko pusing/pingsan di ketinggian dan beban jantung di lingkungan panas.
- Tensi sangat tinggi, yaitu sistolik 180 mmHg atau lebih, atau diastolik 110 mmHg atau lebih: semua area khusus DENIED dan sistem memberi flag review segera. Pekerja diminta segera menemui petugas kesehatan.

## Pengaruh komorbid (simulasi)

- Penyakit jantung aktif: area Panas, Ketinggian, dan Gas/BBM perlu review.
- Asma atau PPOK: area Gas/BBM perlu review karena uap dan iritan dapat memicu sesak napas.
- Hipertensi atau diabetes yang tidak terkontrol: area Ketinggian dan Panas perlu review.
- Riwayat epilepsi/kejang: area Ketinggian perlu review.
- Restriksi dari dokter pada hasil MCU: area yang direstriksi berstatus RESTRICTED (akses terbatas dengan batas durasi dan pendampingan).
- Kesimpulan MCU tidak fit (UNFIT): semua area khusus DENIED.

## Prinsip default aman

Jika data tidak lengkap, tidak konsisten, atau tidak pasti, sistem tidak pernah memberi status ALLOWED. Status default untuk ketidakpastian adalah NEEDS_REVIEW. Contohnya: MCU belum ada, MCU belum diverifikasi, atau dua pengukuran tensi pada hari yang sama berselisih terlalu jauh. Jika terjadi kesalahan sistem saat evaluasi, semua area khusus otomatis menjadi NEEDS_REVIEW.

## Jika akses ditolak

1. Jangan memaksa masuk atau meminjam kartu rekan kerja. Pelanggaran ini adalah pelanggaran K3.
2. Periksa alasan singkat di menu Status Kartu pada aplikasi.
3. Jika alasannya tensi belum diinput, lakukan pengukuran dengan benar lalu input di aplikasi.
4. Jika alasannya tensi tinggi, istirahat dan laporkan ke petugas kesehatan. Jangan mengulang pengukuran berkali-kali hanya untuk mendapatkan angka lebih rendah.
5. Jika statusnya NEEDS_REVIEW, hubungi admin K3. Admin dapat meninjau dan memberi keputusan review sementara dengan alasan tercatat.

## Siapa yang menetapkan aturan

Aturan kelayakan per area ditetapkan dan disetujui oleh dokter perusahaan bersama pemilik kebijakan K3. Sistem HBAC hanya mengeksekusi versi aturan yang sudah disetujui. Setiap versi aturan tercatat beserta nama penyetuju dan waktu aktivasinya.
