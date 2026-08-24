import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { Download, Share2, Image as ImageIcon, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import { customerApi } from '@/api/customer'
import { getStorageUrl } from '@/api/client'
import { downloadFile } from '@/utils/download'
import type { CustomerPhoto } from '@/types'

// ==========================================
// Customer Photo Page — akses via QR token
// ==========================================

const CustomerPhotoPage: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [photo, setPhoto] = useState<CustomerPhoto | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [isDownloading, setIsDownloading] = useState<boolean>(false)

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

  const handleDownload = async () => {
    if (!photo?.url) return
    setIsDownloading(true)
    try {
      await downloadFile(photo.url, photo.filename || `PixelBooth-${token ? token.slice(0, 8) : 'photo'}.jpg`)
    } finally {
      setIsDownloading(false)
    }
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
        <Spinner size="lg" className="text-pb-text" />
      </div>
    )
  }

  // ===== Error / Not Found =====
  if (status === 'error' || !photo) {
    return (
      <div className="min-h-screen bg-pb-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-pb-surface border border-pb-border flex items-center justify-center mb-4 text-pb-text-muted">
          <ImageIcon size={28} />
        </div>
        <h1 className="text-pb-text font-bold text-xl mb-2">Foto Tidak Ditemukan</h1>
        <p className="text-pb-text-muted text-sm max-w-xs mb-6 leading-relaxed">
          Link ini mungkin sudah tidak berlaku atau foto telah dihapus dari galeri.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-pb-bg flex flex-col items-center justify-center p-4 sm:p-6">
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
        <div className="bg-pb-surface border border-pb-border rounded-2xl p-2 sm:p-3 overflow-hidden mb-4 flex items-center justify-center shadow-lg">
          <img
            src={getStorageUrl(photo.url)}
            alt="Hasil foto photobooth"
            className="w-auto max-w-full max-h-[60vh] object-contain rounded-xl block mx-auto shadow-sm"
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