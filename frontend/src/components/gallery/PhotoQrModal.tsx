import React from 'react'
import { Download, Share2 } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
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
    try {
      const canvas = document.getElementById('photo-qr-canvas') as HTMLCanvasElement | null
      if (!canvas) {
        toast.error('Gagal mengambil data QR Code.')
        return
      }
      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `qr-photo-${photo.unique_token.slice(0, 8)}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast.success('QR Code berhasil diunduh.')
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
        <div className="w-72 max-w-full rounded-2xl p-5 overflow-hidden border border-pb-border shadow-xl bg-white mb-5 flex items-center justify-center">
          <QRCodeCanvas
            id="photo-qr-canvas"
            value={photoUrl}
            size={280}
            level="H"
            bgColor="#FFFFFF"
            fgColor="#000000"
            includeMargin={true}
            className="w-full h-auto max-w-[240px]"
          />
        </div>

        <p className="text-pb-text-muted text-sm leading-relaxed mb-5 max-w-sm">
          Scan QR ini untuk membuka foto via perangkat customer. Gambar QR yang diunduh sudah
          dilengkapi desain kartu.
        </p>

        <div className="w-full flex flex-col gap-2">
          <Button
            variant="primary"
            fullWidth
            onClick={handleDownloadQr}
            leftIcon={<Download size={16} />}
          >
            Unduh QR
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={handleShare}
            leftIcon={<Share2 size={16} />}
          >
            Bagikan Link
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default PhotoQrModal