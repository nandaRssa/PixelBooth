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
  // Upgrade insecure HTTP to HTTPS for cloudflare tunnel & public origins
  let cleanPath = path.replace(/^http:\/\//i, 'https://')
  if (
    cleanPath.startsWith('https://') ||
    cleanPath.startsWith('data:') ||
    cleanPath.startsWith('blob:')
  ) {
    return cleanPath
  }
  const apiBase = import.meta.env.VITE_API_URL || ''
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    try {
      const origin = new URL(apiBase).origin.replace(/^http:\/\//i, 'https://')
      return `${origin}/${cleanPath.replace(/^\/+/, '')}`
    } catch {
      return cleanPath
    }
  }
  return cleanPath
}

export default apiClient

