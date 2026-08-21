import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Layout
import { AdminLayout } from '@/components/layout/AdminLayout'

// Admin Pages
import DashboardPage from '@/pages/admin/DashboardPage'
import GalleryPage from '@/pages/admin/GalleryPage'
import PhotoMenuPage from '@/pages/admin/PhotoMenuPage'
import PhotoCapturePage from '@/pages/admin/PhotoCapturePage'
import TemplatesPage from '@/pages/admin/TemplatesPage'
import TemplateFrameEditorPage from '@/pages/admin/TemplateFrameEditorPage'

// Customer Pages
import CustomerPhotoPage from '@/pages/customer/CustomerPhotoPage'
import CustomerFolderPage from '@/pages/customer/CustomerFolderPage'

// Toast System
import { ToastContainer, registerToastHandler } from '@/components/ui/Toast'
import type { ToastItem } from '@/components/ui/Toast'

// ==========================================
// React Query Client
// ==========================================
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 menit
      refetchOnWindowFocus: false,
    },
  },
})

// ==========================================
// Toast Provider
// ==========================================
const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  React.useEffect(() => {
    registerToastHandler((toast) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { ...toast, id }])
    })
  }, [])

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}

// ==========================================
// App Component dengan Routing
// ==========================================
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes — Customer QR Access */}
            <Route path="/photo/:token" element={<CustomerPhotoPage />} />
            <Route path="/folder/:token" element={<CustomerFolderPage />} />

            {/* Admin Routes — tanpa autentikasi (fitur login dihapus) */}
            <Route element={<AdminLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/photo" element={<PhotoMenuPage />} />
              <Route path="/photo/session/:id" element={<PhotoCapturePage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/templates/:id/editor" element={<TemplateFrameEditorPage />} />
              <Route path="/settings" element={
                <div className="text-pb-text">
                  <h1 className="text-2xl font-bold mb-2">Pengaturan</h1>
                  <p className="text-pb-text-muted">Fitur akan tersedia di fase berikutnya.</p>
                </div>
              } />
            </Route>

            {/* Catch all — redirect ke root */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
