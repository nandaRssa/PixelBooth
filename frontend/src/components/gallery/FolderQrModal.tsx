import React from 'react'
import { Download, Folder as FolderIcon, Share2 } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { Modal } from '@/components/ui/Modal'
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

  const rawQr = (folder as any).qr_link
  const folderToken = folder.unique_token || (folder as any).share_token || ''
  const folderUrl = (rawQr && (rawQr.startsWith('http://') || rawQr.startsWith('https://')))
    ? rawQr
    : `${window.location.origin}/folder/${folderToken}`

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
    <Modal isOpen={isOpen} onClose={onClose} title="QR Code Folder" size="md">
      <div className="flex flex-col items-center text-center">
        {/* Nama Folder Pill */}
        <div className="inline-flex items-center gap-2 text-[var(--pb-text)] font-retro text-base sm:text-lg font-bold px-4 py-1.5 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] mb-4 max-w-full shadow-[2px_2px_0px_var(--pb-shadow-solid)]">
          <FolderIcon size={18} className="text-[#FF5A36] shrink-0" />
          <span className="truncate max-w-[220px] sm:max-w-[280px]">{folder.name}</span>
        </div>

        {/* ===== CARD DESIGN SESUAI MOCKUP ===== */}
        <div className="w-full max-w-[280px] sm:max-w-[380px] md:max-w-[410px] rounded-[6px] overflow-hidden border-[3px] border-black shadow-[4px_4px_0px_#000,8px_8px_0px_var(--pb-shadow-solid)] bg-white mb-5 transition-transform hover:scale-[1.01]">
          {/* Header Hitam */}
          <div className="bg-[#141416] px-4 pt-3.5 pb-3 text-center select-none overflow-hidden">
            <p className="text-zinc-400 font-pixel text-[8px] tracking-[0.18em] uppercase font-bold">
              F O L D E R
            </p>
            <h3 className="text-white font-pixel text-sm font-bold tracking-[0.1em] uppercase leading-tight mt-1 truncate">
              PIXELBOOTH
            </h3>
            <p className="text-zinc-400 font-retro text-[10px] font-bold tracking-[0.1em] uppercase mt-0.5">
              PHOTOBOOTH
            </p>
          </div>

          {/* Body Putih dengan QR */}
          <div className="px-5 pt-5 pb-4 bg-white flex flex-col items-center justify-center">
            <div className="w-full flex items-center justify-center mb-2.5">
              <QRCodeCanvas
                id="folder-qr-canvas"
                value={folderUrl}
                size={280}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
                includeMargin={false}
                className="w-full max-w-[200px] sm:max-w-[240px] aspect-square block border-[2px] border-black"
              />
            </div>

            <div className="w-28 h-[2px] bg-zinc-300 my-2.5" />

            <p className="font-retro text-zinc-700 text-sm sm:text-base font-bold leading-tight text-center max-w-[280px]">
              Scan untuk melihat galeri folder Anda
            </p>
            <p className="font-pixel text-zinc-500 text-[9px] font-bold tracking-[0.1em] uppercase text-center mt-1.5">
              PIXELBOOTH
            </p>
          </div>
        </div>

        {/* Tombol Aksi: Bagikan & Unduh Desain */}
        <div className="w-full max-w-[280px] sm:max-w-[380px] md:max-w-[410px] grid grid-cols-2 gap-3">
          <button
            type="button"
            title="Bagikan Link Folder"
            aria-label="Bagikan"
            onClick={handleShare}
            className="h-12 w-full rounded-[4px] bg-[var(--pb-elevated)] hover:bg-[var(--pb-border)] text-[var(--pb-text)] border-[2px] border-[var(--pb-border-strong)] flex items-center justify-center gap-2 font-retro text-base sm:text-lg font-bold uppercase transition-all active:translate-x-[2px] active:translate-y-[2px] cursor-pointer shadow-[3px_3px_0px_var(--pb-shadow-solid)] whitespace-nowrap"
          >
            <Share2 size={20} className="shrink-0 text-[#FF5A36]" />
            <span>Bagikan</span>
          </button>

          <button
            type="button"
            title="Unduh QR Code"
            aria-label="Unduh QR"
            onClick={handleDownloadQr}
            className="h-12 w-full rounded-[4px] bg-[#FF5A36] hover:bg-[#FF7040] shadow-[3px_3px_0px_#000] border-[2px] border-black text-white flex items-center justify-center gap-2 font-retro text-base sm:text-lg font-bold uppercase transition-all active:translate-x-[2px] active:translate-y-[2px] cursor-pointer whitespace-nowrap"
          >
            <Download size={20} className="shrink-0 text-white" />
            <span>Unduh QR</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default FolderQrModal