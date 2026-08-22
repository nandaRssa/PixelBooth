import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from './Button'

// ==========================================
// Modal Component
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
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 380 }}
            className={`
              relative z-10 my-auto
              w-full ${sizeMap[size]}
              bg-pb-surface border border-pb-border rounded-2xl shadow-2xl overflow-hidden
            `}
          >
            {/* Header */}
            {(title || showClose) && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-pb-border">
                {title && (
                  <h3 className="text-pb-text font-semibold text-base">{title}</h3>
                )}
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg bg-pb-elevated border border-pb-border hover:border-pb-border-strong text-pb-text-secondary hover:text-pb-text flex items-center justify-center transition-colors ml-auto shrink-0"
                    title="Tutup"
                    aria-label="Tutup"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
            {/* Content */}
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ==========================================
// Confirm Modal — untuk konfirmasi destructive action
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
      <p className="text-pb-text-secondary text-sm leading-relaxed mb-6">{message}</p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          fullWidth
          onClick={onClose}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
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
