import React, { useEffect, useState, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderInput,
  QrCode,
  Trash2,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { getStorageUrl } from '@/api/client'
import { downloadFile } from '@/utils/download'
import type { Photo } from '@/types'

import type { Variants } from 'framer-motion'

// ==========================================
// Photo Preview Modal — Preview foto fullscreen dengan fitur slide / swipe
// Selaras 100% dengan Design System (Light & Dark Theme)
// ==========================================

interface PhotoPreviewModalProps {
  photo: Photo | null
  photos?: Photo[]
  onSelectPhoto?: (photo: Photo) => void
  onClose: () => void
  onMove: (photo: Photo) => void
  onDelete: (photo: Photo) => void
  onShowQr: (photo: Photo) => void
}

const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { type: 'tween', duration: 0.18, ease: 'easeOut' },
      opacity: { duration: 0.12 },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
    transition: {
      x: { type: 'tween', duration: 0.14, ease: 'easeIn' },
      opacity: { duration: 0.1 },
    },
  }),
}

const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({
  photo,
  photos = [],
  onSelectPhoto,
  onClose,
  onMove,
  onDelete,
  onShowQr,
}) => {
  const [direction, setDirection] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  // Gunakan list photos jika ada, fallback ke [photo]
  const photoList = photos.length > 0 ? photos : photo ? [photo] : []
  const activeIndex = photo ? photoList.findIndex((p) => p.id === photo.id) : -1
  const currentPhoto = activeIndex >= 0 ? photoList[activeIndex] : photo

  const hasPrev = activeIndex > 0
  const hasNext = activeIndex >= 0 && activeIndex < photoList.length - 1

  const handlePrev = useCallback(() => {
    if (!hasPrev) return
    setDirection(-1)
    const prevPhoto = photoList[activeIndex - 1]
    if (onSelectPhoto && prevPhoto) {
      onSelectPhoto(prevPhoto)
    }
  }, [hasPrev, photoList, activeIndex, onSelectPhoto])

  const handleNext = useCallback(() => {
    if (!hasNext) return
    setDirection(1)
    const nextPhoto = photoList[activeIndex + 1]
    if (onSelectPhoto && nextPhoto) {
      onSelectPhoto(nextPhoto)
    }
  }, [hasNext, photoList, activeIndex, onSelectPhoto])

  // Keyboard navigation: Panah Kiri, Panah Kanan, Escape
  useEffect(() => {
    if (!photo) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [photo, handlePrev, handleNext, onClose])

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchEndX - touchStartX
    const minSwipeDistance = 50 // px threshold

    if (diff > minSwipeDistance) {
      handlePrev()
    } else if (diff < -minSwipeDistance) {
      handleNext()
    }
    setTouchStartX(null)
  }

  return (
    <AnimatePresence>
      {currentPhoto && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
              w-[calc(100vw-2rem)] max-w-3xl max-h-[92vh] bg-pb-surface border border-pb-border
              rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 select-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-pb-border gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-pb-text font-semibold text-sm sm:text-base truncate max-w-[200px] sm:max-w-md">
                      {currentPhoto.filename}
                    </h3>
                    {photoList.length > 1 && (
                      <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-pb-elevated text-[#FF5A36] border border-pb-border shrink-0">
                        {activeIndex + 1} / {photoList.length}
                      </span>
                    )}
                  </div>
                  <p className="text-pb-text-muted text-xs mt-0.5">
                    {photoList.length > 1
                      ? 'Geser atau gunakan tombol panah untuk melihat foto lainnya'
                      : 'Preview Foto Photobooth'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-pb-elevated border border-pb-border hover:border-pb-border-strong text-pb-text-secondary hover:text-pb-text flex items-center justify-center transition-colors shrink-0 ml-auto cursor-pointer"
                title="Tutup Preview"
                aria-label="Tutup Preview"
              >
                <X size={16} />
              </button>
            </div>

            {/* Image Preview Container with Slide Navigation */}
            <div
              className="relative flex-1 min-h-[45vh] max-h-[62vh] bg-pb-bg border border-pb-border rounded-xl overflow-hidden flex items-center justify-center p-2 touch-pan-y"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Tombol Navigasi Slide Kiri (Previous) */}
              {hasPrev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePrev()
                  }}
                  className="absolute left-2.5 sm:left-3.5 top-1/2 -translate-y-1/2 z-20
                    w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-black/85 text-white
                    border border-white/20 backdrop-blur-md shadow-xl flex items-center justify-center
                    transition-all active:scale-95 cursor-pointer hover:scale-105"
                  title="Foto Sebelumnya (Panah Kiri)"
                  aria-label="Sebelumnya"
                >
                  <ChevronLeft size={22} className="shrink-0" />
                </button>
              )}

              {/* Tombol Navigasi Slide Kanan (Next) */}
              {hasNext && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleNext()
                  }}
                  className="absolute right-2.5 sm:right-3.5 top-1/2 -translate-y-1/2 z-20
                    w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/60 hover:bg-black/85 text-white
                    border border-white/20 backdrop-blur-md shadow-xl flex items-center justify-center
                    transition-all active:scale-95 cursor-pointer hover:scale-105"
                  title="Foto Selanjutnya (Panah Kanan)"
                  aria-label="Selanjutnya"
                >
                  <ChevronRight size={22} className="shrink-0" />
                </button>
              )}

              {/* Foto Animasi dengan Slide Transition */}
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={currentPhoto.id}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="w-full h-full flex items-center justify-center"
                >
                  {currentPhoto.url ? (
                    <img
                      src={getStorageUrl(currentPhoto.url)}
                      alt={currentPhoto.filename}
                      className="max-w-full max-h-[58vh] object-contain rounded-lg shadow-md select-none pointer-events-none"
                    />
                  ) : (
                    <p className="text-pb-text-muted text-sm py-12">Gambar tidak tersedia</p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Actions Bar — Terstruktur & Responsif */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-pb-border/60">
              {/* Grup Aksi Utama: Unduh & QR Code */}
              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await downloadFile(
                      currentPhoto.url,
                      currentPhoto.filename || 'pixelbooth-photo.jpg'
                    )
                  }}
                  leftIcon={<Download size={15} />}
                  className="text-xs font-semibold py-2"
                >
                  Unduh Foto
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onShowQr(currentPhoto)
                    onClose()
                  }}
                  leftIcon={<QrCode size={15} className="text-cyan-400" />}
                  className="text-xs font-medium py-2"
                >
                  QR Code
                </Button>
              </div>

              {/* Grup Aksi Manajemen: Buka, Pindah, Hapus */}
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(getStorageUrl(currentPhoto.url), '_blank')}
                  leftIcon={<ExternalLink size={14} />}
                  className="flex-1 sm:flex-initial text-xs py-2"
                >
                  Buka Tab
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onMove(currentPhoto)
                    onClose()
                  }}
                  leftIcon={<FolderInput size={14} className="text-amber-400" />}
                  className="flex-1 sm:flex-initial text-xs py-2"
                >
                  Pindah
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    onDelete(currentPhoto)
                    onClose()
                  }}
                  leftIcon={<Trash2 size={14} />}
                  className="text-xs py-2 px-3 shrink-0"
                >
                  Hapus
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default PhotoPreviewModal