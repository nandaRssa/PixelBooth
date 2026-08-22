import React from 'react'
import { Download, ExternalLink, Share2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { downloadSvgAsPng } from '@/utils/downloadQr'
import { getStorageUrl } from '@/api/client'
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

  const handleDownloadQr = async () => {
    if (!photo.qr_url) return
    try {
      await downloadSvgAsPng(getStorageUrl(photo.qr_url), `qr-${photo.unique_token.slice(0, 8)}.png`)
    } catch {
      toast.error('Gagal mengunduh QR.')
    }
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
    <Modal isOpen={isOpen} onClose={onClose} title="QR Code Foto" size="md">
      <div className="flex flex-col items-center text-center">
        <div className="w-80 max-w-full rounded-2xl p-4 overflow-hidden border border-pb-border shadow-xl bg-white mb-5">
          {photo.qr_url ? (
            <img src={getStorageUrl(photo.qr_url)} alt="QR Code foto" className="w-full h-auto" />
          ) : (
            <div className="w-full h-72 bg-pb-elevated" />
          )}
        </div>

        <p className="text-pb-text-muted text-sm leading-relaxed mb-5 max-w-sm">
          Scan QR ini untuk membuka foto via perangkat customer. Gambar QR yang diunduh sudah
          dilengkapi desain kartu.
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