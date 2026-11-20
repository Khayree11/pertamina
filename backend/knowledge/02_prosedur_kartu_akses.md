# Prosedur Kartu Akses dan Tap (CONTOH SIMULASI)

> Dokumen contoh untuk prototipe HBAC. Bukan prosedur resmi perusahaan.

## Status kelayakan per area

Setiap kartu pekerja memiliki status terpisah untuk empat area khusus: Dingin, Panas, Ketinggian, dan Paparan BBM. Arti setiap status:

- ALLOWED (Diizinkan): pekerja memenuhi syarat untuk area tersebut.
- RESTRICTED (Terbatas): pekerja boleh masuk dengan pembatasan, misalnya durasi maksimal per entri dan wajib didampingi, sesuai restriksi dokter.
- NEEDS_REVIEW (Perlu Review): sistem tidak dapat memutuskan secara otomatis sehingga perlu ditinjau petugas. Selama belum ditinjau, akses ke area tersebut ditolak di pintu.
- DENIED (Ditolak): pekerja tidak memenuhi syarat untuk area tersebut hari ini.

Jika beberapa aturan berlaku sekaligus, sistem selalu memakai status yang paling ketat. Urutannya dari paling ketat: DENIED, NEEDS_REVIEW, RESTRICTED, ALLOWED.

## Hasil tap kartu di pintu

Saat kartu ditempelkan ke reader, sistem kartu memberi salah satu hasil berikut:

- GRANTED: akses diberikan (status ALLOWED dari evaluasi otomatis).
- TEMPORARY: akses sementara. Muncul untuk status RESTRICTED atau untuk akses yang dibuka melalui keputusan admin (override). Hasil TEMPORARY selalu disertai batas waktu, dan untuk RESTRICTED juga batas durasi per entri.
- DENIED: akses ditolak. Reader hanya menampilkan kategori alasan umum, misalnya "belum screening hari ini" atau "menunggu review K3/medis", tanpa detail medis.

Reader dan sistem kartu tidak pernah menerima data medis. Sistem kartu hanya menerima izin per area beserta masa berlakunya.

## Masa berlaku status

Status otomatis berlaku sampai pukul 23.59 WIB pada hari screening. Esok harinya pekerja wajib input tensi kembali. Masa berlaku juga dibatasi oleh tanggal berakhirnya MCU tahunan. Jika MCU berakhir hari ini, status otomatis juga berakhir hari ini.

## Override dan keputusan review oleh admin

Admin K3 dapat mengubah akses per area untuk sementara. Ada dua jenis: override admin dan keputusan review (untuk menyelesaikan status NEEDS_REVIEW). Kontrol keselamatan yang berlaku:

1. Alasan wajib diisi dan tercatat di audit log yang tidak dapat dihapus.
2. Masa berlaku dibuat pendek: bawaan 4 jam, maksimal 12 jam (simulasi).
3. Override yang membuka akses wajib disertai konfirmasi risiko keselamatan.
4. Hard stop: akses tidak dapat dibuka melalui override jika alasannya tensi sangat tinggi atau kesimpulan MCU tidak fit. Kondisi ini harus ditangani tenaga medis.
5. Jika kondisi pekerja memburuk setelah override dibuat, misalnya input tensi baru yang lebih tinggi, override yang membuka akses dicabut otomatis dan petugas K3 diberi tahu.
6. Status yang berasal dari override selalu ditandai jelas di aplikasi dan di hasil tap (TEMPORARY).

Ketika masa berlaku override habis, status kartu kembali mengikuti evaluasi otomatis.

## Notifikasi WhatsApp

Pekerja menerima notifikasi WhatsApp satu arah ketika status kartu berubah, ketika belum input tensi hari ini, atau ketika ada perubahan akses oleh admin. Pesan WhatsApp tidak memuat nilai tensi atau diagnosis. Pada prototipe, notifikasi masih berupa simulasi yang tercatat di sistem.

## Jika sistem sedang gangguan

Reader memakai salinan izin terakhir yang sudah tersinkron selama masa berlakunya masih aktif. Setelah masa berlaku habis, akses area khusus ditolak dan pekerja diarahkan ke verifikasi manual oleh petugas. Sistem tidak pernah otomatis "membuka semua" saat terjadi gangguan. Kebijakan final penanganan gangguan ditetapkan oleh IT, K3, dan tim medis.

## Larangan

- Dilarang meminjamkan atau meminjam kartu akses.
- Dilarang mengikuti rekan masuk tanpa tap (tailgating) ke area khusus.
- Dilarang memasukkan data tensi yang tidak sesuai hasil pengukuran sebenarnya.
