// ==========================================
// PIXELBOOTH — TypeScript Type Definitions
// ==========================================

// ===== TEMPLATE =====

/** Area manual (koordinat lokal frame, px, tidak ikut rotasi) */
export interface ClearArea {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Camera Frame manual — sumber kebenaran posisi kamera.
 * Setiap frame sepenuhnya independen (posisi, ukuran, rotasi, flip,
 * dan konfigurasi clear/masking sendiri).
 */
export interface CameraFrame {
  id: number
  order: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flip_h: boolean
  flip_v: boolean
  /** Hard Clear Zone: % area tengah yang WAJIB di-clear (seed) */
  clear_zone: number
  /** Seberapa jauh connected clearing boleh berkembang (% sisi pendek frame) */
  clear_expansion: number
  /** 0-100 toleransi kemiripan warna connected region */
  region_sensitivity: number
  /** % minimal area pulau clear agar dianggap signifikan */
  min_region_size: number
  /** 0-100 kekuatan proteksi elemen desain di perifer */
  edge_protection: number
  /** Penghalusan tepi mask (px) */
  feather: number
  /** Edge Cleanup: ikis boundary mask (px resolusi kerja, 0-5) — hapus sisa tipis */
  edge_cleanup: number
  /** Confidence hasil auto detection (0-100); null untuk frame manual */
  confidence?: number | null
  /** Area yang dilindungi dari clear (kecuali di Hard Clear Zone) */
  protected_areas: ClearArea[]
  /** Area tambahan yang dipaksa menjadi area kamera */
  remove_areas: ClearArea[]
  /** Seed kuas Remove: seluruh region terhubung dari titik ini dipaksa clear */
  remove_seeds: BrushPoint[]
  /** Seed kuas Protect: seluruh region terhubung dari titik ini dilindungi */
  protect_seeds: BrushPoint[]
  /** Seed kuas Keep/Restore: region terhubung dari titik ini dikembalikan jadi desain */
  keep_seeds: BrushPoint[]
}

/** Titik seed kuas brush — pemicu region terhubung, bukan batas akhir.
 *  s = nomor urut strok (untuk resolusi Remove vs Keep: strok terakhir menang). */
export interface BrushPoint {
  x: number
  y: number
  s?: number
}

/** Alias kompatibilitas untuk konfigurasi tersimpan di template */
export type FrameConfig = CameraFrame

export interface Template {
  id: number
  name: string
  slug: string
  template_file: string
  preview_file: string | null
  canvas_width: number
  canvas_height: number
  frame_count: number
  frame_configuration: FrameConfig[] | null
  status: 'draft' | 'active' | 'inactive'
  template_url: string | null
  preview_url: string | null
  created_at: string
  updated_at: string
}

// ===== FOLDER =====
export interface Folder {
  id: number
  name: string
  parent_folder_id: number | null
  unique_token: string
  qr_path: string | null
  qr_url: string | null
  google_drive_id: string | null
  photo_count?: number
  children?: Folder[]
  created_at: string
  updated_at: string
}

// ===== PHOTO =====
export interface Photo {
  id: number
  session_id: number | null
  folder_id: number | null
  filename: string
  storage_path: string
  thumbnail_path: string | null
  unique_token: string
  qr_path: string | null
  qr_url: string | null
  is_final: boolean
  is_temporary: boolean
  google_drive_id: string | null
  google_drive_synced_at: string | null
  file_size: number
  mime_type: string
  url: string
  thumbnail_url: string | null
  folder?: Folder
  created_at: string
  updated_at: string
}

// ===== PHOTO SESSION =====
export type SessionStatus = 'active' | 'complete' | 'cancelled'
export type CaptureStatus = 'captured' | 'approved' | 'retaken'

export interface SessionCapture {
  id: number
  session_id: number
  frame_number: number
  photo_path: string
  photo_url: string
  status: CaptureStatus
  captured_at: string
}

export interface PhotoSession {
  id: number
  template_id: number
  folder_id: number | null
  status: SessionStatus
  current_frame: number
  total_frames: number
  session_token: string
  template?: Template
  folder?: Folder
  captures?: SessionCapture[]
  final_photo?: Photo
  created_at: string
  completed_at: string | null
  updated_at: string
}

// ===== QR CODE =====
export interface QrCode {
  url: string
  token: string
  qr_path: string
  qr_url: string
}

// ===== CUSTOMER / PUBLIC =====
export interface CustomerPhoto {
  id: string
  url: string
  thumbnail_url: string | null
  qr_url: string | null
  folder: { name: string; token: string } | null
  created_at: string
}

export interface CustomerFolderPhoto {
  token: string
  url: string
  thumbnail_url: string | null
  qr_url: string | null
  created_at: string
}

export interface CustomerFolder {
  id: string
  name: string
  qr_url: string | null
  photo_count: number
  photos: CustomerFolderPhoto[]
}

// ===== HARDWARE =====
export type CameraStatus = 'connected' | 'disconnected' | 'error' | 'capturing' | 'checking'

export interface HardwareStatus {
  camera: CameraStatus
  camera_model: string | null
  battery_level: number | null
  bluetooth_connected: boolean
  bridge_online: boolean
}

// ===== GOOGLE DRIVE =====
export interface DriveStatus {
  connected: boolean
  email: string | null
  quota_used: number | null
  quota_total: number | null
}

// ===== API RESPONSES =====
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface ApiError {
  message: string
  errors?: Record<string, string[]>
}

// ===== UI STATE =====
export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

export type ModalState = {
  isOpen: boolean
  title?: string
  content?: string
}
