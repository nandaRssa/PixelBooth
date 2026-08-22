import React from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

// ==========================================
// Toast Notification System
// ==========================================

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration?: number
}

const toastConfig = {
  success: {
    icon: CheckCircle,
    bg: 'bg-[#0D1F0D]',
    border: 'border-[#1A3D1A]',
    text: 'text-green-400',
    iconColor: 'text-green-400',
  },
  error: {
    icon: XCircle,
    bg: 'bg-[#1F0D0D]',
    border: 'border-[#3D1A1A]',
    text: 'text-red-400',
    iconColor: 'text-red-400',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-[#1F1A0D]',
    border: 'border-[#3D320D]',
    text: 'text-amber-400',
    iconColor: 'text-amber-400',
  },
  info: {
    icon: Info,
    bg: 'bg-[#0D141F]',
    border: 'border-[#1A283D]',
    text: 'text-blue-400',
    iconColor: 'text-blue-400',
  },
}

// Single Toast Item
interface ToastItemProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

const ToastComponent: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const config = toastConfig[toast.type]
  const Icon = config.icon

  React.useEffect(() => {
    // Durasi singkat untuk umpan balik ringan; error boleh menginap lebih lama
    const fallback = toast.type === 'error' ? 4500 : toast.type === 'warning' ? 3000 : 2500
    const duration = toast.duration ?? fallback
    const timer = setTimeout(() => onDismiss(toast.id), duration)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, toast.type, onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className={`
        flex items-center gap-2.5 px-3.5 py-2 rounded-xl border pointer-events-auto
        ${config.bg} ${config.border}
        shadow-xl w-full text-xs backdrop-blur-md
      `}
    >
      <Icon size={14} className={`${config.iconColor} flex-shrink-0`} />
      <p className={`text-xs flex-1 leading-snug font-medium ${config.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-pb-text-muted hover:text-pb-text transition-colors flex-shrink-0 p-0.5"
        title="Tutup"
        aria-label="Tutup notifikasi"
      >
        <X size={12} />
      </button>
    </motion.div>
  )
}

// Toast Container
interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    // Atas tengah: compact dan tidak menutupi tombol bawah atau bottom navigation
    <div className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none w-[calc(100vw-2rem)] max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastComponent key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// Toast Store (simple useState-based)
let toastHandler: ((toast: Omit<ToastItem, 'id'>) => void) | null = null

export const registerToastHandler = (handler: (toast: Omit<ToastItem, 'id'>) => void) => {
  toastHandler = handler
}

export const toast = {
  success: (message: string, duration?: number) =>
    toastHandler?.({ type: 'success', message, duration }),
  error: (message: string, duration?: number) =>
    toastHandler?.({ type: 'error', message, duration }),
  warning: (message: string, duration?: number) =>
    toastHandler?.({ type: 'warning', message, duration }),
  info: (message: string, duration?: number) =>
    toastHandler?.({ type: 'info', message, duration }),
}
