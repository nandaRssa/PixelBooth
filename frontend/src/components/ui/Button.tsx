import React from 'react'

// ==========================================
// Button Component — PixelBooth Retro Arcade Design System
// 3D bevel push effect, no framer-motion scale
// ==========================================

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  children?: React.ReactNode
  disabled?: boolean
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  type?: 'button' | 'submit' | 'reset'
  className?: string
  id?: string
  form?: string
  title?: string
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:   'bg-[#FF5A36] text-white border-[2px] border-black shadow-[4px_4px_0px_var(--pb-shadow-solid)] hover:bg-[#FF7040] hover:shadow-[5px_5px_0px_#FFB800] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_var(--pb-shadow-solid)]',
  secondary: 'bg-[var(--pb-elevated)] text-[var(--pb-text)] border-[2px] border-[var(--pb-border-strong)] shadow-[3px_3px_0px_var(--pb-shadow-solid)] hover:bg-[var(--pb-border)] hover:border-[#FFB800] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_var(--pb-shadow-solid)]',
  danger:    'bg-[#8B0000] text-[#FFEEEE] border-[2px] border-[#EF4444] shadow-[3px_3px_0px_#EF4444] hover:bg-[#AA0000] hover:text-white active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#EF4444]',
  ghost:     'bg-transparent text-[var(--pb-text-secondary)] border-[2px] border-transparent hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)] hover:bg-[var(--pb-elevated)]',
  outline:   'bg-transparent text-[var(--pb-text)] border-[2px] border-[var(--pb-border-strong)] shadow-[3px_3px_0px_var(--pb-shadow-solid)] hover:bg-[var(--pb-elevated)] hover:border-[#FFB800] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_var(--pb-shadow-solid)]',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm:  'px-3.5 py-1.5 text-base sm:text-lg min-h-[38px]',
  md:  'px-5 py-2.5 text-lg sm:text-xl min-h-[46px]',
  lg:  'px-7 py-3 text-xl sm:text-2xl min-h-[54px]',
  xl:  'px-9 py-4 text-2xl sm:text-3xl min-h-[64px]',
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  children,
  disabled,
  onClick,
  type = 'button',
  className = '',
  id,
  form,
  title,
}) => {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      id={id}
      form={form}
      title={title}
      onClick={onClick}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2 rounded-[4px]
        font-retro tracking-wide uppercase
        transition-[transform,box-shadow,background-color] duration-[50ms]
        cursor-pointer select-none
        disabled:opacity-40 disabled:cursor-not-allowed
        disabled:!translate-x-0 disabled:!translate-y-0 disabled:!shadow-none
        focus:outline-none focus:ring-2 focus:ring-[#FF5A36] focus:ring-offset-2 focus:ring-offset-[var(--pb-bg)]
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
}
