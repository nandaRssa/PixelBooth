import React from 'react'
import { motion } from 'framer-motion'
import { Folder as FolderIcon, Pencil, QrCode, Trash2 } from 'lucide-react'
import type { Folder } from '@/types'

// ==========================================
// Folder Card — tampilan folder dalam grid
// Bebeas tumpang tindih (Zero Collision Layout)
// Rapi & Presisi di iPad, Tablet, Laptop & Desktop
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
  const subfolderCount = folder.children?.length ?? 0
  const photoCount = folder.photo_count ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="group relative bg-pb-surface border border-pb-border rounded-2xl p-4
        hover:border-pb-border-strong hover:bg-pb-elevated shadow-xs hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between"
      onClick={() => onOpen(folder)}
    >
      {/* Baris 1 (Top): Icon Folder (Kiri) & 3 Tombol Aksi Simetris (Kanan) */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="w-10 h-10 rounded-xl bg-pb-elevated flex items-center justify-center shrink-0 border border-pb-border/50 group-hover:bg-pb-border-light transition-colors">
          <FolderIcon size={20} className="text-pb-text-secondary group-hover:text-pb-text transition-colors" />
        </div>

        {/* 3 Tombol Aksi (QR, Edit, Hapus) — Toolbar Terpisah Rapi */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onShowQr(folder)
            }}
            className="w-8 h-8 rounded-lg bg-pb-bg border border-pb-border text-cyan-400 hover:text-cyan-300 hover:bg-pb-elevated active:scale-95 transition-all flex items-center justify-center"
            title="Lihat QR Code"
            aria-label="Lihat QR Code"
          >
            <QrCode size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRename(folder)
            }}
            className="w-8 h-8 rounded-lg bg-pb-bg border border-pb-border text-pb-text-secondary hover:text-pb-text hover:bg-pb-elevated active:scale-95 transition-all flex items-center justify-center"
            title="Ubah Nama"
            aria-label="Ubah Nama"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(folder)
            }}
            className="w-8 h-8 rounded-lg bg-pb-bg border border-pb-border text-red-400 hover:text-red-300 hover:bg-red-500/10 active:scale-95 transition-all flex items-center justify-center"
            title="Hapus Folder"
            aria-label="Hapus Folder"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Baris 2 (Middle): Nama Folder (Full Width Truncate) */}
      <div className="mb-3 min-w-0">
        <h3 className="text-pb-text font-bold text-base truncate leading-snug" title={folder.name}>
          {folder.name}
        </h3>
      </div>

      {/* Baris 3 (Bottom): Stats Sub-folder & Foto (Tersusun di Bawah Pembatas) */}
      <div className="pt-2.5 border-t border-pb-border/50 flex items-center gap-2 text-xs text-pb-text-muted">
        <span className="font-medium">{subfolderCount} sub-folder</span>
        <span>•</span>
        <span className="font-medium">{photoCount} foto</span>
      </div>
    </motion.div>
  )
}

export default FolderCard