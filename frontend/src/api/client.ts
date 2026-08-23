import axios from 'axios'

// ==========================================
// PIXELBOOTH — Axios API Client
// Fitur login dihapus — semua request tanpa token
// ==========================================

const defaultBaseUrl =
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
    ? 'https://pixel-booth-backend-7xoh69k5n-nanda-raissas-projects.vercel.app/api'
    : '/api'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || defaultBaseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

/**
 * Resolves any relative storage path or relative URL to the full backend storage origin,
 * ensuring all assets use HTTPS to prevent Mixed Content blocking on Vercel.
 */
export function getStorageUrl(path?: string | null): string {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('blob:')) {
    return path
  }

  // Jika sudah merupakan URL lengkap cloud (misal Cloudinary), kembalikan langsung
  if (
    path.startsWith('https://res.cloudinary.com') ||
    path.startsWith('https://') && !path.includes('localhost') && !path.includes('127.0.0.1')
  ) {
    return path
  }

  // Bersihkan prefix host/origin backend jika ada
  let cleanPath = path
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^\/+/, '')

  // Pastikan melewati endpoint proxy /api/storage/
  if (!cleanPath.startsWith('api/storage/') && !cleanPath.startsWith('storage/')) {
    cleanPath = `api/storage/${cleanPath}`
  } else if (cleanPath.startsWith('storage/')) {
    cleanPath = `api/${cleanPath}`
  }

  // Bersihkan duplikasi /api/api/
  cleanPath = cleanPath.replace(/^api\/api\//, 'api/')

  // Di browser:
  if (typeof window !== 'undefined') {
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.local')

    if (isLocal) {
      // Di lokal: gunakan path relatif /api/storage/ (akan di-proxy oleh Vite ke http://localhost:8000)
      return `/${cleanPath}`
    }
  }

  const apiBase = import.meta.env.VITE_API_URL || defaultBaseUrl
  try {
    const origin = new URL(apiBase).origin
    return `${origin}/${cleanPath}`
  } catch {
    return `/${cleanPath}`
  }
}

export default apiClient

