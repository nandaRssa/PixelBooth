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
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className={`
        flex items-start gap-3 px-4 py-3 rounded-lg border pointer-events-auto
        ${config.bg} ${config.border}
        shadow-2xl min-w-[260px] max-w-[380px]
      `}
    >
      <Icon size={16} className={`${config.iconColor} mt-0.5 flex-shrink-0`} />
      <p className={`text-sm flex-1 leading-relaxed ${config.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-[#606060] hover:text-white transition-colors flex-shrink-0"
      >
        <X size={14} />
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
    // Bawah-tengah: tidak menutupi sidebar/tombol kanan, header, atau canvas atas.
    // Container pointer-events-none agar klik tembus saat tidak ada toast.
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
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
