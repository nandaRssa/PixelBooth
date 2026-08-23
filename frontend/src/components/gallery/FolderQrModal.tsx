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
    <Modal isOpen={isOpen} onClose={onClose} title="QR Code Folder" size="md">
      <div className="flex flex-col items-center text-center">
        {/* Nama Folder Pill */}
        <div className="flex items-center gap-2 text-pb-text-secondary text-xs font-medium px-3 py-1 rounded-full bg-pb-elevated border border-pb-border mb-4">
          <FolderIcon size={14} className="text-[#FF5A36]" />
          <span className="truncate max-w-[240px] text-pb-text">{folder.name}</span>
        </div>

        {/* ===== CARD DESIGN SESUAI MOCKUP ===== */}
        <div className="w-[300px] max-w-full rounded-3xl overflow-hidden shadow-2xl border border-pb-border bg-white mb-5 transition-transform hover:scale-[1.01]">
          {/* Header Hitam */}
          <div className="bg-[#141416] px-4 pt-5 pb-4 text-center select-none">
            <p className="text-zinc-400 text-[11px] font-semibold tracking-[0.35em] uppercase mb-1">
              F O L D E R
            </p>
            <h3 className="text-white text-lg font-black tracking-[0.22em] uppercase leading-tight">
              P I X E L B O O T H
            </h3>
            <p className="text-zinc-400 text-[9px] font-medium tracking-[0.25em] uppercase mt-1">
              P H O T O B O O T H
            </p>
          </div>

          {/* Body Putih dengan QR */}
          <div className="p-5 pt-6 pb-5 bg-white flex flex-col items-center">
            <div className="w-full flex items-center justify-center mb-4">
              <QRCodeCanvas
                id="folder-qr-canvas"
                value={folderUrl}
                size={300}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
                includeMargin={false}
                className="w-full h-auto max-w-[220px]"
              />
            </div>

            {/* Garis Pembatas Halus */}
            <div className="w-32 h-[1px] bg-zinc-200 mb-3" />

            {/* Keterangan Bawah */}
            <p className="text-zinc-600 text-[11px] font-normal leading-relaxed text-center mb-1">
              Scan untuk melihat galeri folder Anda
            </p>
            <p className="text-zinc-400 text-[8px] font-semibold tracking-[0.25em] uppercase text-center">
              P I X E L B O O T H
            </p>
          </div>
        </div>

        {/* Tombol Aksi */}
        <div className="w-full flex flex-col gap-2">
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

export default FolderQrModal