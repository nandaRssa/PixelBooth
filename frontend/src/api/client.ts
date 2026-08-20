import axios from 'axios'

// ==========================================
// PIXELBOOTH — Axios API Client
// ==========================================

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  withCredentials: true,
})

// ===== Request Interceptor =====
// Inject token dari localStorage ke setiap request
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('pixelbooth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ===== Response Interceptor =====
// Handle 401 → redirect ke login
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Hapus token yang tidak valid
      localStorage.removeItem('pixelbooth_token')
      localStorage.removeItem('pixelbooth_user')
      // Redirect ke login jika bukan halaman public
      if (!window.location.pathname.startsWith('/photo/') &&
          !window.location.pathname.startsWith('/folder/')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
