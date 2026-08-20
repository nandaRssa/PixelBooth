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

export default apiClient
