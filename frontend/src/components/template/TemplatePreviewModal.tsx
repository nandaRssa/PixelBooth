import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ImageIcon, X, Layers } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { getStorageUrl } from '@/api/client'
import type { Variants } from 'framer-motion'
import type { Template } from '@/types'

// ==========================================
// Template Preview Modal — Retro Arcade Style
// Dialog preview template foto dengan teks besar, badge tajam,
// tombol aksi prominent, dan navigasi slide keyboard/touch.
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

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
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

  if (!currentTemplate || typeof document === 'undefined') return null

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
          {/* Top arcade accent strip */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FF5A36] via-[#FFB800] to-[#00FFCC]" />

          {/* Header with enlarged prominent title & specs */}
          <div className="flex items-start justify-between pb-4 border-b-[2px] border-[var(--pb-border)] gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-2.5 sm:gap-3 mb-1.5">
                <h3 className="font-pixel text-[var(--pb-text)] text-xl sm:text-2xl lg:text-3xl tracking-wide truncate max-w-[280px] sm:max-w-xl">
                  {currentTemplate.name}
                </h3>
                {templateList.length > 1 && (
                  <span className="font-pixel text-xs sm:text-sm px-3 py-1 rounded-[3px] bg-[#FF5A36] text-white border-[2px] border-black shadow-[2px_2px_0px_#000] shrink-0 font-bold">
                    {activeIndex + 1} / {templateList.length}
                  </span>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-2 sm:gap-3 text-[var(--pb-text-muted)] font-retro text-lg sm:text-xl font-bold">
                <span className="flex items-center gap-1.5 text-[#FFB800]">
                  <Layers size={18} />
                  <span>{currentTemplate.frame_count ?? 1} Foto Frame</span>
                </span>
                <span className="text-[var(--pb-border-strong)]">•</span>
                <span className="text-[var(--pb-text-secondary)]">
                  {currentTemplate.canvas_width} × {currentTemplate.canvas_height} px
                </span>
              </div>
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

          {/* Template Image Preview Container with Slide Navigation */}
          <div
            className="relative flex-1 min-h-[48vh] max-h-[60vh] bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] overflow-hidden flex items-center justify-center p-3 touch-pan-y shadow-[inset_0_2px_10px_rgba(0,0,0,0.6)]"
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
                className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20
                  w-11 h-11 sm:w-13 sm:h-13 rounded-[4px] bg-black/80 hover:bg-[#FF5A36] text-white
                  border-[2px] border-white/60 shadow-[3px_3px_0px_#000] flex items-center justify-center
                  transition-all active:translate-x-[1px] active:translate-y-[1px] cursor-pointer hover:border-black"
                title="Template Sebelumnya (Panah Kiri)"
                aria-label="Sebelumnya"
              >
                <ChevronLeft size={28} className="shrink-0 stroke-[2.5]" />
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
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20
                  w-11 h-11 sm:w-13 sm:h-13 rounded-[4px] bg-black/80 hover:bg-[#FF5A36] text-white
                  border-[2px] border-white/60 shadow-[3px_3px_0px_#000] flex items-center justify-center
                  transition-all active:translate-x-[1px] active:translate-y-[1px] cursor-pointer hover:border-black"
                title="Template Selanjutnya (Panah Kanan)"
                aria-label="Selanjutnya"
              >
                <ChevronRight size={28} className="shrink-0 stroke-[2.5]" />
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
                    className="max-w-full max-h-[56vh] object-contain rounded-none border-[2px] border-white shadow-[4px_4px_0px_#000] select-none pointer-events-none"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-12">
                    <ImageIcon size={44} className="text-[var(--pb-faint)]" />
                    <p className="font-retro text-[var(--pb-text-muted)] text-lg">Gambar template tidak tersedia</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Actions Bar — Large Arcade Action Button */}
          <div className="pt-2 border-t-[2px] border-[var(--pb-border)]">
            <button
              type="button"
              onClick={() => onUseTemplate(currentTemplate)}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-4 sm:py-4.5 px-6
                bg-[#FF5A36] hover:bg-[#FF6E4D] text-white
                font-retro text-xl sm:text-2xl lg:text-3xl font-bold uppercase tracking-wider
                border-[3px] border-black rounded-[4px]
                shadow-[4px_4px_0px_#000000,7px_7px_0px_var(--pb-shadow-solid)]
                hover:shadow-[6px_6px_0px_#000000,10px_10px_0px_var(--pb-shadow-solid)]
                hover:-translate-x-1 hover:-translate-y-1
                active:translate-x-1 active:translate-y-1
                active:shadow-[1px_1px_0px_#000000,2px_2px_0px_var(--pb-shadow-solid)]
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-all duration-150 cursor-pointer"
            >
              <span>{isLoading ? 'Memulai Sesi...' : 'Gunakan Template Ini'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  )
}

export default TemplatePreviewModal
