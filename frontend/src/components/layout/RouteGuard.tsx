import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

// ==========================================
// Protected Route — redirect ke login jika belum auth
// ==========================================

export const ProtectedRoute: React.FC = () => {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

// ==========================================
// Public Route — redirect ke dashboard jika sudah auth
// ==========================================

export const PublicRoute: React.FC = () => {
  const { isAuthenticated } = useAuthStore()

  if (isAuthenticated) {
    return <Navigate to="/gallery" replace />
  }

  return <Outlet />
}
