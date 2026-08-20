import React from 'react'
import { motion } from 'framer-motion'
import { Eye, FolderInput, Trash2, ImageIcon } from 'lucide-react'
import type { Photo } from '@/types'

// ==========================================
// Photo Card — tampilan thumbnail foto
// ==========================================

interface PhotoCardProps {
  photo: Photo
  onPreview: (photo: Photo) => void
  onMove: (photo: Photo) => void
  onDelete: (photo: Photo) => void
}

const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onPreview, onMove, onDelete }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative aspect-square bg-[#141414] border border-[#2A2A2A] rounded-xl overflow-hidden cursor-pointer"
      onClick={() => onPreview(photo)}
    >
      {photo.thumbnail_url ? (
        <img
          src={photo.thumbnail_url}
          alt={photo.filename}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1A1A1A]">
          <ImageIcon size={28} className="text-[#333]" />
        </div>
      )}

      {/* Overlay aksi */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPreview(photo)
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg
                bg-white/10 backdrop-blur-sm text-white text-xs font-medium
                hover:bg-white/20 transition-colors"
            >
              <Eye size={13} />
              Lihat
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onMove(photo)
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg
                bg-white/10 backdrop-blur-sm text-white text-xs font-medium
                hover:bg-white/20 transition-colors"
            >
              <FolderInput size={13} />
              Pindah
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(photo)
              }}
              className="touch-target w-9 h-9 rounded-lg bg-red-500/20 backdrop-blur-sm text-red-300
                hover:bg-red-500/40 hover:text-red-200 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default PhotoCard