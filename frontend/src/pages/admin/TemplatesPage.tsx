import React from 'react'
import { motion } from 'framer-motion'
import { Layers, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/StatusBadge'

// ==========================================
// Templates Management Page — Phase 1 Placeholder
// Fitur lengkap akan diimplementasikan di Phase 3
// ==========================================

const TemplatesPage: React.FC = () => {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-white text-2xl font-bold">Kelola Template</h1>
          <p className="text-[#606060] text-sm mt-1">Upload dan konfigurasi template pemotretan</p>
        </div>
        <Button
          variant="primary"
          size="md"
          leftIcon={<Upload size={16} />}
        >
          Upload Template
        </Button>
      </div>

      {/* Template Info */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"
      >
        {[
          { label: 'Format yang Didukung', value: 'PNG, JPG, WEBP' },
          { label: 'Ukuran Canvas', value: 'Bebas (pixel based)' },
          { label: 'Max Frame', value: '10 frame per template' },
        ].map((info) => (
          <div key={info.label} className="bg-[#141414] border border-[#2A2A2A] rounded-xl px-4 py-4">
            <p className="text-[#606060] text-xs mb-1">{info.label}</p>
            <p className="text-white text-sm font-medium">{info.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Content */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl">
        <EmptyState
          icon={<Layers size={48} />}
          title="Belum ada template"
          description="Upload template desain dari Canva atau program desain lainnya. Template akan digunakan saat sesi pemotretan."
          action={
            <div className="flex gap-3">
              <Button variant="outline" size="md" leftIcon={<Upload size={16} />}>
                Upload Template
              </Button>
              <Button variant="secondary" size="md" leftIcon={<Plus size={16} />}>
                Buat dari Scratch
              </Button>
            </div>
          }
        />
      </div>
    </div>
  )
}

export default TemplatesPage
