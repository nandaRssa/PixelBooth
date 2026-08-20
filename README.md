<p align="center">
  <img src="docs/assets/logo.png" alt="PixelBooth Logo" width="120" />
</p>

<h1 align="center">PixelBooth</h1>

<p align="center">
  <strong>Sistem Photobooth Profesional Berbasis Web</strong><br/>
  React + TypeScript · Laravel · PostgreSQL · Google Drive · DSLR Integration
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" />
  <img src="https://img.shields.io/badge/Laravel-11-FF2D20?logo=laravel" />
  <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?logo=tailwindcss" />
</p>

---

## Daftar Isi

- [Overview](#overview)
- [Fitur Utama](#fitur-utama)
- [Arsitektur Sistem](#arsitektur-sistem)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Instalasi](#instalasi)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Google Drive Configuration](#google-drive-configuration)
- [Hardware Bridge](#hardware-bridge)
- [DSLR Configuration](#dslr-configuration)
- [Bluetooth Remote](#bluetooth-remote)
- [iPad Safari Setup](#ipad-safari-setup)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Overview

**PixelBooth** adalah sistem photobooth profesional berbasis web yang dirancang untuk dioperasikan melalui **iPad Safari** sebagai interface utama. Sistem ini terintegrasi penuh dengan kamera DSLR (Canon EOS 70D), Bluetooth remote shutter, Google Drive untuk backup otomatis, dan manajemen galeri lengkap dengan sistem QR Code.

Project ini dibangun sebagai **portfolio Full-Stack Software Engineering + Hardware Integration** dengan standar produksi yang dapat langsung digunakan secara operasional.

---

## Fitur Utama

### 📸 Photobooth Engine
- Pemilihan template secara interaktif
- Sesi foto multi-frame dengan countdown otomatis
- Preview & retake per frame
- Rendering template otomatis setelah sesi selesai
- Webcam mock untuk development, DSLR untuk produksi

### 🖼️ Gallery & Folder Management
- Manajemen folder layaknya file manager
- Upload, preview, move, delete foto
- Bulk select & bulk actions
- Thumbnail otomatis

### 📱 QR Code System
- QR unik per foto dan per folder
- Customer page yang mobile-friendly
- Download & share langsung dari QR
- Token-based (tidak mengekspos ID database)

### 🎨 Template Engine
- Upload template dari Canva (PNG/JPG)
- Template Editor visual dengan drag & resize frame
- Konfigurasi frame berbasis JSON
- Rendering final foto dengan overlay template

### ☁️ Google Drive Sync
- OAuth2 authentication
- Sinkronisasi otomatis setelah foto disimpan
- Maintain folder structure di Drive
- Retry otomatis jika gagal

### 🔌 Hardware Integration
- Canon EOS 70D via Hardware Bridge (Python + gphoto2)
- Bluetooth remote shutter support
- Real-time camera status di UI
- Fallback ke webcam jika DSLR tidak tersambung

### 🔐 Authentication & Security
- Admin panel dengan Laravel Sanctum
- Customer/public access via QR token
- Rate limiting & file validation
- Secure token untuk semua public links

---

## Arsitektur Sistem

```
                    ┌──────────────────────┐
                    │      iPad Safari     │
                    │  React + TypeScript  │
                    │  Tailwind CSS + Vite │
                    └──────────┬───────────┘
                               │ HTTPS
                    ┌──────────▼───────────┐
                    │    Laravel REST API   │
                    │  Auth · Gallery       │
                    │  Template · Session   │
                    │  QR · Google Drive    │
                    └──┬──────────────┬────┘
                       │              │
              ┌────────▼─┐      ┌─────▼───────┐
              │PostgreSQL│      │ Google Drive │
              └────────┬─┘      └─────────────┘
                       │
              ┌────────▼─────────┐
              │  Hardware Bridge │
              │  Python + gphoto2│
              └───────┬──────────┘
                      │
            ┌─────────┴──────────┐
            │                    │
        Canon EOS 70D      Bluetooth Remote
```

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 18, TypeScript 5, Vite 6, Tailwind CSS 4 |
| State Management | Zustand, TanStack Query |
| Backend | Laravel 11, PHP 8.2 |
| Database | PostgreSQL 17 |
| Auth | Laravel Sanctum |
| Hardware Bridge | Python 3, gphoto2 |
| QR Code | simplesoftwareio/simple-qrcode (BE), qrcode.react (FE) |
| Image Processing | Intervention Image (Laravel) |
| Cloud Sync | Google Drive API v3 |
| Deployment | (TBD — VPS / Docker) |

---

## Struktur Proyek

```
PixelBooth/
├── frontend/          # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/       # Axios API clients
│   │   ├── components/# Reusable components
│   │   ├── pages/     # Route pages
│   │   ├── stores/    # Zustand stores
│   │   ├── hooks/     # Custom hooks
│   │   ├── types/     # TypeScript types
│   │   └── utils/     # Helpers
│   └── ...
├── backend/           # Laravel 11
│   ├── app/
│   │   ├── Http/Controllers/Api/
│   │   ├── Models/
│   │   ├── Services/
│   │   └── Jobs/
│   ├── database/
│   │   ├── migrations/
│   │   └── seeders/
│   └── ...
├── hardware-bridge/   # Python DSLR bridge
│   ├── main.py
│   ├── camera.py
│   ├── bluetooth.py
│   └── requirements.txt
├── docs/              # Dokumentasi
├── .gitignore
└── README.md
```

---

## Instalasi

### Prasyarat

- **PHP** >= 8.2
- **Composer** >= 2.x
- **Node.js** >= 20.x & npm >= 10.x
- **PostgreSQL** >= 15
- **Python** >= 3.10 (untuk hardware bridge)
- **Git**

### 1. Clone Repository

```bash
git clone https://github.com/nandaRssa/PixelBooth.git
cd PixelBooth
```

### 2. Setup Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local dengan URL API yang sesuai
npm run dev
```

### 3. Setup Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
# Edit .env dengan konfigurasi database dan lainnya
php artisan migrate --seed
php artisan storage:link
php artisan serve
```

### 4. Setup Hardware Bridge

```bash
cd hardware-bridge
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

---

## Environment Setup

### Frontend (`.env.local`)

```env
VITE_API_URL=http://localhost:8000/api
VITE_APP_NAME=PixelBooth
VITE_HARDWARE_BRIDGE_URL=http://localhost:5000
```

### Backend (`.env`)

```env
APP_NAME=PixelBooth
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost:8000

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=pixelbooth
DB_USERNAME=postgres
DB_PASSWORD=your_password

HARDWARE_BRIDGE_URL=http://localhost:5000
HARDWARE_BRIDGE_SECRET=your_bridge_secret

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/callback

SANCTUM_STATEFUL_DOMAINS=localhost:5173
SESSION_DOMAIN=localhost
```

---

## Database Setup

```bash
# Buat database
psql -U postgres -c "CREATE DATABASE pixelbooth;"

# Jalankan migrasi
cd backend
php artisan migrate

# Jalankan seeder (membuat admin default)
php artisan db:seed

# Default admin credentials:
# Email: admin@pixelbooth.com
# Password: admin123
```

---

## Google Drive Configuration

1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Buat project baru: `PixelBooth`
3. Enable **Google Drive API**
4. Buat OAuth 2.0 credentials
5. Tambahkan redirect URI: `http://localhost:8000/api/google/callback`
6. Salin `Client ID` dan `Client Secret` ke `.env` backend

---

## Hardware Bridge

Hardware bridge adalah service Python yang berjalan di mesin yang sama dengan DSLR.

### Instalasi Dependencies

```bash
cd hardware-bridge
pip install -r requirements.txt
```

Requirements:
- `flask` — HTTP server
- `gphoto2` — DSLR communication (Linux/Mac)
- `Pillow` — image processing
- `python-dotenv` — env management
- `PyBluez` (optional) — Bluetooth communication

### Menjalankan Bridge

```bash
python main.py
# Bridge berjalan di http://localhost:5000
```

### Endpoint Hardware Bridge

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/status` | Status bridge & kamera |
| GET | `/camera/status` | Status kamera saja |
| POST | `/camera/capture` | Trigger capture |
| GET | `/camera/latest` | Download foto terbaru |
| POST | `/bluetooth/listen` | Mulai listen Bluetooth |

---

## DSLR Configuration

Target kamera: **Canon EOS 70D**

### Koneksi

- USB 3.0 ke komputer/server
- Driver: gphoto2 (Linux/Mac) atau WIA (Windows)
- Mode kamera: **Manual (M)**

### Pengaturan Kamera yang Direkomendasikan

| Setting | Value |
|---------|-------|
| Mode | Manual (M) |
| ISO | 400-800 |
| Aperture | f/4 - f/8 |
| Shutter | 1/125 |
| White Balance | Auto / Daylight |
| Image Format | JPEG Large Fine |
| Auto Focus | One-Shot |

---

## Bluetooth Remote

Bluetooth remote yang kompatibel bekerja sebagai **HID keyboard device**.

Tombol remote biasanya mengirimkan keyboard event (Space, Enter, atau Volume Up/Down).

Frontend akan listen keyboard event untuk trigger countdown.

```javascript
// Event yang di-listen:
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    triggerCountdown();
  }
});
```

---

## iPad Safari Setup

1. Pastikan iPad dan server berada di **jaringan WiFi yang sama**
2. Akses melalui IP lokal: `http://192.168.x.x:5173`
3. Untuk fullscreen: tambahkan ke Home Screen melalui Safari → Share → Add to Home Screen
4. Pastikan permission kamera diizinkan (untuk webcam mode)

---

## API Documentation

Dokumentasi API lengkap tersedia di [`docs/api.md`](docs/api.md)

### Base URL
```
http://localhost:8000/api
```

### Authentication
```
Authorization: Bearer {token}
```

### Endpoint Utama

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| POST | `/auth/login` | ❌ | Login admin |
| POST | `/auth/logout` | ✅ | Logout |
| GET | `/auth/me` | ✅ | Info user aktif |
| GET | `/templates` | ✅ | List template |
| POST | `/templates` | ✅ Admin | Upload template |
| GET | `/folders` | ✅ | List folder |
| POST | `/folders` | ✅ Admin | Buat folder |
| GET | `/photos` | ✅ | List foto |
| POST | `/sessions` | ✅ | Mulai sesi foto |
| POST | `/sessions/{id}/capture` | ✅ | Trigger capture |
| POST | `/sessions/{id}/complete` | ✅ | Selesaikan sesi |
| GET | `/public/photo/{token}` | ❌ | Customer photo page |
| GET | `/public/folder/{token}` | ❌ | Customer folder page |

---

## Troubleshooting

### Kamera tidak terdeteksi
- Pastikan USB tersambung
- Cek `gphoto2 --auto-detect`
- Matikan aplikasi kamera bawaan sistem

### PostgreSQL connection error
- Pastikan service PostgreSQL berjalan
- Cek kredensial di `.env`
- Verifikasi: `psql -U postgres -c "\l"`

### CORS error di frontend
- Pastikan `SANCTUM_STATEFUL_DOMAINS` di `.env` sudah benar
- Cek konfigurasi CORS di `config/cors.php`

### Google Drive upload gagal
- Verifikasi OAuth credentials
- Cek token tidak expired
- Periksa quota Google Drive

---

## Deployment

> Dokumentasi deployment tersedia di [`docs/deployment.md`](docs/deployment.md)

---

## Contributing

Project ini dibangun untuk tujuan portofolio. Jika ingin berkontribusi:

1. Fork repository
2. Buat branch: `git checkout -b feature/nama-fitur`
3. Commit dengan pesan yang jelas
4. Push dan buat Pull Request

---

<p align="center">
  Dibuat dengan ❤️ oleh <a href="https://github.com/nandaRssa">Nanda Raissa</a>
</p>
