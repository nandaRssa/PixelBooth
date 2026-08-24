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
        {/* ===== CARD DESIGN SESUAI MOCKUP ===== */}
        <div className="w-[280px] sm:w-[300px] max-w-full rounded-2xl overflow-hidden shadow-xl border border-pb-border bg-white mb-4">
          {/* Header Hitam */}
          <div className="bg-[#141416] px-4 py-3.5 text-center select-none">
            <p className="text-zinc-400 text-[10px] font-semibold tracking-[0.3em] uppercase mb-0.5">
              F O T O
            </p>
            <h3 className="text-white text-base font-black tracking-[0.2em] uppercase leading-tight">
              P I X E L B O O T H
            </h3>
            <p className="text-zinc-400 text-[8px] font-medium tracking-[0.2em] uppercase mt-0.5">
              P H O T O B O O T H
            </p>
          </div>

          {/* Body Putih dengan QR */}
          <div className="p-4 sm:p-5 bg-white flex flex-col items-center justify-center">
            <div className="w-full flex items-center justify-center mb-3">
              <QRCodeCanvas
                id="photo-qr-canvas"
                value={photoUrl}
                size={260}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
                includeMargin={false}
                className="w-44 h-44 sm:w-48 sm:h-48 aspect-square max-w-full block"
              />
            </div>

            {/* Garis Pembatas Halus */}
            <div className="w-24 h-[1px] bg-zinc-200 mb-2.5" />

            {/* Keterangan Bawah */}
            <p className="text-zinc-700 text-xs font-medium leading-snug text-center mb-1 max-w-[220px]">
              Scan untuk melihat foto Anda
            </p>
            <p className="text-zinc-400 text-[8px] font-semibold tracking-[0.25em] uppercase text-center">
              P I X E L B O O T H
            </p>
          </div>
        </div>

        {/* Tombol Aksi */}
        <div className="w-[280px] sm:w-[300px] max-w-full flex flex-col gap-2">
          <Button
            variant="primary"
            fullWidth
            onClick={handleDownloadQr}
            leftIcon={<Download size={16} />}
          >
            Unduh Desain QR Card
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