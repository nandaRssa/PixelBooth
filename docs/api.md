# PixelBooth API Documentation

Dokumentasi seluruh endpoint REST API backend PixelBooth (Laravel).

## Base URL

```
http://localhost:8000/api
```

Frontend dev mengakses melalui proxy Vite: `http://localhost:5173/api` → `http://127.0.0.1:8000/api`.

## Autentikasi

Fitur login **dihapus** — seluruh endpoint dapat diakses tanpa autentikasi (dioptimalkan untuk kios iPad operasional).

Semua request tetap harus menyertakan:

```
Accept: application/json
X-Requested-With: XMLHttpRequest
```

### Rate Limiting

| Grup | Batas | Endpoint |
|------|-------|----------|
| `throttle:60,1` | 60 request / menit | `/public/*` dan `/qr/*` |
| `throttle:120,1` | 120 request / menit | Endpoint core (template, folder, foto, sesi, hardware) |

## Format Respons

Sukses (data tunggal):

```json
{
  "data": { ... }
}
```

Sukses (list):

```json
{
  "data": [ ... ]
}
```

Paginated (list foto):

```json
{
  "data": [ ... ],
  "current_page": 1,
  "last_page": 3,
  "per_page": 20,
  "total": 45
}
```

Error:

```json
{
  "message": "The given data was invalid.",
  "errors": { "field": ["Pesan error"] }
}
```

---

## Health Check

### `GET /health`

Status layanan.

```json
{
  "status": "ok",
  "app": "PixelBooth",
  "version": "1.0.0",
  "timestamp": "2026-08-20T12:00:00+00:00"
}
```

---

## Template

### `GET /templates`

List semua template. 

Query params: `status` (`active` | `inactive`).

```json
{
  "data": [
    {
      "id": 1,
      "name": "Classic Strip 3 Frame",
      "slug": "classic-strip-3-frame",
      "template_file": "templates/classic-strip-3-frame-abc123.jpg",
      "preview_file": null,
      "canvas_width": 1080,
      "canvas_height": 1920,
      "frame_count": 3,
      "frame_configuration": [
        { "id": 1, "x": 60, "y": 150, "width": 960, "height": 500, "order": 1 },
        { "id": 2, "x": 60, "y": 700, "width": 960, "height": 500, "order": 2 },
        { "id": 3, "x": 60, "y": 1250, "width": 960, "height": 500, "order": 3 }
      ],
      "status": "active",
      "template_url": "http://localhost:8000/storage/templates/...",
      "preview_url": null,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### `GET /templates/{id}`

Detail satu template. 

### `POST /templates`

Upload template baru.  `multipart/form-data`.

Fields:

| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `name` | string | ✅ | Nama template |
| `template_file` | file | ✅ | JPG/PNG/WebP, maks 20 MB |
| `preview_file` | file | ❌ | Preview, JPG/PNG/WebP, maks 5 MB |
| `canvas_width` | integer | ✅ | Lebar kanvas (min 100) |
| `canvas_height` | integer | ✅ | Tinggi kanvas (min 100) |
| `frame_count` | integer | ✅ | Jumlah frame (1–10) |
| `frame_configuration` | JSON | ❌ | Posisi tiap frame |

Respons `201`:

```json
{ "message": "Template berhasil diunggah.", "data": { ... } }
```

### `PUT /templates/{id}`

Update konfigurasi template. 

Body (semua opsional):

```json
{
  "name": "Classic Strip 3 Frame v2",
  "frame_count": 3,
  "status": "active",
  "frame_configuration": [ ... ]
}
```

`frame_configuration` dapat dikirim sebagai array atau JSON string.

### `DELETE /templates/{id}`

Hapus template beserta file-nya. 

---

## Folder

### `GET /folders`

List folder. 

Query params: `parent_folder_id` (opsional). Jika tidak diberikan, mengembalikan folder root beserta `children`.

```json
{
  "data": [
    {
      "id": 1,
      "name": "Pernikahan Andi & Sari",
      "parent_folder_id": null,
      "unique_token": "uuid-...",
      "qr_path": "qr/folders/uuid-....svg",
      "qr_url": "http://localhost:8000/storage/qr/folders/uuid-....svg",
      "google_drive_id": null,
      "photo_count": 6,
      "children": [],
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### `GET /folders/{id}`

Detail folder. 

### `POST /folders`

Buat folder baru. 

Body:

```json
{
  "name": "Pernikahan Budi & Sari",
  "parent_folder_id": null
}
```

Respons `201`: `{ "message": "Folder berhasil dibuat.", "data": { ... } }`

### `PUT /folders/{id}`

Ubah nama folder. 

Body: `{ "name": "Nama Baru" }`

### `DELETE /folders/{id}`

Hapus folder beserta seluruh sub-folder dan foto di dalamnya (cascade), termasuk file dari storage dan QR code. 

---

## Photo

### `GET /photos`

List foto. **paginated** (default 20/halaman).

Query params: `folder_id`, `page`.

```json
{
  "data": [
    {
      "id": 1,
      "session_id": null,
      "folder_id": 1,
      "filename": "frame-1.jpg",
      "storage_path": "photos/uuid/frame-1.jpg",
      "thumbnail_path": "thumbnails/uuid/frame-1.jpg",
      "unique_token": "uuid-...",
      "qr_path": "qr/photos/uuid-....svg",
      "qr_url": "http://localhost:8000/storage/qr/photos/uuid-....svg",
      "is_final": true,
      "is_temporary": false,
      "google_drive_id": null,
      "google_drive_synced_at": null,
      "file_size": 524288,
      "mime_type": "image/jpeg",
      "url": "http://localhost:8000/storage/photos/uuid/frame-1.jpg",
      "thumbnail_url": "http://localhost:8000/storage/thumbnails/uuid/frame-1.jpg",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "current_page": 1,
  "last_page": 1,
  "per_page": 20,
  "total": 1
}
```

### `GET /photos/{id}`

Detail satu foto. 

### `DELETE /photos/{id}`

Hapus foto beserta file dan QR dari storage. 

### `POST /photos/{id}/move`

Pindahkan foto ke folder lain. `unique_token` tidak berubah. 

Body: `{ "folder_id": 2 }` — kirim `null` untuk memindahkan ke root.

### `POST /photos/bulk-delete`

Hapus banyak foto sekaligus. 

Body:

```json
{ "photo_ids": [1, 2, 3] }
```

### `POST /photos/bulk-move`

Pindahkan banyak foto sekaligus. 

Body:

```json
{ "photo_ids": [1, 2, 3], "folder_id": 2 }
```

---

## Photo Session

### `POST /sessions`

Mulai sesi foto baru. 

Body:

```json
{
  "template_id": 1,
  "folder_id": null
}
```

Respons `201`:

```json
{
  "message": "Sesi foto dimulai.",
  "data": {
    "id": 1,
    "template_id": 1,
    "folder_id": null,
    "status": "active",
    "current_frame": 1,
    "total_frames": 3,
    "session_token": "uuid-...",
    "template": { ... },
    "folder": null
  }
}
```

### `GET /sessions/{id}`

Detail sesi beserta `template`, `folder`, `captures`, dan `final_photo`. 

### `POST /sessions/{id}/capture`

Simpan capture untuk frame aktif. 

Body (`multipart/form-data` atau JSON):

```json
{ "image": "<file jpg/jpeg/png/webp, maks 20MB>" }
```

atau base64:

```json
{ "image_base64": "data:image/jpeg;base64,..." }
```

### `POST /sessions/{id}/next-frame`

Lanjut ke frame berikutnya. 

### `POST /sessions/{id}/complete`

Selesaikan sesi, buat foto final sesuai template, dan generate QR. 

### `POST /sessions/{id}/cancel`

Batalkan sesi dan hapus file sementara. 

### `POST /sessions/{id}/set-folder`

Set folder tujuan untuk sesi. 

Body: `{ "folder_id": 2 }`

---

## Hardware Bridge

### `GET /hardware/status`

Status hardware bridge dan kamera. 

```json
{
  "data": {
    "bridge_online": true,
    "camera": "connected",
    "camera_model": "Canon EOS 700D",
    "battery_level": 82,
    "bluetooth_connected": true
  }
}
```

Jika bridge tidak dapat dihubungi, `bridge_online` bernilai `false` dan `camera` bernilai `disconnected`.

### `POST /hardware/capture`

Trigger capture DSLR via hardware bridge. 

### `GET /hardware/latest-photo`

Ambil foto terbaru dari hardware bridge. 

---

## QR Code (Admin)

### `GET /qr/photo/{token}`

Info QR untuk sebuah foto. Rate limit `60/menit`.

```json
{
  "data": {
    "token": "uuid-...",
    "qr_url": "http://localhost:8000/storage/qr/photos/uuid-....svg",
    "public_url": "http://localhost:5173/photo/uuid-..."
  }
}
```

`public_url` diambil dari `FRONTEND_URL`.

### `GET /qr/folder/{token}`

Info QR untuk sebuah folder. Rate limit `60/menit`.

```json
{
  "data": {
    "token": "uuid-...",
    "qr_url": "http://localhost:8000/storage/qr/folders/uuid-....svg",
    "public_url": "http://localhost:5173/folder/uuid-..."
  }
}
```

---

## Public / Customer

### `GET /public/photo/{token}`

Detail foto untuk halaman customer. Rate limit `60/menit`.

```json
{
  "data": {
    "id": "uuid-...",
    "url": "http://localhost:8000/storage/photos/...",
    "thumbnail_url": "...",
    "qr_url": "...",
    "folder": { "name": "Pernikahan Andi & Sari", "token": "uuid-..." },
    "created_at": "..."
  }
}
```

### `GET /public/folder/{token}`

Detail folder beserta daftar foto untuk halaman customer. Rate limit `60/menit`.

```json
{
  "data": {
    "id": "uuid-...",
    "name": "Pernikahan Andi & Sari",
    "qr_url": "...",
    "photo_count": 6,
    "photos": [
      {
        "token": "uuid-...",
        "url": "...",
        "thumbnail_url": "...",
        "qr_url": "...",
        "created_at": "..."
      }
    ]
  }
}
```

---

## Kode Status

| Kode | Arti |
|------|------|
| 200 | OK |
| 201 | Created |
| 404 | Resource tidak ditemukan |
| 422 | Validasi gagal / aturan bisnis |
| 429 | Rate limit terlampaui |
| 500 | Server error |
| 503 | Hardware bridge tidak tersedia |