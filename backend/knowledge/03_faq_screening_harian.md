# FAQ Screening Kesehatan Harian (CONTOH SIMULASI)

> Dokumen contoh untuk prototipe HBAC. Informasi bersifat umum dan bukan nasihat medis.

## Mengapa tensi harus diinput setiap hari?

Kondisi tekanan darah dapat berubah dari hari ke hari karena kurang tidur, kelelahan, stres, atau kondisi kesehatan. Screening harian membantu memastikan pekerja dalam kondisi aman sebelum bekerja di area berisiko seperti ketinggian atau area panas. Tanpa input tensi hari ini, akses ke semua area khusus tidak aktif.

## Kapan saya harus input tensi?

Input tensi sebelum memasuki area khusus pada hari tersebut, idealnya di awal shift. Status hasil screening berlaku sampai pukul 23.59 WIB pada hari yang sama.

## Bagaimana cara mengukur tensi yang benar?

Agar hasil pengukuran akurat, ikuti langkah umum berikut:

1. Hindari kopi, rokok, dan olahraga berat sekitar 30 menit sebelum pengukuran.
2. Duduk tenang selama sekitar 5 menit dengan punggung bersandar dan kedua kaki menapak lantai, tidak disilangkan.
3. Letakkan lengan di atas meja sehingga manset setinggi jantung. Gunakan ukuran manset yang sesuai lengan.
4. Jangan berbicara selama pengukuran.
5. Jika ingin mengulang, beri jeda 1–2 menit.

## Tensi saya tinggi, apa yang harus dilakukan?

Istirahat dan ukur ulang dengan cara yang benar. Jika hasilnya tetap di atas ambang, akses area yang berisiko akan ditolak untuk hari itu. Laporkan ke petugas kesehatan, terutama bila disertai keluhan seperti sakit kepala berat, nyeri dada, sesak napas, atau pandangan kabur. Kondisi tensi sangat tinggi memerlukan penanganan medis segera.

## Bolehkah saya mengukur ulang berkali-kali?

Pengukuran ulang sekali atau dua kali dengan cara yang benar diperbolehkan. Namun, jika hasil pengukuran pada hari yang sama berselisih terlalu jauh (simulasi: sistolik lebih dari 30 mmHg atau diastolik lebih dari 20 mmHg), sistem menandai data tidak konsisten dan semua area khusus menjadi NEEDS_REVIEW. Input tensi juga dibatasi maksimal 6 kali per hari. Memasukkan angka yang tidak sesuai hasil pengukuran adalah pelanggaran K3.

## Apa arti status NEEDS_REVIEW?

NEEDS_REVIEW berarti sistem tidak dapat memutuskan secara otomatis, misalnya karena data MCU belum diverifikasi, MCU kedaluwarsa, ada komorbid yang relevan, atau data tidak konsisten. Selama status NEEDS_REVIEW, akses ke area tersebut ditolak di pintu. Hubungi admin K3 untuk peninjauan. Admin dapat memberi keputusan review sementara dengan alasan yang tercatat.

## MCU saya kedaluwarsa, apa dampaknya?

MCU tahunan berlaku 12 bulan. Jika lebih dari itu, semua area khusus menjadi NEEDS_REVIEW sampai MCU baru diinput dan diverifikasi. Lakukan MCU sesuai jadwal dari perusahaan, lalu input hasilnya di menu MCU Tahunan.

## Mengapa MCU yang saya input berstatus "menunggu verifikasi"?

Data MCU yang diinput sendiri oleh pekerja perlu diverifikasi admin agar tidak terjadi kesalahan input atau manipulasi. Selama belum diverifikasi, area khusus berstatus NEEDS_REVIEW. Pada sistem produksi, verifikasi dilakukan oleh petugas medis.

## Apakah saya wajib melaporkan penyakit penyerta (komorbid)?

Ya. Laporkan komorbid seperti hipertensi, diabetes, asma/PPOK, penyakit jantung, atau epilepsi dengan jujur. Data ini membantu menentukan area yang aman bagi Anda. Klaim "terkontrol" baru dipercaya sistem setelah diverifikasi admin. Data yang sudah diverifikasi hanya dapat diubah oleh admin.

## Siapa yang dapat melihat data kesehatan saya?

Data kesehatan Anda hanya dapat dilihat oleh Anda dan admin K3 yang berwenang. Sistem kartu dan reader di pintu hanya menerima status izin, tanpa data medis. Setiap akses dan perubahan oleh admin tercatat di audit log.

## Apakah chatbot bisa mendiagnosis atau mengubah akses saya?

Tidak. Chatbot hanya menjawab pertanyaan umum berdasarkan dokumen SOP, prosedur, dan FAQ. Chatbot tidak mendiagnosis, tidak memberi saran pengobatan, dan tidak dapat mengubah hak akses. Status akses pribadi Anda ditampilkan langsung oleh sistem dari database.
