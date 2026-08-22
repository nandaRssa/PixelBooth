import React from 'react'
import { Download, ExternalLink, Folder as FolderIcon, Share2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { downloadSvgAsPng } from '@/utils/downloadQr'
import { getStorageUrl } from '@/api/client'
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
    if (!folder.qr_url) return
    try {
      await downloadSvgAsPng(getStorageUrl(folder.qr_url), `qr-${folder.unique_token.slice(0, 8)}.png`)
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

        <div className="w-80 max-w-full rounded-2xl p-4 overflow-hidden border border-pb-border shadow-xl bg-white mb-5">
          {folder.qr_url ? (
            <img src={getStorageUrl(folder.qr_url)} alt="QR Code folder" className="w-full h-auto" />
          ) : (
            <div className="w-full h-72 bg-pb-elevated" />
          )}
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