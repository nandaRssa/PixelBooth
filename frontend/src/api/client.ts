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

  const apiBase = import.meta.env.VITE_API_URL || defaultBaseUrl
  try {
    const origin = new URL(apiBase).origin.replace(/^http:\/\//i, 'https://')
    return `${origin}/${cleanPath.replace(/^\/+/, '')}`
  } catch {
    return cleanPath
  }
}

export default apiClient

