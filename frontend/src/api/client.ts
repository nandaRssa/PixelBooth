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

  // 1. Strip localhost / 127.0.0.1 domain from backend responses & force HTTPS
  let cleanPath = path
    .replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?/i, '')
    .replace(/^http:\/\//i, 'https://')

  // 2. Route raw /storage/ through /api/storage/ for guaranteed CORS
  if (!cleanPath.includes('/api/storage/') && !cleanPath.startsWith('api/storage/')) {
    cleanPath = cleanPath.replace(/(^|\/)storage\//i, '$1api/storage/')
  }

  // 3. Deduplicate any duplicate /api/api/
  cleanPath = cleanPath.replace(/\/api\/api\//g, '/api/')

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

