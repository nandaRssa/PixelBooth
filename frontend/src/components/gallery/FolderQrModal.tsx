import React from 'react'
import { Download, ExternalLink, Folder as FolderIcon, Share2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { downloadSvgAsPng } from '@/utils/downloadQr'
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
      await downloadSvgAsPng(folder.qr_url, `qr-${folder.unique_token.slice(0, 8)}.png`)
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
        <div className="flex items-center gap-2 text-[#A0A0A0] text-sm mb-5">
          <FolderIcon size={16} />
          <span className="font-medium text-white">{folder.name}</span>
        </div>

        <div className="w-52 rounded-xl overflow-hidden border border-[#2A2A2A] shadow-lg bg-white mb-5">
          {folder.qr_url ? (
            <img src={folder.qr_url} alt="QR Code folder" className="w-full h-auto" />
          ) : (
            <div className="w-full h-72 bg-[#1A1A1A]" />
          )}
        </div>

        <p className="text-[#606060] text-xs leading-relaxed mb-5 max-w-xs">
          Scan QR ini untuk mengakses galeri folder via perangkat customer.
        </p>

        <div className="w-full flex flex-col gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleDownloadQr}
            leftIcon={<Download size={16} />}
          >
            Unduh QR
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={handleShare}
              leftIcon={<Share2 size={16} />}
            >
              Bagikan
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => window.open(folderUrl, '_blank')}
              leftIcon={<ExternalLink size={16} />}
            >
              Buka Halaman Customer
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default FolderQrModal