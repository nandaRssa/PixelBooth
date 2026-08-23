import React from 'react'
import { motion } from 'framer-motion'
import { Check, Eye, FolderInput, Trash2, ImageIcon } from 'lucide-react'
import { getStorageUrl } from '@/api/client'
import type { Photo } from '@/types'

// ==========================================
// Photo Card — tampilan thumbnail foto
// Mendukung mode seleksi untuk aksi massal
// ==========================================

interface PhotoCardProps {
  photo: Photo
  onPreview: (photo: Photo) => void
  onMove: (photo: Photo) => void
  onDelete: (photo: Photo) => void
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (photo: Photo) => void
}

const PhotoCard: React.FC<PhotoCardProps> = ({
  photo,
  onPreview,
  onMove,
  onDelete,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const [imgSrc, setImgSrc] = React.useState<string>(() =>
    getStorageUrl(photo.thumbnail_url || photo.url)
  )

  React.useEffect(() => {
    setImgSrc(getStorageUrl(photo.thumbnail_url || photo.url))
  }, [photo.thumbnail_url, photo.url])

  const handleImgError = () => {
    if (photo.url && imgSrc !== getStorageUrl(photo.url)) {
      setImgSrc(getStorageUrl(photo.url))
    }
  }

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(photo)
      return
    }
    onPreview(photo)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className={`
        group relative aspect-[3/4] bg-pb-surface border rounded-xl overflow-hidden cursor-pointer
        shadow-xs hover:shadow-xl transition-colors duration-200
        ${selectionMode
          ? isSelected
            ? 'border-white ring-2 ring-white/30'
            : 'border-pb-border'
          : 'border-pb-border'
        }
      `}
      onClick={handleClick}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={photo.filename}
          loading="lazy"
          onError={handleImgError}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-200 ${
            selectionMode && !isSelected ? 'opacity-60' : 'group-hover:scale-105'
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-pb-elevated">
          <ImageIcon size={24} className="text-pb-faint" />
        </div>
      )}

      {/* Indikator seleksi */}
      {selectionMode && (
        <div className={`absolute top-1.5 left-1.5 w-5 h-5 sm:w-6 sm:h-6 rounded-md border-2 flex items-center justify-center
          ${isSelected ? 'bg-white border-white' : 'bg-black/40 border-white/60'}`}>
          {isSelected && <Check size={12} className="text-black sm:w-[14px] sm:h-[14px]" />}
        </div>
      )}

      {/* Overlay aksi (hanya di mode normal) */}
      {!selectionMode && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-1.5 sm:p-2.5">
          <div className="flex items-center justify-between gap-1 w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPreview(photo)
              }}
              className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1 sm:py-1.5 px-1.5 sm:px-2 rounded-lg
                bg-black/80 backdrop-blur-md text-white border border-white/20
                text-[10px] sm:text-xs font-semibold hover:bg-black hover:text-cyan-300 active:scale-95 transition-all shadow-md"
              title="Lihat Foto"
              aria-label="Lihat Foto"
            >
              <Eye size={12} className="text-cyan-300 shrink-0 sm:w-[14px] sm:h-[14px]" />
              <span className="hidden sm:inline truncate">Lihat</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onMove(photo)
              }}
              className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1 sm:py-1.5 px-1.5 sm:px-2 rounded-lg
                bg-black/80 backdrop-blur-md text-white border border-white/20
                text-[10px] sm:text-xs font-semibold hover:bg-black hover:text-amber-300 active:scale-95 transition-all shadow-md"
              title="Pindahkan Foto"
              aria-label="Pindahkan Foto"
            >
              <FolderInput size={12} className="text-amber-300 shrink-0 sm:w-[14px] sm:h-[14px]" />
              <span className="hidden sm:inline truncate">Pindah</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(photo)
              }}
              className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-black/80 backdrop-blur-md text-red-400 border border-white/20
                hover:bg-red-600 hover:text-white active:scale-95 transition-all shadow-md flex items-center justify-center shrink-0"
              title="Hapus Foto"
              aria-label="Hapus Foto"
            >
              <Trash2 size={12} className="sm:w-[14px] sm:h-[14px]" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default PhotoCard