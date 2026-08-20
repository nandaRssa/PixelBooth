# 📊 Rekapitulasi Spesifikasi Teknologi, Hardware & Panduan Kontrol PixelBooth

Dokumen ini berisi rincian teknis mengenai bahasa pemrograman, framework, kebutuhan sistem, integrasi perangkat keras (hardware), serta panduan fungsi masing-masing kontrol/tombol dalam aplikasi **PixelBooth**.

---

## 1. 🛠️ Bahasa Pemrograman & Technology Stack

| Komponen | Bahasa / Framework / Library | Versi | Fungsi & Peran dalam Sistem |
| :--- | :--- | :--- | :--- |
| **Frontend Language** | **TypeScript** | 5.7+ | Bahasa pemrograman utama frontend dengan pengetikan ketat (*type safety*). |
| **Frontend Framework** | **React** (Vite Engine) | 18.3 / Vite 6 | Framework SPA untuk tampilan antarmuka yang cepat, reaktif, dan modular. |
| **Styling Engine** | **Tailwind CSS v4** + Custom CSS | 4.0 | Utilitas styling dengan variabel tema HSL, Sunset Ember Gradient, & micro-animation. |
| **Animation Library** | **Framer Motion** | 12.0+ | Transisi modal, animasi memantul (*spring physics*), dan gesture interaktif. |
| **Backend Language** | **PHP** | 8.2+ | Bahasa pemrograman server-side untuk pemrosesan logika REST API. |
| **Backend Framework** | **Laravel** | 11.x | Framework backend utama (Routing, API Controller, DB Migrations, Queue Jobs). |
| **Database** | **MySQL / SQLite / PostgreSQL** | Latest | Penyimpanan data master folder, foto, sesi photobooth, dan JSON konfigurasi frame. |
| **Image Processing Engine**| **Intervention Image** | 3.x | Engine manipulasi gambar server untuk pemotongan, penggabungan, & overlay frame. |
| **Hardware Bridge** | **Python** (Flask + gphoto2) | 3.10+ | Layanan bridge lokal untuk menghubungkan kamera DSLR USB ke Laravel API. |
| **QR Code Generator** | **qrcode.react** (FE) / **Simple-QRCode** (BE) | Latest | Generator QR Code berbasis Vektor SVG untuk tautan unduh customer. |

---

## 2. 🎛️ Panduan Fungsi Kontrol & Tombol Antarmuka

### A. 📱 Halaman Menu Photo (`/photo`)
- **Kartu Template:** Memilih bingkai foto dan otomatis membuat sesi pemotretan baru tanpa perlu tombol konfirmasi tambahan.
- **Dropdown Folder Tujuan:** Menentukan folder penyimpanan tempat seluruh foto hasil pemotretan akan tersimpan secara otomatis.

### B. 📸 Halaman Sesi Pemotretan (`/photo/session/:id` & `/photo/session-fs/:id`)
- **Tombol Potret / Shutter Kamera:** Memulai hitung mundur 3-2-1 dan memotret foto. (Dapat dipicu via Remote Bluetooth / `Space` / `Enter` / `AudioVolumeUp`).
- **Panel "Ulangi Foto" (Retake Frame #X):** Mengulang pemotretan pada bingkai tertentu yang kurang pas tanpa perlu mengulang pemotretan dari awal.
- **Tombol Keluar (`[X]`):** Membatalkan sesi foto dan kembali ke menu utama.

### C. 🖼️ Halaman Galeri (`/gallery`)
- **Tombol "Buat Folder":** Membuat folder baru atau sub-folder turunan.
- **Tombol "Segarkan" (`Refresh`):** Memuat ulang daftar folder dan foto dari server secara langsung.
- **Kartu Sub-Folder:**
  - **Ikon QR Code (Cyan):** Membuka QR Code khusus seluruh album folder tersebut untuk discan oleh pelanggan.
  - **Ikon Pensil / Edit (Secondary):** Mengubah nama (*rename*) folder.
  - **Ikon Tempat Sampah / Hapus (Merah):** Menghapus folder beserta isinya.
- **Kartu Foto:**
  - **Tombol "Lihat" (Mata Cyan):** Membuka foto dalam modal preview resolusi penuh.
  - **Tombol "Pindah" (Folder Amber):** Memindahkan foto ke folder lain.
  - **Tombol "Hapus" (Trash Merah):** Menghapus file foto.
- **Mode Seleksi Banyak (Bulk Action Bar):**
  - **Tombol "Pilih Semua":** Menandai seluruh foto di layar.
  - **Tombol "Batalkan":** Keluar dari mode centang foto.
  - **Tombol "Pindahkan Terpilih":** Memindahkan beberapa foto sekaligus.
  - **Tombol "Hapus Terpilih":** Menghapus beberapa foto sekaligus.

### D. 🎨 Halaman Kelola Template (`/templates`)
- **Tombol "Upload Template":** Mengunggah file bingkai baru buatan Canva/Photoshop (PNG transparan / JPG).
- **Ikon Sliders / Edit Frame:** Membuka visual editor untuk mengatur koordinat slot foto.
- **Ikon Hapus Template (Merah):** Menghapus bingkai template dari sistem.

### E. ⚙️ Halaman Template Frame Editor (`/templates/editor/:id`)
- **Tombol Mode "Manual":** Bebas menggeser dan mengubah ukuran slot bingkai foto dengan drag & drop.
- **Tombol Mode "Auto Render":** Pendeteksi rasio otomatis yang menyesuaikan posisi slot foto secara presisi.
- **Tombol "Test Camera":** Menyalakan preview kamera langsung di atas kanvas editor.

### F. ⚙️ Halaman Pengaturan (`/settings`)
- **Display Mode:**
  - **Default Mode:** Tampilan standar dengan sidebar navigasi.
  - **Fullscreen Mode:** Menghilangkan sidebar/navbar agar aplikasi menjadi layar penuh minimalis (sangat disarankan untuk Kios iPad operasional acara).

---

## 3. 🔌 Integrasi Perangkat & Konektivitas Hardware

1. **Kamera DSLR (Canon / Nikon / Sony):**
   - Dihubungkan via kabel USB ke PC host, dikontrol oleh service `hardware-bridge` (Python) untuk memotret fisik resolusi tertinggi.
2. **Kamera Internal / Webcam (iPad / Tablet / Laptop):**
   - Digunakan sebagai *Live Preview* real-time di layar sentuh iPad.
3. **Remote Shutter Bluetooth (*Hands-Free Trigger*):**
   - Mendengarkan tombol `Space`, `Enter`, `AudioVolumeUp` (Tombol Volume +), dan `PageDown` pada remote Bluetooth selfie stick / presenter slide.
4. **iPad & Tablet:**
   - Dikembangkan dengan mode Fullscreen PWA tanpa navbar/footer browser.
5. **Cloud Storage (Cloudflare R2 / AWS S3):**
   - 10 GB Storage Gratis per bulan & **0 Rupiah biaya Egress/Bandwidth** saat customer scan QR Code foto.

---

*Dokumentasi Resmi PixelBooth v1.0.0 — Photobooth Professional System*
