// ==========================================
// PIXELBOOTH — TypeScript Type Definitions
// ==========================================

// ===== AUTH =====
export interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'customer'
  created_at: string
  updated_at: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  token: string
  message: string
}

// ===== TEMPLATE =====
export interface FrameConfig {
  id: number
  x: number
  y: number
  width: number
  height: number
  order: number
}

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
  status: 'active' | 'inactive'
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
export type CameraStatus = 'connected' | 'disconnected' | 'error' | 'capturing'

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
