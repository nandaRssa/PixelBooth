<p align="center">
  <img src="frontend/public/favicon.svg" alt="PixelBooth Logo" width="100" />
</p>

<h1 align="center">PixelBooth Sistem Photobooth Profesional Berbasis Web</h1>

<p align="center">
  <strong>Platform Photobooth Modern, Interaktif, dan Terintegrasi Hardware</strong><br/>
  React 18 · TypeScript · Tailwind CSS v4 · Laravel 11 · MySQL / SQLite / PostgreSQL · Hardware Bridge (DSLR & Bluetooth)
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" />
  <img src="https://img.shields.io/badge/Vite-6.1-646CFF?logo=vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-4.0-06B6D4?logo=tailwindcss" />
  <img src="https://img.shields.io/badge/Laravel-11.x-FF2D20?logo=laravel" />
  <img src="https://img.shields.io/badge/Python_Bridge-3.10+-3776AB?logo=python" />
</p>

---

## 📋 Daftar Isi

- [Ringkasan & Gambaran Umum](#-ringkasan--gambaran-umum)
- [Capaian & Fitur Utama](#-capaian--fitur-utama)
- [Panduan Fungsi Kontrol & Tombol Aplikasi](#-panduan-fungsi-kontrol--tombol-aplikasi)
- [Bahasa & Stack Teknologi](#-bahasa--stack-teknologi)
- [Integrasi & Konektivitas Perangkat (Hardware)](#-integrasi--konektivitas-perangkat-hardware)
- [Arsitektur Sistem & Alur Kerja](#-arsitektur-sistem--alur-kerja)
- [Struktur Proyek](#-struktur-proyek)
- [Panduan Instalasi & Jalankan Sistem](#-panduan-instalasi--jalankan-sistem)
- [Panduan Penggunaan iPad & Remote Bluetooth](#-panduan-penggunaan-ipad--remote-bluetooth)
- [Cloud Hosting & Storage Gratisan](#-cloud-hosting--storage-gratisan)
- [Lisensi & Pengembang](#-lisensi--pengembang)

---

## 🌟 Ringkasan & Gambaran Umum

**PixelBooth** adalah aplikasi photobooth profesional berbasis web (_Web-Based Photobooth Kiosk System_) yang dirancang khusus untuk dioperasikan melalui **iPad, Tablet, Touchscreen Monitor, maupun Desktop/PC**.

Sistem ini menggabungkan kemudahan antarmuka modern (dengan dukungan **Mode Default** dan **Mode Fullscreen Minimalis**), rendering frame gambar resolusi tinggi otomatis, manajemen galeri berbasis QR Code, serta integrasi hardware langsung ke kamera DSLR dan remote shutter Bluetooth.

---

## 🚀 Capaian & Fitur Utama

### 1. 📸 Photobooth Session Engine

- **Mulai Sesi Otomatis:** Klik template dari layar menu langsung membuat sesi dan membuka ruang kamera tanpa tombol berbelit-belit.
- **Dua Mode Display:**
  - **Default Mode:** Antarmuka lengkap dengan sidebar navigasi dan panel samping.
  - **Fullscreen Mode (Minimalis Kios iPad):** Tampilan layar penuh tanpa navbar/footer, terfokus pada Live Preview kamera, frame template, dan kontrol tombol yang ramah sentuhan.
- **Sesi Foto Multi-Frame & Hitung Mundur:** Hitung mundur visual 3-detik otomatis sebelum setiap pemotretan.
- **Ulangi Foto (Retake Per-Frame):** Fitur retake frame foto individual baik saat pertengahan sesi pemotretan maupun setelah pemotretan selesai.
- **Auto Render Canvas Engine:** Menggabungkan foto-foto dari kamera dengan overlay frame PNG resolusi tinggi secara otomatis.

### 2. 🔌 Integrasi Hardware & Kamera

- **DSLR Integration via Hardware Bridge:** Terkoneksi dengan kamera DSLR (Canon EOS / Nikon / Sony) via kabel USB melalui Flask/Python Bridge service (`http://localhost:5000`).
- **Webcam Fallback:** Menggunakan kamera internal laptop/iPad untuk _Live Preview_ real-time.
- **Bluetooth Remote Shutter Support:** Bebas jepret foto menggunakan tombol remote Bluetooth selfie stick / presenter slide (`Space`, `Enter`, `Volume Up`, `PageDown`).

### 3. 🖼️ Galeri & Folder Management

- **Hierarki Folder & Sub-Folder:** Pengorganisasian foto berbasis folder layaknya file manager desktop.
- **Manajemen Massal (Bulk Action):** Fitur _Pilih Semua_, _Batalkan_, _Hapus Banyak Foto_, dan _Pindahkan Foto_.
- **Desain Bebas Menimpa (Zero-Collision Layout):** Kartu folder dan kartu foto yang terstruktur rapi untuk resolusi iPad (Portrait & Landscape), Laptop, dan Desktop.

### 4. 📱 QR Code Delivery & Customer Access

- **QR Code Per Foto & Per Folder:** Customer cukup melakukan _scan QR_ menggunakan HP untuk membuka halaman unduh khusus.
- **Public Customer Page:** Halaman responsif untuk mempratinjau, mengunduh foto kualitas tinggi, dan membagikan (_share_) foto ke media sosial.

### 5. 🎨 Frame Template Editor

- **Visual Frame Builder:** Drag, drop, & resize slot bingkai foto di atas kanvas template.
- **Mode Render Manual vs Auto Render:** Fleksibilitas pengaturan rasio dan posisi foto.

### 6. 🎨 Sistem Desain & Tema Berkelas (Sunset Ember & WCAG AAA)

- **Tema Terang & Gelap:** Pengalihan tema seamless dengan warna kontras tinggi (Lulus standar WCAG AAA).
- **Aksen Sunset Ember Gradient (`#FF5A36` -> `#FF9836`):** Tampilan tombol dan aksen yang mewah dengan bayangan berpijar (_glowing orange shadow_).
- **Interactive Micro-Animations:** Animasi memantul (_spring physics_) saat hover pada setiap kartu dan tombol.

---

## 🎛️ Panduan Fungsi Kontrol & Tombol Aplikasi

Berikut adalah penjelasan lengkap mengenai masing-masing tombol dan kontrol antarmuka di PixelBooth:

### 1. 📱 Halaman Menu Photo (`/photo`)

- **Kartu Template:** Diklik langsung untuk memilih bingkai foto dan otomatis memulai sesi pemotretan baru tanpa perlu tombol konfirmasi tambahan.
- **Dropdown Folder Tujuan:** Pilihan folder penyimpan foto hasil akhir. Seluruh foto yang selesai dipotret akan otomatis masuk ke dalam folder yang dipilih.

### 2. 📸 Halaman Sesi Pemotretan (`/photo/session/:id` & `/photo/session-fs/:id`)

- **Tombol Potret (Shutter Kamera / Ikon Kamera):** Menekan tombol ini (atau menekan Remote Bluetooth / `Space` / `Enter`) akan memulai hitung mundur 3-2-1 dan memotret foto pada bingkai aktif.
- **Chip / Panel "Ulangi Foto" (Retake Frame #X):** Tombol yang memungkinkan Anda atau pelanggan mengulang pemotretan pada slot foto tertentu saja (misal: hanya mengulang foto ke-2) tanpa perlu mengulang seluruh sesi dari awal.
- **Tombol Keluar (`[X]` / Kembalikan Sesi):** Membatalkan sesi foto yang sedang berjalan dan kembali ke menu utama.
- **Tombol Test Camera:** Menguji koneksi dan menyalakan/mematikan preview kamera internal.

### 3. 🖼️ Halaman Galeri (`/gallery`)

- **Tombol "Buat Folder":** Membuka dialog modal untuk membuat folder baru atau sub-folder turunan.
- **Tombol "Segarkan" (`RefreshCw`):** Memuat ulang daftar folder dan foto dari server secara langsung.
- **Kartu Folder (Sub-Folder Card):**
  - **Ikon QR Code (Cyan):** Membuka pop-up QR Code khusus seluruh album/folder tersebut untuk discan oleh pelanggan via smartphone.
  - **Ikon Pensil / Edit (Secondary):** Mengubah nama (_rename_) folder.
  - **Ikon Tempat Sampah / Hapus (Merah):** Menghapus folder beserta seluruh foto di dalamnya.
- **Kartu Foto (Photo Card Overlay):**
  - **Tombol "Lihat" (`Eye` Icon Cyan):** Membuka foto dalam modal preview resolusi penuh.
  - **Tombol "Pindah" (`FolderInput` Icon Amber):** Memindahkan foto ke folder tujuan lain.
  - **Tombol "Hapus" (`Trash2` Icon Merah):** Menghapus file foto dari galeri.
- **Baris Kontrol Seleksi Massal (Bulk Selection Mode):**
  - **Tombol "Pilih Semua":** Menandai seluruh foto yang ada di layar sekaligus.
  - **Tombol "Batalkan":** Keluar dari mode centang foto.
  - **Tombol "Pindahkan Terpilih":** Memindahkan semua foto yang dicentang ke folder lain sekaligus.
  - **Tombol "Hapus Terpilih":** Menghapus seluruh foto yang dicentang sekaligus.

### 4. 🎨 Halaman Kelola Template (`/templates`)

- **Tombol "Upload Template":** Mengunggah file desain bingkai baru buatan Canva/Photoshop (format PNG transparan atau JPG).
- **Ikon Sliders / Edit Frame (`SlidersHorizontal`):** Membuka halaman **Template Frame Editor** visual.
- **Ikon Hapus Template (`Trash2` Merah):** Menghapus bingkai template dari sistem.

### 5. 🛠️ Halaman Template Frame Editor (`/templates/editor/:id`)

- **Tombol Mode "Manual":** Mode pengaturan posisi bingkai secara bebas. Anda bisa menggeser, memperbesar, atau memperkecil posisi slot foto dengan drag & drop mouse/sentuhan.
- **Tombol Mode "Auto Render":** Mode pendeteksi otomatis yang menyesuaikan rasio dan koordinat slot bingkai foto secara presisi.
- **Tombol "Tambah Slot Frame":** Menambahkan slot foto baru di atas kanvas template.
- **Tombol "Simpan Konfigurasi":** Menyimpan koordinat JSON slot bingkai ke database.

### 6. ⚙️ Halaman Pengaturan (`/settings`)

- **Pilihan Display Mode:**
  - **Default Mode:** Menampilkan navigasi lengkap dengan sidebar kiri dan header.
  - **Fullscreen Mode:** Menghilangkan seluruh sidebar/navbar agar aplikasi menjadi layar penuh minimalis (sangat disarankan untuk Kios iPad operasional acara).

---

## 💻 Bahasa & Stack Teknologi

| Layer                  | Teknologi & Bahasa                         | Deskripsi / Kegunaan                                    |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------- |
| **Frontend Language**  | **TypeScript 5.7+ / JavaScript**           | Logika antarmuka tipe-aman (_type-safe_)                |
| **Frontend Framework** | **React 18.3 (Vite 6)**                    | Library antarmuka reaktif & kencang                     |
| **Styling & CSS**      | **Tailwind CSS v4 + Vanilla CSS**          | Token desain kustom, variabel CSS, micro-animation      |
| **Animation Engine**   | **Framer Motion 12+**                      | Animasi modal, transisi halaman, & spring hover lift    |
| **Backend Language**   | **PHP 8.2+**                               | Server API RESTful                                      |
| **Backend Framework**  | **Laravel 11.x**                           | Controller, Routing, API Resources, Queue & Jobs        |
| **Database**           | **MySQL / SQLite / PostgreSQL**            | Penyimpanan data folder, foto, template, dan sesi       |
| **Image Processing**   | **Intervention Image v3**                  | Engine pemotong & penggabung foto frame resolusi tinggi |
| **Hardware Service**   | **Python 3.10+ (Flask + gphoto2)**         | Bridge komunikasi USB DSLR ke API Laravel               |
| **QR Engine**          | **qrcode.react (FE) / Simple-QRCode (BE)** | Pembuat QR Code vektorSVG instan                        |

---

## 🔌 Integrasi & Konektivitas Perangkat (Hardware)

Sistem **PixelBooth** dirancang modular sehingga dapat dihubungkan dengan berbagai kombinasi hardware:

```
                          ┌───────────────────────────┐
                          │    iPad / Tablet / PC     │
                          │   (Browser Safari / Chrome) │
                          └─────────────┬─────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           │                            │                            │
 ┌─────────▼──────────┐       ┌─────────▼──────────┐       ┌─────────▼──────────┐
 │ Remote Bluetooth   │       │ Kamera DSLR USB    │       │ Cloud / Storage    │
 │ (Volume/Space/Enter)│      │ (Canon/Nikon/Sony) │       │ (Cloudflare R2 / S3)│
 └────────────────────┘       └─────────┬──────────┘       └────────────────────┘
                                        │
                              ┌─────────▼──────────┐
                              │  Hardware Bridge   │
                              │  (Python gphoto2)  │
                              └────────────────────┘
```

1. **Kamera DSLR (Canon / Nikon / Sony):**
   - Dihubungkan via kabel USB ke PC host.
   - Dikontrol oleh service `hardware-bridge` (Python) untuk pengambilan gambar resolusi fisik tertinggi.
2. **Kamera Internal / Webcam (iPad / Tablet / Laptop):**
   - Digunakan sebagai _Live Preview_ real-time di layar sentuh iPad.
3. **Remote Shutter Bluetooth:**
   - Kompatibel dengan remote selfie stick Bluetooth / Presenter Slide.
   - Menekan tombol remote otomatis memicu hitung mundur foto (_hands-free_).
4. **Printer Thermal / Photo Printer:**
   - Dapat mencetak langsung dari browser menggunakan driver printer standar (AirPrint iPad / Windows Print).
5. **Cloud Storage (Cloudflare R2 / AWS S3 / Google Drive):**
   - Mendukung penyimpanan ribuan foto tanpa membebankan memori iPad.

---

## 🛠️ Panduan Instalasi & Jalankan Sistem

### Prasyarat System

- **PHP** >= 8.2
- **Composer** >= 2.x
- **Node.js** >= 20.x & **npm** >= 10.x
- **MySQL / SQLite / PostgreSQL**
- **Python** >= 3.10 _(opsional untuk integrasi DSLR)_

### 1. Clone Repository

```bash
git clone https://github.com/nandaRssa/PixelBooth.git
cd PixelBooth
```

### 2. Jalankan Backend (Laravel API)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve
# Backend berjalan di http://127.0.0.1:8000
```

### 3. Jalankan Frontend (React + Vite)

```bash
cd ../frontend
npm install
npm run dev
# Frontend berjalan di http://localhost:5173
```

---

## 📱 Panduan Penggunaan iPad & Remote Bluetooth

### Buka Aplikasi di iPad:

1. Pastikan iPad dan Laptop/Server terhubung pada jaringan **Wi-Fi yang sama**.
2. Buka **Safari** di iPad, lalu akses URL IP Lokal (misal: `http://192.168.1.10:5173`).
3. Untuk tampilan penuh tanpa bar browser:
   - Tekan tombol **Share (Bagikan)** di Safari → Pilih **Add to Home Screen (Tambah ke Layar Utama)**.
   - Buka ikon **PixelBooth** dari layar utama iPad.
4. Masuk ke menu **Pengaturan** -> Ubah **Display Mode** ke **Fullscreen**.

### Menggunakan Remote Bluetooth:

1. Hubungkan Remote Bluetooth (_selfie shutter_) ke iPad via Bluetooth Settings.
2. Saat berada di layar sesi pemotretan, tekan tombol remote untuk mulai hitung mundur foto tanpa menyentuh layar!

---

## 🌐 Cloud Hosting & Storage Gratisan (Rekomendasi)

Untuk menjalankan PixelBooth secara online agar dapat diakses dari luar:

1. **Frontend Hosting (100% Gratis):**
   - **Vercel** / **Netlify** / **Cloudflare Pages** (SSL HTTPS Otomatis, CDN super kencang).
2. **Backend API Hosting:**
   - **Render.com** / **Koyeb** / **Fly.io** (Free tier Web Service).
3. **Penyimpanan Foto Cloud:**
   - **Cloudflare R2 (SANGAT DIREKOMENDASIKAN):** 10 GB Storage Gratis per bulan & **0 Rupiah Biaya Bandwidth (No Egress Fee)** saat customer scan QR Code foto!

---

## 📄 Lisensi & Pengembang

Dikembangkan dengan ❤️ oleh **[Nanda Raissa](https://github.com/nandaRssa)** — Sistem Photobooth Profesional Full-Stack.
