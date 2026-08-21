import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { Download, Share2, Image as ImageIcon, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import { customerApi } from '@/api/customer'
import type { CustomerPhoto } from '@/types'

// ==========================================
// Customer Photo Page — akses via QR token
// ==========================================

const CustomerPhotoPage: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [photo, setPhoto] = useState<CustomerPhoto | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    let cancelled = false
    customerApi
      .getPhoto(token)
      .then((data) => {
        if (!cancelled) {
          setPhoto(data)
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

  const handleDownload = () => {
    if (photo?.url) window.open(photo.url, '_blank')
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Foto PixelBooth', url: pageUrl })
      } catch {
        // User membatalkan share
      }
    } else {
      await navigator.clipboard?.writeText(pageUrl)
    }
  }

  // ===== Loading =====
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-pb-bg flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="text-pb-text mx-auto mb-3" />
          <p className="text-pb-text-muted text-sm">Memuat foto...</p>
        </div>
      </div>
    )
  }

  // ===== Error / Not Found =====
  if (status === 'error' || !photo) {
    return (
      <div className="min-h-screen bg-pb-bg flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <ImageIcon size={40} className="text-pb-faint mx-auto mb-4" />
          <h1 className="text-pb-text font-semibold text-lg mb-2">Foto tidak ditemukan</h1>
          <p className="text-pb-text-muted text-sm leading-relaxed mb-6">
            Link mungkin sudah tidak berlaku atau foto telah dihapus.
          </p>
          <Button variant="secondary" size="md" onClick={() => window.history.back()} leftIcon={<ArrowLeft size={16} />}>
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-pb-bg flex flex-col items-center p-4 pt-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <p className="text-pb-text-muted text-xs tracking-wide">PIXELBOOTH</p>
          {photo.folder && (
            <p className="text-pb-text text-sm font-medium mt-1">{photo.folder.name}</p>
          )}
        </div>

        {/* Photo */}
        <div className="bg-pb-surface border border-pb-border rounded-2xl overflow-hidden mb-4">
          <img
            src={photo.url}
            alt="Hasil foto photobooth"
            className="w-full aspect-[3/4] object-cover"
          />
        </div>

        {/* QR Code */}
        <div className="bg-pb-surface border border-pb-border rounded-xl p-4 mb-4 flex items-center gap-4">
          <div className="bg-white p-2 rounded-lg flex-shrink-0">
            <QRCodeSVG value={pageUrl} size={72} fgColor="#0A0A0A" />
          </div>
          <div>
            <p className="text-pb-text text-sm font-medium">Foto Ini</p>
            <p className="text-pb-text-muted text-xs mt-0.5 leading-relaxed">
              Scan QR untuk membagikan foto ini.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 w-full">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleDownload}
            leftIcon={<Download size={18} />}
          >
            Unduh Foto
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={handleShare}
            leftIcon={<Share2 size={18} />}
          >
            Bagikan
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export default CustomerPhotoPage