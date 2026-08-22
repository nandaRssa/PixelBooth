import axios from 'axios'

// ==========================================
// PIXELBOOTH — Axios API Client
// Fitur login dihapus — semua request tanpa token
// ==========================================

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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

  // Strip localhost / 127.0.0.1 domain from backend responses
  let cleanPath = path
    .replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?/i, '')
    .replace(/^http:\/\//i, 'https://')

  // Convert raw /storage/ to /api/storage/ so CORS headers are always sent by Laravel
  cleanPath = cleanPath.replace(/(^|\/)storage\//i, '$1api/storage/')

  if (cleanPath.startsWith('https://')) {
    return cleanPath
  }

  const apiBase = import.meta.env.VITE_API_URL || 'https://emphasis-paths-slide-multimedia.trycloudflare.com/api'
  try {
    const origin = new URL(apiBase).origin.replace(/^http:\/\//i, 'https://')
    return `${origin}/${cleanPath.replace(/^\/+/, '')}`
  } catch {
    return cleanPath
  }
}

export default apiClient

