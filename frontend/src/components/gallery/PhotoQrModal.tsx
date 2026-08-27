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

  const rawQr = (photo as any).qr_link
  const photoUrl = (rawQr && (rawQr.startsWith('http://') || rawQr.startsWith('https://')))
    ? rawQr
    : `${window.location.origin}/photo/${photo.unique_token || (photo as any).token || ''}`

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

        {/* Tombol Aksi: Bagikan & Unduh Desain (Icon-only on Mobile & iPad, Icon+Text on Desktop) */}
        <div className="w-[260px] sm:w-[280px] max-w-full grid grid-cols-2 gap-2.5">
          <button
            type="button"
            title="Bagikan Link Foto"
            aria-label="Bagikan"
            onClick={handleShare}
            className="h-11 w-full rounded-xl bg-pb-surface-hover hover:bg-pb-border text-pb-text border border-pb-border flex items-center justify-center gap-2 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
          >
            <Share2 size={18} className="shrink-0 text-pb-text-secondary" />
            <span className="hidden lg:inline">Bagikan</span>
          </button>

          <button
            type="button"
            title="Unduh QR Code"
            aria-label="Unduh QR"
            onClick={handleDownloadQr}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-[#FF5A36] via-[#FF7836] to-[#FF9836] hover:brightness-105 shadow-md shadow-orange-500/20 text-white flex items-center justify-center gap-2 text-xs font-semibold transition-all active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <Download size={18} className="shrink-0 text-white" />
            <span className="hidden lg:inline">Unduh QR</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default PhotoQrModal