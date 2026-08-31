import React, { useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Layout — loaded eagerly (needed immediately)
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import { RetroParticles } from '@/components/particles/RetroParticles'

// Toast System
import { ToastContainer, registerToastHandler } from '@/components/ui/Toast'
import type { ToastItem } from '@/components/ui/Toast'

// ==========================================
// Lazy-loaded Pages — each loads only when visited
// This dramatically reduces initial bundle size and JS parse time
// ==========================================
const DashboardPage            = lazy(() => import('@/pages/admin/DashboardPage'))
const GalleryPage              = lazy(() => import('@/pages/admin/GalleryPage'))
const PhotoMenuPage            = lazy(() => import('@/pages/admin/PhotoMenuPage'))
const PhotoCapturePage         = lazy(() => import('@/pages/admin/PhotoCapturePage'))
const TemplatesPage            = lazy(() => import('@/pages/admin/TemplatesPage'))
const TemplateFrameEditorPage  = lazy(() => import('@/pages/admin/TemplateFrameEditorPage'))
const SettingsPage             = lazy(() => import('@/pages/admin/SettingsPage'))
const FullscreenSessionPage    = lazy(() => import('@/pages/admin/FullscreenSessionPage'))
const CustomerPhotoPage        = lazy(() => import('@/pages/customer/CustomerPhotoPage'))
const CustomerFolderPage       = lazy(() => import('@/pages/customer/CustomerFolderPage'))

// Prefetch admin routes in the background during idle time so page clicks are instantaneous
if (typeof window !== 'undefined') {
  const prefetchPages = () => {
    import('@/pages/admin/DashboardPage')
    import('@/pages/admin/GalleryPage')
    import('@/pages/admin/PhotoMenuPage')
    import('@/pages/admin/PhotoCapturePage')
    import('@/pages/admin/TemplatesPage')
    import('@/pages/admin/SettingsPage')
  }
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(prefetchPages)
  } else {
    setTimeout(prefetchPages, 800)
  }
}

// ==========================================
// Page Loading Fallback — Sleek, minimal, non-intrusive
// ==========================================
const PageLoader: React.FC = () => (
  <div className="w-full flex-1 min-h-[60vh] flex items-center justify-center p-8">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-[3px] border-[#FF5E00] border-t-transparent rounded-full animate-spin" />
      <span className="font-pixel text-[var(--pb-text-muted)] text-[10px] tracking-widest uppercase animate-pulse">
        Memuat...
      </span>
    </div>
  </div>
)

// ==========================================
// React Query Client — optimized stale/cache times
// ==========================================
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,       // 5 menit — data dianggap segar
      gcTime: 1000 * 60 * 30,          // 30 menit — data tetap di cache
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
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
        <RetroParticles />
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes — Customer QR Access */}
              <Route path="/photo/:token" element={<CustomerPhotoPage />} />
              <Route path="/folder/:token" element={<CustomerFolderPage />} />

              {/* Admin Routes — tanpa autentikasi */}
              <Route element={<AdminLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/photo" element={<PhotoMenuPage />} />
                <Route path="/photo/session/:id" element={<PhotoCapturePage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/templates/:id/editor" element={<TemplateFrameEditorPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              {/* Fullscreen Session — tanpa AdminLayout */}
              <Route path="/photo/session-fs/:id" element={<FullscreenSessionPage />} />

              {/* Catch all — redirect ke root */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
