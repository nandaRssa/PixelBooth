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
        <div className="inline-flex items-center gap-1.5 text-pb-text text-xs font-semibold px-3 py-1.5 rounded-full bg-pb-elevated border border-pb-border mb-3.5 max-w-full">
          <FolderIcon size={14} className="text-[#FF5A36] shrink-0" />
          <span className="truncate max-w-[200px] sm:max-w-[240px]">{folder.name}</span>
        </div>

        {/* Clean Square QR Box (Sesuai Ukuran Asli QR) */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-pb-border shadow-xl mb-3.5 flex items-center justify-center">
          <QRCodeCanvas
            id="folder-qr-canvas"
            value={folderUrl}
            size={240}
            level="H"
            bgColor="#FFFFFF"
            fgColor="#000000"
            includeMargin={false}
            className="w-40 h-40 sm:w-48 sm:h-48 aspect-square block"
          />
        </div>

        <p className="text-pb-text-secondary text-xs mb-4 max-w-xs leading-relaxed">
          Scan QR ini untuk langsung melihat galeri foto folder Anda.
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

export default FolderQrModal