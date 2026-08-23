import React from 'react'
import { Download, Folder as FolderIcon, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { downloadQrCode } from '@/utils/downloadQr'
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
      await downloadQrCode('folder-qr-svg', folder.qr_url || '', `qr-folder-${folder.unique_token.slice(0, 8)}.png`)
      toast.success('QR Code berhasil diunduh.')
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
        <div className="flex items-center gap-2 text-pb-text-secondary text-sm mb-5">
          <FolderIcon size={16} />
          <span className="font-medium text-pb-text">{folder.name}</span>
        </div>

        <div className="w-72 max-w-full rounded-2xl p-5 overflow-hidden border border-pb-border shadow-xl bg-white mb-5 flex items-center justify-center">
          <QRCodeSVG
            id="folder-qr-svg"
            value={folderUrl}
            size={240}
            level="H"
            includeMargin={true}
            className="w-full h-auto"
          />
        </div>

        <p className="text-pb-text-muted text-sm leading-relaxed mb-5 max-w-sm">
          Scan QR ini untuk mengakses galeri folder via perangkat customer.
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

export default FolderQrModal