import React from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/StatusBadge'

// ==========================================
// Gallery Page — Phase 1 Placeholder
// Fitur lengkap akan diimplementasikan di Phase 5
// ==========================================

const GalleryPage: React.FC = () => {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-white text-2xl font-bold">Galeri</h1>
          <p className="text-[#606060] text-sm mt-1">Kelola folder dan foto</p>
        </div>
        <Button
          variant="primary"
          size="md"
          leftIcon={<Plus size={16} />}
        >
          Buat Folder
        </Button>
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-[#141414] border border-[#2A2A2A] rounded-2xl"
      >
        <EmptyState
          icon={<FolderOpen size={48} />}
          title="Belum ada folder"
          description="Buat folder pertama untuk mulai menyimpan dan mengorganisasi foto photobooth."
          action={
            <Button variant="outline" size="md" leftIcon={<Plus size={16} />}>
              Buat Folder Pertama
            </Button>
          }
        />
      </motion.div>
    </div>
  )
}

export default GalleryPage
