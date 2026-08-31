import React from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from './Button'

// ==========================================
// Modal Component — Retro Arcade Style
// Hard border, no glassmorphism, step animation
// Light/Dark mode supported via CSS variables
// ==========================================

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  showClose?: boolean
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
}) => {
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto w-screen h-screen">
          {/* Backdrop — solid dark full screen */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="fixed inset-0 bg-black/85 w-full h-full"
            onClick={onClose}
          />
          {/* Modal Card — retro double border */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`
              relative z-10 my-auto
              w-full ${sizeMap[size]}
              bg-[var(--pb-surface)]
              border-[3px] border-[#FF5A36]
              shadow-[6px_6px_0px_var(--pb-shadow-solid)]
              rounded-[4px]
              overflow-hidden
            `}
          >
            {/* Scanline overlay on modal */}
            <div
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
              }}
            />
            {/* Header */}
            {(title || showClose) && (
              <div className="relative z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b-[2px] border-[#FF5A36] bg-[#FF5A36]/15">
                {title && (
                  <h3 className="font-pixel text-[var(--pb-text)] text-sm sm:text-base lg:text-lg leading-relaxed uppercase tracking-wider pr-2">
                    {title}
                  </h3>
                )}
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] text-[var(--pb-text)] hover:text-white hover:bg-[#FF5A36] hover:border-[#FF5A36] flex items-center justify-center transition-colors ml-auto shrink-0 cursor-pointer active:translate-x-[2px] active:translate-y-[2px]"
                    title="Tutup"
                    aria-label="Tutup"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            {/* Content */}
            <div className="relative z-10 p-5 sm:p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ==========================================
// Confirm Modal — konfirmasi destructive action
// ==========================================

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  danger?: boolean
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Tidak',
  loading = false,
  danger = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="font-retro text-[var(--pb-text)] text-xl sm:text-2xl font-bold leading-relaxed mb-6">
        {message}
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={onClose}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          size="md"
          fullWidth
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
