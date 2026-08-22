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
 * Resolves any relative storage path or relative URL to the full backend storage origin.
 */
export function getStorageUrl(path?: string | null): string {
  if (!path) return ''
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path
  }
  const apiBase = import.meta.env.VITE_API_URL || ''
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    try {
      const origin = new URL(apiBase).origin
      return `${origin}/${path.replace(/^\/+/, '')}`
    } catch {
      return path
    }
  }
  return path
}

export default apiClient

