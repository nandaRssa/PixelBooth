import React, { useEffect, useState, useCallback } from 'react'
import { Camera, ChevronLeft, ChevronRight, ImageIcon, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { getStorageUrl } from '@/api/client'
import type { Variants } from 'framer-motion'
import type { Template } from '@/types'

// ==========================================
// Template Preview Modal — Preview template foto dengan slide & tombol "Gunakan Template"
// Desain selaras 100% dengan PhotoPreviewModal di Galeri
// ==========================================

interface TemplatePreviewModalProps {
  template: Template | null
  templates: Template[]
  onSelectTemplate: (template: Template) => void
  onClose: () => void
  onUseTemplate: (template: Template) => void
  isLoading?: boolean
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

const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  template,
  templates = [],
  onSelectTemplate,
  onClose,
  onUseTemplate,
  isLoading = false,
}) => {
  const [direction, setDirection] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const templateList = templates.length > 0 ? templates : template ? [template] : []
  const activeIndex = template ? templateList.findIndex((t) => t.id === template.id) : -1
  const currentTemplate = activeIndex >= 0 ? templateList[activeIndex] : template

  const hasPrev = activeIndex > 0
  const hasNext = activeIndex >= 0 && activeIndex < templateList.length - 1

  const handlePrev = useCallback(() => {
    if (!hasPrev) return
    setDirection(-1)
    const prevTpl = templateList[activeIndex - 1]
    if (onSelectTemplate && prevTpl) {
      onSelectTemplate(prevTpl)
    }
  }, [hasPrev, templateList, activeIndex, onSelectTemplate])

  const handleNext = useCallback(() => {
    if (!hasNext) return
    setDirection(1)
    const nextTpl = templateList[activeIndex + 1]
    if (onSelectTemplate && nextTpl) {
      onSelectTemplate(nextTpl)
    }
  }, [hasNext, templateList, activeIndex, onSelectTemplate])

  // Keyboard navigation
  useEffect(() => {
    if (!template) return

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
      } else if (e.key === 'Enter' && !isLoading && currentTemplate) {
        e.preventDefault()
        onUseTemplate(currentTemplate)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [template, currentTemplate, handlePrev, handleNext, onClose, onUseTemplate, isLoading])

  // Touch swipe
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

  return (
    <AnimatePresence>
      {currentTemplate && (
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
                      {currentTemplate.name}
                    </h3>
                    {templateList.length > 1 && (
                      <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-pb-elevated text-[#FF5A36] border border-pb-border shrink-0">
                        {activeIndex + 1} / {templateList.length}
                      </span>
                    )}
                  </div>
                  <p className="text-pb-text-muted text-xs mt-0.5">
                    {currentTemplate.frame_count} Frame · {currentTemplate.canvas_width} ×{' '}
                    {currentTemplate.canvas_height} px
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

            {/* Template Image Preview Container with Slide Navigation */}
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
                  title="Template Sebelumnya (Panah Kiri)"
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
                  title="Template Selanjutnya (Panah Kanan)"
                  aria-label="Selanjutnya"
                >
                  <ChevronRight size={22} className="shrink-0" />
                </button>
              )}

              {/* Template Image with Slide Transition */}
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={currentTemplate.id}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="w-full h-full flex items-center justify-center"
                >
                  {currentTemplate.preview_url || currentTemplate.template_url ? (
                    <img
                      src={getStorageUrl(
                        currentTemplate.preview_url || currentTemplate.template_url || ''
                      )}
                      alt={currentTemplate.name}
                      className="max-w-full max-h-[58vh] object-contain rounded-lg shadow-md select-none pointer-events-none"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-12">
                      <ImageIcon size={36} className="text-pb-faint" />
                      <p className="text-pb-text-muted text-sm">Gambar template tidak tersedia</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Actions Bar — 1 Tombol Utama untuk Menggunakan Template Ini */}
            <div className="pt-2 border-t border-pb-border/60">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => onUseTemplate(currentTemplate)}
                loading={isLoading}
                leftIcon={<Camera size={18} />}
                className="font-semibold text-sm sm:text-base py-3 rounded-xl shadow-lg shadow-orange-500/20"
              >
                {isLoading ? 'Memulai Sesi...' : 'Gunakan Template Ini'}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default TemplatePreviewModal
