import React from 'react'
import { motion } from 'framer-motion'
import { Check, Folder as FolderIcon, Pencil, QrCode, Square, Trash2 } from 'lucide-react'
import type { Folder } from '@/types'

// ==========================================
// Folder Card — tampilan folder dalam grid
// Mendukung mode seleksi untuk aksi massal
// ==========================================

interface FolderCardProps {
  folder: Folder
  onOpen: (folder: Folder) => void
  onRename: (folder: Folder) => void
  onDelete: (folder: Folder) => void
  onShowQr: (folder: Folder) => void
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (folder: Folder) => void
}

const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  onOpen,
  onRename,
  onDelete,
  onShowQr,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const subfolderCount = folder.children?.length ?? 0
  const photoCount = folder.photo_count ?? 0

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(folder)
      return
    }
    onOpen(folder)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className={`group relative bg-pb-surface border rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
        selectionMode
          ? isSelected
            ? 'border-[#FF5A36] ring-2 ring-[#FF5A36]/40 bg-orange-500/5 shadow-md'
            : 'border-pb-border hover:border-pb-border-strong hover:bg-pb-elevated'
          : 'border-pb-border hover:border-pb-border-strong hover:bg-pb-elevated shadow-xs hover:shadow-xl'
      }`}
      onClick={handleClick}
    >
      {/* Baris 1 (Top): Icon Folder / Checkbox & Tombol Aksi */}
      <div className="flex items-center justify-between gap-2 mb-3">
        {selectionMode ? (
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                isSelected
                  ? 'bg-[#FF5A36] text-white shadow-md'
                  : 'bg-pb-elevated border border-pb-border text-pb-text-muted'
              }`}
            >
              {isSelected ? <Check size={16} className="stroke-[3]" /> : <Square size={16} />}
            </div>
            <span className="text-xs font-semibold text-pb-text-secondary">
              {isSelected ? 'Terpilih' : 'Pilih'}
            </span>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-xl bg-pb-elevated flex items-center justify-center shrink-0 border border-pb-border/50 group-hover:bg-pb-border-light transition-colors">
            <FolderIcon size={20} className="text-[#FF5A36] group-hover:scale-110 transition-transform" />
          </div>
        )}

        {/* 3 Tombol Aksi (Hanya di mode normal) */}
        {!selectionMode && (
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
        )}
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