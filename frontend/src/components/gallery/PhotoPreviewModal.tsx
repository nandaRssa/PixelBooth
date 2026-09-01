import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderInput,
  Printer,
  QrCode,
  Trash2,
  X,
  ImageIcon,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { getStorageUrl } from '@/api/client'
import { downloadFile } from '@/utils/download'
import PrintModal from '@/components/gallery/PrintModal'
import type { Photo } from '@/types'
import type { Variants } from 'framer-motion'

// ==========================================
// Photo Preview Modal — Retro Arcade Style
// Large typography, prominent filename, sharp badges,
// and high-impact action buttons.
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

export const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({
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
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false)

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

  // Keyboard navigation
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
    const minSwipeDistance = 50

    if (diff > minSwipeDistance) {
      handlePrev()
    } else if (diff < -minSwipeDistance) {
      handleNext()
    }
    setTouchStartX(null)
  }

  if (!currentPhoto || typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-4xl max-h-[94vh]
            bg-[var(--pb-surface)]
            border-[3px] border-[var(--pb-border-strong)]
            rounded-[4px]
            shadow-[4px_4px_0px_#000000,8px_8px_0px_var(--pb-shadow-solid)]
            p-5 sm:p-7 flex flex-col gap-4 sm:gap-5 select-none"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b-[2px] border-[var(--pb-border)] gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-2.5 sm:gap-3 mb-1">
                <h3 className="font-pixel text-[var(--pb-text)] text-lg sm:text-xl lg:text-2xl tracking-wide truncate max-w-[280px] sm:max-w-xl">
                  {currentPhoto.filename}
                </h3>
                {photoList.length > 1 && (
                  <span className="font-pixel text-xs sm:text-sm px-3 py-1 rounded-[3px] bg-[#FF5A36] text-white border-[2px] border-black shadow-[2px_2px_0px_#000] shrink-0 font-bold">
                    {activeIndex + 1} / {photoList.length}
                  </span>
                )}
              </div>
              <p className="font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold">
                {photoList.length > 1
                  ? 'Gunakan tombol panah atau tombol slide untuk navigasi'
                  : 'Preview Hasil Foto Photobooth'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] hover:border-[#FF5A36] text-[var(--pb-text-secondary)] hover:text-[var(--pb-text)] flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-[2px_2px_0px_var(--pb-shadow-solid)] active:translate-x-[1px] active:translate-y-[1px]"
              title="Tutup Preview (Esc)"
              aria-label="Tutup Preview"
            >
              <X size={20} />
            </button>
          </div>

          {/* Image Preview Container with Slide Navigation */}
          <div
            className="relative flex-1 min-h-[48vh] max-h-[60vh] bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] overflow-hidden flex items-center justify-center p-3 touch-pan-y shadow-[inset_0_2px_10px_rgba(0,0,0,0.6)]"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Navigasi Kiri */}
            {hasPrev && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handlePrev()
                }}
                className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20
                  w-11 h-11 sm:w-13 sm:h-13 rounded-[4px] bg-black/80 hover:bg-[#FF5A36] text-white
                  border-[2px] border-white/60 shadow-[3px_3px_0px_#000] flex items-center justify-center
                  transition-all active:translate-x-[1px] active:translate-y-[1px] cursor-pointer hover:border-black"
                title="Foto Sebelumnya"
                aria-label="Sebelumnya"
              >
                <ChevronLeft size={28} className="shrink-0 stroke-[2.5]" />
              </button>
            )}

            {/* Navigasi Kanan */}
            {hasNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNext()
                }}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20
                  w-11 h-11 sm:w-13 sm:h-13 rounded-[4px] bg-black/80 hover:bg-[#FF5A36] text-white
                  border-[2px] border-white/60 shadow-[3px_3px_0px_#000] flex items-center justify-center
                  transition-all active:translate-x-[1px] active:translate-y-[1px] cursor-pointer hover:border-black"
                title="Foto Selanjutnya"
                aria-label="Selanjutnya"
              >
                <ChevronRight size={28} className="shrink-0 stroke-[2.5]" />
              </button>
            )}

            {/* Foto dengan Slide Transition */}
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
                    className="max-w-full max-h-[56vh] object-contain rounded-none border-[2px] border-white shadow-[4px_4px_0px_#000] select-none pointer-events-none"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-12">
                    <ImageIcon size={44} className="text-[var(--pb-faint)]" />
                    <p className="font-retro text-[var(--pb-text-muted)] text-lg">Gambar tidak tersedia</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Action Bar: 6 Tombol Berukuran Konsisten & Responsif (Mobile: 2 kol, iPad: 3 kol x 2 baris, Laptop/Desktop: 6 kol) */}
          <div className="pt-3 border-t-[2px] border-[var(--pb-border)]">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 w-full">
              {/* 1. Unduh Foto */}
              <Button
                variant="primary"
                size="md"
                fullWidth
                onClick={async () => {
                  await downloadFile(
                    currentPhoto.url,
                    currentPhoto.filename || 'pixelbooth-photo.jpg'
                  )
                }}
                leftIcon={<Download size={18} className="shrink-0" />}
                className="!px-2 sm:!px-3 !text-base sm:!text-lg font-bold truncate"
                title="Unduh Foto"
              >
                Unduh
              </Button>

              {/* 2. Print Foto */}
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setShowPrintModal(true)}
                leftIcon={<Printer size={18} className="text-[#FFB800] stroke-[2.5] shrink-0" />}
                className="hover:!border-[#FFB800] !px-2 sm:!px-3 !text-base sm:!text-lg font-bold truncate"
                title="Print Foto"
              >
                Print
              </Button>

              {/* 3. QR Code */}
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => {
                  onShowQr(currentPhoto)
                  onClose()
                }}
                leftIcon={<QrCode size={18} className="text-[#00FFCC] shrink-0" />}
                className="hover:!border-[#00FFCC] !px-2 sm:!px-3 !text-base sm:!text-lg font-bold truncate"
                title="QR Code"
              >
                QR Code
              </Button>

              {/* 4. Buka di Tab Baru */}
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => window.open(getStorageUrl(currentPhoto.url), '_blank')}
                leftIcon={<ExternalLink size={18} className="shrink-0" />}
                className="hover:!border-[#FF5A36] !px-2 sm:!px-3 !text-base sm:!text-lg font-bold truncate"
                title="Buka Foto di Tab Baru"
              >
                Buka Tab
              </Button>

              {/* 5. Pindahkan Foto */}
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => {
                  onMove(currentPhoto)
                  onClose()
                }}
                leftIcon={<FolderInput size={18} className="text-[var(--pb-yellow)] stroke-[2.5] shrink-0" />}
                className="hover:!border-[var(--pb-yellow)] !px-2 sm:!px-3 !text-base sm:!text-lg font-bold truncate"
                title="Pindahkan Foto"
              >
                Pindah
              </Button>

              {/* 6. Hapus Foto */}
              <Button
                variant="danger"
                size="md"
                fullWidth
                onClick={() => {
                  onDelete(currentPhoto)
                  onClose()
                }}
                leftIcon={<Trash2 size={18} className="shrink-0" />}
                className="!px-2 sm:!px-3 !text-base sm:!text-lg font-bold truncate"
                title="Hapus Foto"
              >
                Hapus
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Modal Print Foto */}
      {showPrintModal && currentPhoto && (
        <PrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          photos={{
            id: currentPhoto.id,
            url: currentPhoto.url,
            title: currentPhoto.filename || 'Foto Galeri',
          }}
          title={`Cetak Foto: ${currentPhoto.filename || 'Galeri'}`}
        />
      )}
    </AnimatePresence>,
    document.body
  )
}

export default PhotoPreviewModal