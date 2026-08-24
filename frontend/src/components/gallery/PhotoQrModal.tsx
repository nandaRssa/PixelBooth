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
        {/* ===== CARD DESIGN SESUAI MOCKUP (COMPACT & BALANCED) ===== */}
        <div className="w-[260px] sm:w-[280px] max-w-full rounded-2xl overflow-hidden shadow-2xl border border-pb-border bg-white mb-3.5 transition-transform hover:scale-[1.01]">
          {/* Header Hitam */}
          <div className="bg-[#141416] px-3 pt-3 pb-2.5 text-center select-none">
            <p className="text-zinc-400 text-[8px] font-bold tracking-[0.3em] uppercase">
              F O T O
            </p>
            <h3 className="text-white text-sm sm:text-base font-black tracking-[0.2em] uppercase leading-tight mt-0.5">
              P I X E L B O O T H
            </h3>
            <p className="text-zinc-400 text-[7px] font-medium tracking-[0.2em] uppercase mt-0.5">
              P H O T O B O O T H
            </p>
          </div>

          {/* Body Putih dengan QR */}
          <div className="px-3 pt-3 pb-2.5 bg-white flex flex-col items-center justify-center">
            <div className="w-full flex items-center justify-center mb-1.5">
              <QRCodeCanvas
                id="photo-qr-canvas"
                value={photoUrl}
                size={240}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
                includeMargin={false}
                className="w-36 h-36 sm:w-40 sm:h-40 aspect-square block"
              />
            </div>

            {/* Garis Pembatas Halus */}
            <div className="w-16 h-[1px] bg-zinc-200 my-1.5" />

            {/* Keterangan Bawah */}
            <p className="text-zinc-600 text-[10px] font-medium leading-tight text-center max-w-[210px]">
              Scan untuk melihat foto Anda
            </p>
            <p className="text-zinc-400 text-[7px] font-bold tracking-[0.2em] uppercase text-center mt-1">
              P I X E L B O O T H
            </p>
          </div>
        </div>

        {/* Tombol Aksi */}
        <div className="w-[260px] sm:w-[280px] max-w-full grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            fullWidth
            size="sm"
            onClick={handleShare}
            leftIcon={<Share2 size={14} />}
          >
            Bagikan
          </Button>
          <Button
            variant="primary"
            fullWidth
            size="sm"
            onClick={handleDownloadQr}
            leftIcon={<Download size={14} />}
          >
            Unduh Desain
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default PhotoQrModal