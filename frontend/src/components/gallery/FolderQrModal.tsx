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
      <div className="flex flex-col items-center text-center w-full">
        {/* Nama Folder Pill */}
        <div className="inline-flex items-center gap-1.5 text-pb-text-secondary text-xs font-medium px-3 py-1 rounded-full bg-pb-elevated border border-pb-border mb-3 max-w-full shrink-0">
          <FolderIcon size={13} className="text-[#FF5A36] shrink-0" />
          <span className="truncate max-w-[180px] sm:max-w-[220px] text-pb-text font-semibold text-[11px] sm:text-xs">
            {folder.name}
          </span>
        </div>

        {/* ===== CARD DESIGN SESUAI MOCKUP ===== */}
        <div className="w-full max-w-[250px] min-[360px]:max-w-[270px] sm:max-w-[290px] rounded-2xl overflow-hidden shadow-xl border border-pb-border bg-white mb-3.5 shrink-0">
          {/* Header Hitam */}
          <div className="bg-[#141416] px-3.5 py-3 text-center select-none shrink-0">
            <p className="text-zinc-400 text-[9px] font-semibold tracking-[0.3em] uppercase mb-0.5">
              F O L D E R
            </p>
            <h3 className="text-white text-sm sm:text-base font-black tracking-[0.2em] uppercase leading-tight">
              P I X E L B O O T H
            </h3>
            <p className="text-zinc-400 text-[8px] font-medium tracking-[0.2em] uppercase mt-0.5">
              P H O T O B O O T H
            </p>
          </div>

          {/* Body Putih dengan QR */}
          <div className="p-3.5 min-[360px]:p-4 sm:p-5 bg-white flex flex-col items-center justify-center shrink-0">
            <div className="w-full flex items-center justify-center mb-2.5 shrink-0">
              <QRCodeCanvas
                id="folder-qr-canvas"
                value={folderUrl}
                size={260}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
                includeMargin={false}
                className="w-36 h-36 min-[360px]:w-44 min-[360px]:h-44 sm:w-48 sm:h-48 aspect-square max-w-full block shrink-0"
              />
            </div>

            {/* Garis Pembatas Halus */}
            <div className="w-20 sm:w-24 h-[1px] bg-zinc-200 mb-2 shrink-0" />

            {/* Keterangan Bawah */}
            <p className="text-zinc-700 text-[11px] sm:text-xs font-medium leading-snug text-center mb-0.5 max-w-[210px] shrink-0">
              Scan untuk melihat galeri folder Anda
            </p>
            <p className="text-zinc-400 text-[8px] font-semibold tracking-[0.2em] uppercase text-center shrink-0">
              P I X E L B O O T H
            </p>
          </div>
        </div>

        {/* Tombol Aksi */}
        <div className="w-full max-w-[250px] min-[360px]:max-w-[270px] sm:max-w-[290px] flex flex-col gap-2 shrink-0">
          <Button
            variant="primary"
            fullWidth
            onClick={handleDownloadQr}
            leftIcon={<Download size={15} />}
          >
            Unduh Desain QR Card
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={handleShare}
            leftIcon={<Share2 size={15} />}
          >
            Bagikan Link
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default FolderQrModal