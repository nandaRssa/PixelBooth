import React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Download, ExternalLink, Share2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import type { Photo } from '@/types'

// ==========================================
// Photo QR Modal — tampilkan, unduh, dan bagikan QR foto
// ==========================================

interface PhotoQrModalProps {
  isOpen: boolean
  onClose: () => void
  photo: Photo | null
}

const PhotoQrModal: React.FC<PhotoQrModalProps> = ({ isOpen, onClose, photo }) => {
  if (!photo) return null

  const photoUrl = `${window.location.origin}/photo/${photo.unique_token}`

  const handleDownloadQr = () => {
    // SVG QR — unduh sebagai file SVG
    const link = document.createElement('a')
    link.href = photo.qr_url ?? `${window.location.origin}/api/qr/photo/${photo.unique_token}`
    link.download = `qr-${photo.unique_token.slice(0, 8)}.svg`
    link.click()
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Foto PixelBooth', url: photoUrl })
      } catch {
        // User membatalkan share
      }
    } else {
      await navigator.clipboard?.writeText(photoUrl)
      toast.success('Link foto disalin ke clipboard.')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="QR Code Foto" size="sm">
      <div className="flex flex-col items-center text-center">
        <div className="w-32 h-40 rounded-xl overflow-hidden border border-[#2A2A2A] mb-5">
          {photo.thumbnail_url ? (
            <img src={photo.thumbnail_url} alt={photo.filename} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#1A1A1A]" />
          )}
        </div>

        <div className="bg-white p-4 rounded-xl mb-5">
          <QRCodeSVG value={photoUrl} size={180} fgColor="#0A0A0A" />
        </div>

        <p className="text-[#606060] text-xs leading-relaxed mb-5 max-w-xs">
          Scan QR ini untuk membuka foto via perangkat customer.
        </p>

        <div className="w-full flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleDownloadQr}
            leftIcon={<Download size={16} />}
          >
            Unduh QR
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={handleShare}
              leftIcon={<Share2 size={16} />}
            >
              Bagikan
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => window.open(photoUrl, '_blank')}
              leftIcon={<ExternalLink size={16} />}
            >
              Buka Halaman
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default PhotoQrModal