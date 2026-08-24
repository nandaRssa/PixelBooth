import React from 'react'
import { Download, Share2 } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { downloadQrCardPng } from '@/utils/downloadQr'
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
    try {
      await downloadQrCardPng({
        type: 'FOTO',
        canvasId: 'photo-qr-canvas',
        caption: 'Scan untuk melihat foto Anda',
        filename: `QR-Foto-${photo.unique_token.slice(0, 8)}.png`,
      })
      toast.success('Desain QR Card berhasil diunduh.')
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
    <Modal isOpen={isOpen} onClose={onClose} title="QR Code Foto" size="sm">
      <div className="flex flex-col items-center text-center">
        {/* Clean Square QR Box (Sesuai Ukuran Asli QR) */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-pb-border shadow-xl mb-3.5 flex items-center justify-center">
          <QRCodeCanvas
            id="photo-qr-canvas"
            value={photoUrl}
            size={240}
            level="H"
            bgColor="#FFFFFF"
            fgColor="#000000"
            includeMargin={false}
            className="w-40 h-40 sm:w-48 sm:h-48 aspect-square block"
          />
        </div>

        <p className="text-pb-text-secondary text-xs mb-4 max-w-xs leading-relaxed">
          Scan QR ini untuk melihat atau mengunduh foto Anda.
        </p>

        {/* Tombol Aksi */}
        <div className="w-full flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleShare}
            leftIcon={<Share2 size={15} />}
          >
            Bagikan
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleDownloadQr}
            leftIcon={<Download size={15} />}
          >
            Unduh QR
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default PhotoQrModal