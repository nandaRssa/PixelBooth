import React from 'react'
import { motion } from 'framer-motion'
import { Download, FolderOpen, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'

// ==========================================
// Customer Folder Page — akses via QR token folder
// ==========================================

const CustomerFolderPage: React.FC = () => {
  const [loading] = React.useState(false)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="text-white mx-auto mb-3" />
          <p className="text-[#606060] text-sm">Memuat galeri...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-4 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-6 pt-4">
          <p className="text-[#606060] text-xs mb-2">PixelBooth</p>
          <h1 className="text-white font-bold text-xl">Galeri Foto</h1>
          <p className="text-[#606060] text-xs mt-1">Nama Folder</p>
        </div>

        {/* QR Code Folder */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 mb-4 flex items-center gap-4">
          <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
            <QrCode size={28} className="text-black" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">QR Folder Ini</p>
            <p className="text-[#606060] text-xs mt-0.5">Scan untuk berbagi semua foto</p>
          </div>
        </div>

        {/* Photos Grid Placeholder */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-8 flex flex-col items-center justify-center mb-4">
          <FolderOpen size={40} className="text-[#333] mb-3" />
          <p className="text-[#404040] text-sm">Belum ada foto di folder ini</p>
        </div>

        {/* Download All */}
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          leftIcon={<Download size={18} />}
        >
          Unduh Semua Foto
        </Button>
      </motion.div>
    </div>
  )
}

export default CustomerFolderPage
