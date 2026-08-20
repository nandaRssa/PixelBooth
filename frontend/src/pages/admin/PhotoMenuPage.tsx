import React from 'react'
import { motion } from 'framer-motion'
import { Camera, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CameraStatusBadge } from '@/components/ui/StatusBadge'

// ==========================================
// Photo / Photobooth Menu Page — Phase 1 Placeholder
// Flow lengkap akan diimplementasikan di Phase 4
// ==========================================

const PhotoMenuPage: React.FC = () => {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-white text-2xl font-bold">Photo</h1>
          <p className="text-[#606060] text-sm mt-1">Mulai sesi pemotretan</p>
        </div>
        <CameraStatusBadge status="disconnected" />
      </div>

      {/* Camera Status Alert */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 mb-6 flex items-start gap-3"
      >
        <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-400 text-sm font-medium">Kamera tidak terhubung</p>
          <p className="text-[#A0A0A0] text-xs mt-0.5">
            Hubungkan kamera atau gunakan webcam untuk memulai sesi. Hardware bridge diperlukan untuk DSLR.
          </p>
        </div>
      </motion.div>

      {/* Template Selection Placeholder */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#1E1E1E] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Camera size={28} className="text-[#404040]" />
          </div>
          <h2 className="text-white font-semibold text-base mb-2">Pilih Template</h2>
          <p className="text-[#606060] text-sm leading-relaxed mb-6 max-w-sm mx-auto">
            Pilih template desain untuk sesi pemotretan. Template dapat dikelola di menu Kelola Template.
          </p>
          <Button variant="primary" size="lg">
            Mulai Sesi Baru
          </Button>
        </div>
      </div>
    </div>
  )
}

export default PhotoMenuPage
