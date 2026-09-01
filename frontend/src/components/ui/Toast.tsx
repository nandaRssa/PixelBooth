import React from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

// ==========================================
// Toast Notification System — Retro Arcade Style
// Large, clear typography with sharp retro borders
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
    bg: 'bg-[#0D240D]',
    border: 'border-[#22C55E]',
    text: 'text-[#4ADE80]',
    iconColor: 'text-[#4ADE80]',
    shadow: 'shadow-[3px_3px_0px_#000,5px_5px_0px_#15803D]',
  },
  error: {
    icon: XCircle,
    bg: 'bg-[#280D0D]',
    border: 'border-[#EF4444]',
    text: 'text-[#FCA5A5]',
    iconColor: 'text-[#F87171]',
    shadow: 'shadow-[3px_3px_0px_#000,5px_5px_0px_#B91C1C]',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-[#2A200A]',
    border: 'border-[#F59E0B]',
    text: 'text-[#FDE68A]',
    iconColor: 'text-[#FBBF24]',
    shadow: 'shadow-[3px_3px_0px_#000,5px_5px_0px_#B45309]',
  },
  info: {
    icon: Info,
    bg: 'bg-[#0A1D2E]',
    border: 'border-[#00FFCC]',
    text: 'text-[#67E8F9]',
    iconColor: 'text-[#00FFCC]',
    shadow: 'shadow-[3px_3px_0px_#000,5px_5px_0px_#0891B2]',
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
    const fallback = toast.type === 'error' ? 4500 : toast.type === 'warning' ? 3000 : 2500
    const duration = toast.duration ?? fallback
    const timer = setTimeout(() => onDismiss(toast.id), duration)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, toast.type, onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      className={`
        flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5
        rounded-[4px] border-[2px] pointer-events-auto
        ${config.bg} ${config.border} ${config.shadow}
        w-full backdrop-blur-md select-none
      `}
    >
      <Icon size={22} className={`${config.iconColor} shrink-0 stroke-[2.5]`} />
      <p className={`font-retro text-base sm:text-lg lg:text-xl font-bold flex-1 leading-snug tracking-wide ${config.text}`}>
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/60 hover:text-white transition-colors shrink-0 p-1 cursor-pointer active:scale-95"
        title="Tutup"
        aria-label="Tutup notifikasi"
      >
        <X size={18} />
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
    <div className="fixed top-5 sm:top-7 left-1/2 -translate-x-1/2 z-[10000] flex flex-col items-center gap-2.5 pointer-events-none w-[calc(100vw-2rem)] max-w-lg">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastComponent key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// Toast Store
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

export default ToastContainer
