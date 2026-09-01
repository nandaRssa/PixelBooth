import React from 'react'
import { Check, Eye, FolderInput, Trash2, ImageIcon } from 'lucide-react'
import { getStorageUrl } from '@/api/client'
import type { Photo } from '@/types'

// ==========================================
// Photo Card — Retro Polaroid Style
// White thick border, diagonal stripe hover overlay
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
    <div
      className={`
        group relative aspect-[3/4]
        bg-[var(--pb-surface)]
        cursor-pointer
        overflow-hidden
        transition-all
        duration-150 ease-out
        ${selectionMode
          ? isSelected
            ? 'border-[4px] border-[#FFB800] shadow-[3px_3px_0px_#000,6px_6px_0px_#FF5A36] rounded-none'
            : 'border-[4px] border-white/60 shadow-[3px_3px_0px_#000,5px_5px_0px_#FF5E00] rounded-none opacity-70'
          : 'border-[4px] border-white shadow-[3px_3px_0px_#000,6px_6px_0px_#FF5E00] rounded-none hover:border-[#FF5A36] hover:shadow-[5px_5px_0px_#000,10px_10px_0px_#FF5E00] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-[1px_1px_0px_#000,2px_2px_0px_#FF5E00]'
        }
      `}
      onClick={handleClick}
    >
      {/* Photo image */}
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={photo.filename}
          loading="lazy"
          onError={handleImgError}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-150 ${
            selectionMode && !isSelected ? 'opacity-50 grayscale' : ''
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--pb-elevated)]">
          <ImageIcon size={24} className="text-[var(--pb-faint)]" />
        </div>
      )}

      {/* Selection checkbox */}
      {selectionMode && (
        <div
          className={`absolute top-1.5 left-1.5 w-6 h-6 border-[3px] flex items-center justify-center rounded-none ${
            isSelected
              ? 'bg-[#FF5A36] border-black shadow-[2px_2px_0px_#000]'
              : 'bg-black/60 border-white/70'
          }`}
        >
          {isSelected && <Check size={13} className="text-white stroke-[3]" />}
        </div>
      )}

      {/* Hover action overlay — desktop only, solid dark */}
      {!selectionMode && (
        <div
          className="hidden lg:flex absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-col justify-end p-2 pointer-events-none group-hover:pointer-events-auto"
          style={{
            background: 'rgba(0,0,0,0.75)',
          }}
        >
          <div className="flex items-center justify-between gap-1 w-full">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPreview(photo) }}
              className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2
                rounded-none bg-[#00FFCC]/90 border-[2px] border-black text-black
                text-xs font-retro uppercase tracking-wider
                hover:bg-[#00FFCC] active:translate-x-[1px] active:translate-y-[1px]
                shadow-[2px_2px_0px_#000] transition-all cursor-pointer"
              title="Lihat Foto"
              aria-label="Lihat Foto"
            >
              <Eye size={12} className="shrink-0" />
              <span className="hidden sm:inline truncate">Lihat</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMove(photo) }}
              className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2
                rounded-none bg-[#FFB800]/90 border-[2px] border-black text-black
                text-xs font-retro uppercase tracking-wider
                hover:bg-[#FFB800] active:translate-x-[1px] active:translate-y-[1px]
                shadow-[2px_2px_0px_#000] transition-all cursor-pointer"
              title="Pindahkan Foto"
              aria-label="Pindahkan Foto"
            >
              <FolderInput size={12} className="shrink-0" />
              <span className="hidden sm:inline truncate">Pindah</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(photo) }}
              className="w-8 h-8 rounded-none bg-red-700/90 border-[2px] border-black text-white
                hover:bg-red-600 active:translate-x-[1px] active:translate-y-[1px]
                shadow-[2px_2px_0px_#000] flex items-center justify-center shrink-0 cursor-pointer"
              title="Hapus Foto"
              aria-label="Hapus Foto"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PhotoCard