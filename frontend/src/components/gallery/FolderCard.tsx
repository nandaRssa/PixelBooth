import React from 'react'
import { motion } from 'framer-motion'
import { Folder as FolderIcon, Pencil, QrCode, Trash2, FolderOpen, ImageIcon } from 'lucide-react'
import type { Folder } from '@/types'

// ==========================================
// Folder Card — tampilan folder dalam grid
// ==========================================

interface FolderCardProps {
  folder: Folder
  onOpen: (folder: Folder) => void
  onRename: (folder: Folder) => void
  onDelete: (folder: Folder) => void
  onShowQr: (folder: Folder) => void
}

const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  onOpen,
  onRename,
  onDelete,
  onShowQr,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative bg-[#141414] border border-[#2A2A2A] rounded-xl p-5
        hover:border-[#3A3A3A] hover:bg-[#1A1A1A] transition-all duration-200 cursor-pointer"
      onClick={() => onOpen(folder)}
    >
      {/* Icon */}
      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-white/10 transition-colors">
        <FolderIcon size={22} className="text-[#A0A0A0] group-hover:text-white transition-colors" />
      </div>

      {/* Nama + stats */}
      <h3 className="text-white font-medium text-sm truncate mb-1">{folder.name}</h3>
      <div className="flex items-center gap-3 text-[#606060] text-xs">
        <span className="flex items-center gap-1">
          <FolderOpen size={12} />
          {(folder.children?.length ?? 0)} sub-folder
        </span>
        <span className="flex items-center gap-1">
          <ImageIcon size={12} />
          {folder.photo_count ?? 0} foto
        </span>
      </div>

      {/* Aksi cepat — muncul saat hover */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onShowQr(folder)
          }}
          className="touch-target w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A]
            text-[#A0A0A0] hover:text-white hover:border-[#3A3A3A] transition-colors"
          title="Lihat QR Code"
        >
          <QrCode size={14} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRename(folder)
          }}
          className="touch-target w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A]
            text-[#A0A0A0] hover:text-white hover:border-[#3A3A3A] transition-colors"
          title="Ubah Nama"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(folder)
          }}
          className="touch-target w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#2A2A2A]
            text-[#A0A0A0] hover:text-red-400 hover:border-red-500/30 transition-colors"
          title="Hapus Folder"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  )
}

export default FolderCard