import React from 'react'
import { Download, Folder as FolderIcon, Share2 } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { downloadQrCardPng } from '@/utils/downloadQr'
import type { Folder } from '@/types'

// ==========================================
// Folder QR Modal — tampilkan, unduh, dan bagikan QR folder
// ==========================================

interface FolderQrModalProps {
  isOpen: boolean
  onClose: () => void
  folder: Folder | null
}

const FolderQrModal: React.FC<FolderQrModalProps> = ({ isOpen, onClose, folder }) => {
  if (!folder) return null

  const folderUrl = `${window.location.origin}/folder/${folder.unique_token}`

  const handleDownloadQr = async () => {
    try {
      await downloadQrCardPng({
        type: 'FOLDER',
        canvasId: 'folder-qr-canvas',
        caption: 'Scan untuk melihat galeri folder Anda',
        filename: `QR-Folder-${folder.name.replace(/[^A-Za-z0-9]/g, '_')}.png`,
      })
      toast.success('Desain QR Card berhasil diunduh.')
    } catch {
      toast.error('Gagal mengunduh QR.')
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Galeri ${folder.name}`, url: folderUrl })
      } catch {
        // User membatalkan share
      }
    } else {
      await navigator.clipboard?.writeText(folderUrl)
      toast.success('Link folder disalin ke clipboard.')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="QR Code Folder" size="sm">
      <div className="flex flex-col items-center text-center">
        {/* Nama Folder Pill */}
        <div className="inline-flex items-center gap-1.5 text-pb-text text-xs font-semibold px-3 py-1 rounded-full bg-pb-elevated border border-pb-border mb-3 max-w-full">
          <FolderIcon size={13} className="text-[#FF5A36] shrink-0" />
          <span className="truncate max-w-[190px] sm:max-w-[230px]">{folder.name}</span>
        </div>

        {/* ===== CARD DESIGN SESUAI MOCKUP (COMPACT & BALANCED) ===== */}
        <div className="w-[260px] sm:w-[280px] max-w-full rounded-2xl overflow-hidden shadow-2xl border border-pb-border bg-white mb-3.5 transition-transform hover:scale-[1.01]">
          {/* Header Hitam */}
          <div className="bg-[#141416] px-3 pt-3 pb-2.5 text-center select-none">
            <p className="text-zinc-400 text-[8px] font-bold tracking-[0.3em] uppercase">
              F O L D E R
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
                id="folder-qr-canvas"
                value={folderUrl}
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
              Scan untuk melihat galeri folder Anda
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
            title="Bagikan Link Folder"
            onClick={handleShare}
            className="h-10 sm:h-11 w-full rounded-xl bg-pb-surface-hover hover:bg-pb-border text-pb-text border border-pb-border flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <Share2 size={16} className="shrink-0 text-pb-text-secondary" />
            <span className="hidden md:inline">Bagikan</span>
          </button>

          <button
            type="button"
            title="Unduh Desain Kartu QR"
            onClick={handleDownloadQr}
            className="h-10 sm:h-11 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <Download size={16} className="shrink-0" />
            <span className="hidden md:inline">Unduh Desain</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default FolderQrModal