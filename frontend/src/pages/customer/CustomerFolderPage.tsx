import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { Download, Share2, FolderOpen, X, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import { customerApi } from '@/api/customer'
import type { CustomerFolder, CustomerFolderPhoto } from '@/types'

// ==========================================
// Customer Folder Page — akses via QR token folder
// ==========================================

const CustomerFolderPage: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [folder, setFolder] = useState<CustomerFolder | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [preview, setPreview] = useState<CustomerFolderPhoto | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    let cancelled = false
    customerApi
      .getFolder(token)
      .then((data) => {
        if (!cancelled) {
          setFolder(data)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Galeri ${folder?.name ?? 'PixelBooth'}`, url: pageUrl })
      } catch {
        // User membatalkan share
      }
    } else {
      await navigator.clipboard?.writeText(pageUrl)
    }
  }

  const handleDownload = (photo: CustomerFolderPhoto) => {
    window.open(photo.url, '_blank')
  }

  // ===== Loading =====
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-pb-bg flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="text-pb-text mx-auto mb-3" />
          <p className="text-pb-text-muted text-sm">Memuat galeri...</p>
        </div>
      </div>
    )
  }

  // ===== Error / Not Found =====
  if (status === 'error' || !folder) {
    return (
      <div className="min-h-screen bg-pb-bg flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <FolderOpen size={40} className="text-pb-faint mx-auto mb-4" />
          <h1 className="text-pb-text font-semibold text-lg mb-2">Galeri tidak ditemukan</h1>
          <p className="text-pb-text-muted text-sm leading-relaxed mb-6">
            Link mungkin sudah tidak berlaku atau folder telah dihapus.
          </p>
          <Button variant="secondary" size="md" onClick={() => window.history.back()}>
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-pb-bg p-4 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-6 pt-4">
          <p className="text-pb-text-muted text-xs tracking-wide mb-2">PIXELBOOTH</p>
          <h1 className="text-pb-text font-bold text-xl truncate">{folder.name}</h1>
          <p className="text-pb-text-muted text-xs mt-1">
            {folder.photo_count} {folder.photo_count === 1 ? 'foto' : 'foto'}
          </p>
        </div>

        {/* QR + Share */}
        <div className="bg-pb-surface border border-pb-border rounded-xl p-4 mb-4 flex items-center gap-4 flex-wrap">
          <div className="bg-white p-2 rounded-lg flex-shrink-0">
            <QRCodeSVG value={pageUrl} size={64} fgColor="#0A0A0A" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <p className="text-pb-text text-sm font-medium">Bagikan Galeri Ini</p>
            <p className="text-pb-text-muted text-xs mt-0.5 leading-relaxed">
              Scan QR atau bagikan link untuk mengakses semua foto.
            </p>
          </div>
          <Button variant="secondary" size="md" onClick={handleShare} leftIcon={<Share2 size={16} />} className="shrink-0">
            Bagikan
          </Button>
        </div>

        {/* Photos Grid */}
        {folder.photos.length === 0 ? (
          <div className="bg-pb-surface border border-pb-border rounded-xl p-8 flex flex-col items-center justify-center">
            <ImageIcon size={40} className="text-pb-faint mb-3" />
            <p className="text-pb-faint text-sm">Belum ada foto di galeri ini</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {folder.photos.map((photo) => (
              <button
                key={photo.token}
                type="button"
                onClick={() => setPreview(photo)}
                className="group relative aspect-square bg-pb-surface border border-pb-border rounded-xl overflow-hidden"
              >
                <img
                  src={photo.thumbnail_url ?? photo.url}
                  alt="Foto galeri"
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* ===== Preview Modal ===== */}
      <AnimatePresence>
        {preview && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 z-50"
              onClick={() => setPreview(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-pb-text text-sm font-medium truncate">{folder.name}</p>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="w-8 h-8 rounded-lg bg-pb-elevated border border-pb-border hover:border-pb-border-strong text-pb-text-secondary hover:text-pb-text flex items-center justify-center transition-colors shrink-0 ml-auto"
                  title="Tutup"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="bg-pb-bg border border-pb-border rounded-xl overflow-hidden flex items-center justify-center">
                <img src={preview.url} alt="Foto galeri" className="max-w-full max-h-[70vh] object-contain" />
              </div>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                className="mt-3"
                onClick={() => handleDownload(preview)}
                leftIcon={<Download size={18} />}
              >
                Unduh Foto
              </Button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default CustomerFolderPage