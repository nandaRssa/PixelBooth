// ==========================================
// Camera Manager Utility
// Mengelola deteksi perangkat kamera, penyimpanan preferensi kamera,
// dan pembuatan MediaStream kamera.
// ==========================================

export const SELECTED_CAMERA_STORAGE_KEY = 'pixelbooth_selected_camera_id'

export interface CameraDeviceInfo {
  deviceId: string
  label: string
  groupId: string
}

/**
 * Mengambil deviceId kamera yang tersimpan di localStorage.
 */
export function getSelectedCameraId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(SELECTED_CAMERA_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Menyimpan deviceId kamera yang dipilih ke localStorage.
 */
export function setSelectedCameraId(deviceId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (deviceId) {
      localStorage.setItem(SELECTED_CAMERA_STORAGE_KEY, deviceId)
    } else {
      localStorage.removeItem(SELECTED_CAMERA_STORAGE_KEY)
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Mendapatkan daftar seluruh perangkat kamera (videoinput) yang tersedia.
 */
export async function getAvailableCameraDevices(): Promise<CameraDeviceInfo[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return []
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoInputs = devices.filter((d) => d.kind === 'videoinput')

    return videoInputs.map((device, index) => {
      let label = device.label
      if (!label) {
        label = `Kamera ${index + 1}`
      }
      return {
        deviceId: device.deviceId,
        label,
        groupId: device.groupId,
      }
    })
  } catch (error) {
    console.error('Gagal mengambil daftar kamera:', error)
    return []
  }
}

/**
 * Membuat MediaStream kamera berdasarkan preferensi deviceId.
 * Jika deviceId yang dipilih tidak ditemukan atau gagal, otomatis fallback ke kamera default.
 */
export async function createCameraStream(
  preferredDeviceId?: string | null,
  options?: { width?: number; height?: number; facingMode?: 'user' | 'environment' }
): Promise<{ stream: MediaStream; activeDeviceId: string | null }> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('WebRTC getUserMedia tidak didukung di browser ini.')
  }

  const idealWidth = options?.width ?? 1280
  const idealHeight = options?.height ?? 720

  const targetDeviceId = preferredDeviceId ?? getSelectedCameraId()

  // 1. Coba koneksikan ke preferred/selected deviceId terlebih dahulu
  if (targetDeviceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: targetDeviceId },
          width: { ideal: idealWidth },
          height: { ideal: idealHeight },
        },
        audio: false,
      })

      return { stream, activeDeviceId: targetDeviceId }
    } catch (err) {
      console.warn('Gagal membuka kamera yang dipilih, mencoba fallback ke kamera bawaan...', err)
    }
  }

  // 2. Fallback: Buka default webcam perangkat
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: options?.facingMode ?? 'user',
      width: { ideal: idealWidth },
      height: { ideal: idealHeight },
    },
    audio: false,
  })

  // Dapatkan deviceId aktif dari track yang berhasil berjalan
  const videoTrack = stream.getVideoTracks()[0]
  const activeDeviceId = videoTrack?.getSettings()?.deviceId ?? targetDeviceId ?? null

  return { stream, activeDeviceId }
}
