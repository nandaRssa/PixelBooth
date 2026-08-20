import React from 'react'
import { type CameraStatus } from '@/types'

// ==========================================
// Camera Status Indicator
// ==========================================

interface CameraStatusBadgeProps {
  status: CameraStatus
  className?: string
}

const statusConfig: Record<CameraStatus, { label: string; dotClass: string; textClass: string }> = {
  connected: {
    label: 'Kamera Terhubung',
    dotClass: 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]',
    textClass: 'text-green-400',
  },
  disconnected: {
    label: 'Kamera Tidak Terhubung',
    dotClass: 'bg-[#606060]',
    textClass: 'text-[#606060]',
  },
  error: {
    label: 'Error Kamera',
    dotClass: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]',
    textClass: 'text-red-400',
  },
  capturing: {
    label: 'Mengambil Foto...',
    dotClass: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)] animate-pulse',
    textClass: 'text-amber-400',
  },
}

export const CameraStatusBadge: React.FC<CameraStatusBadgeProps> = ({
  status,
  className = '',
}) => {
  const config = statusConfig[status]

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dotClass}`} />
      <span className={`text-xs font-medium ${config.textClass}`}>{config.label}</span>
    </div>
  )
}

// ==========================================
// Status Badge (generic)
// ==========================================

interface StatusBadgeProps {
  label: string
  variant: 'success' | 'error' | 'warning' | 'neutral' | 'info'
  className?: string
}

const badgeVariants = {
  success: 'bg-green-500/10 text-green-400 border border-green-500/20',
  error: 'bg-red-500/10 text-red-400 border border-red-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  neutral: 'bg-[#1E1E1E] text-[#A0A0A0] border border-[#2A2A2A]',
  info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, variant, className = '' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badgeVariants[variant]} ${className}`}>
    {label}
  </span>
)

// ==========================================
// Spinner
// ==========================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const spinnerSizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '' }) => (
  <svg
    className={`animate-spin ${spinnerSizes[size]} ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

// ==========================================
// Loading Overlay
// ==========================================

interface LoadingOverlayProps {
  message?: string
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = 'Memuat...' }) => (
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-30 rounded-xl">
    <Spinner size="lg" className="text-white mb-3" />
    <p className="text-[#A0A0A0] text-sm">{message}</p>
  </div>
)

// ==========================================
// Empty State
// ==========================================

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    {icon && <div className="text-[#333] mb-4">{icon}</div>}
    <h3 className="text-white font-medium text-base mb-1">{title}</h3>
    {description && (
      <p className="text-[#606060] text-sm leading-relaxed mb-6 max-w-xs">{description}</p>
    )}
    {action}
  </div>
)
