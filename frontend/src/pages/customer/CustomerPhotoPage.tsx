import React from 'react'
import { motion } from 'framer-motion'
import { Download, QrCode, Image } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'

// ==========================================
// Customer Photo Page — akses via QR token
// ==========================================

const CustomerPhotoPage: React.FC = () => {
  // Token dari URL akan diparse di App.tsx via :token param
  const [loading] = React.useState(false)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="text-white mx-auto mb-3" />
          <p className="text-[#606060] text-sm">Memuat foto...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <p className="text-[#606060] text-xs">PixelBooth</p>
        </div>

        {/* Photo Preview Placeholder */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl overflow-hidden mb-4">
          <div className="aspect-[3/4] flex items-center justify-center bg-[#0D0D0D]">
            <div className="text-center">
              <Image size={40} className="text-[#333] mx-auto mb-2" />
              <p className="text-[#404040] text-xs">Foto tidak tersedia</p>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 mb-4 flex items-center gap-4">
          <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
            <QrCode size={32} className="text-black" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">Foto Ini</p>
            <p className="text-[#606060] text-xs mt-0.5">Scan untuk berbagi</p>
          </div>
        </div>

        {/* Download Button */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<Download size={18} />}
        >
          Unduh Foto
        </Button>
      </motion.div>
    </div>
  )
}

export default CustomerPhotoPage
