import React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ExternalLink, Folder as FolderIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Folder } from '@/types'

// ==========================================
// Folder QR Modal — tampilkan QR code folder
// ==========================================

interface FolderQrModalProps {
  isOpen: boolean
  onClose: () => void
  folder: Folder | null
}

const FolderQrModal: React.FC<FolderQrModalProps> = ({ isOpen, onClose, folder }) => {
  if (!folder) return null

  const folderUrl = `${window.location.origin}/folder/${folder.unique_token}`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="QR Code Folder" size="sm">
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center gap-2 text-[#A0A0A0] text-sm mb-5">
          <FolderIcon size={16} />
          <span className="font-medium text-white">{folder.name}</span>
        </div>

        <div className="bg-white p-4 rounded-xl mb-5">
          <QRCodeSVG value={folderUrl} size={180} fgColor="#0A0A0A" />
        </div>

        <p className="text-[#606060] text-xs leading-relaxed mb-5">
          Scan QR ini untuk mengakses galeri folder via perangkat customer.
        </p>

        <div className="w-full">
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
    </Modal>
  )
}

export default FolderQrModal