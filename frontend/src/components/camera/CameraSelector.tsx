import React from 'react'
import { Camera, RefreshCw, AlertCircle, Sparkles } from 'lucide-react'
import { useCameraDevices } from '@/hooks/useCameraDevices'

interface CameraSelectorProps {
  compact?: boolean
  className?: string
  onChange?: (deviceId: string) => void
  disabled?: boolean
}

export const CameraSelector: React.FC<CameraSelectorProps> = ({
  compact = false,
  className = '',
  onChange,
  disabled = false,
}) => {
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices,
    isLoading,
    hasPermission,
  } = useCameraDevices()

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value
    setSelectedDeviceId(newId)
    onChange?.(newId)
  }

  const isCanon = (label: string) => {
    const l = label.toLowerCase()
    return l.includes('canon') || l.includes('eos')
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 sm:gap-2 max-w-full ${className}`}>
        <div className="relative flex-1 sm:flex-none flex items-center min-w-0">
          <div className="absolute left-2 sm:left-2.5 pointer-events-none text-[var(--pb-text-muted)] shrink-0">
            <Camera size={14} />
          </div>
          <select
            value={selectedDeviceId || ''}
            onChange={handleSelectChange}
            disabled={disabled || devices.length === 0 || isLoading}
            className="w-full sm:w-auto pl-7 sm:pl-8 pr-6 sm:pr-7 py-1.5 bg-[var(--pb-surface)] text-[var(--pb-text)] font-retro text-sm sm:text-base rounded-[4px] border-[2px] border-[var(--pb-border-strong)] shadow-[2px_2px_0px_#000] focus:outline-none focus:border-[var(--pb-primary)] disabled:opacity-60 cursor-pointer appearance-none truncate max-w-[170px] xs:max-w-[210px] sm:max-w-[260px]"
          >
            {devices.length === 0 ? (
              <option value="">{isLoading ? 'Memuat...' : 'Kamera kosong'}</option>
            ) : (
              devices.map((d, index) => (
                <option key={d.deviceId || index} value={d.deviceId}>
                  {isCanon(d.label) ? `📷 [Canon] ${d.label}` : d.label}
                </option>
              ))
            )}
          </select>
        </div>
        <button
          type="button"
          onClick={() => refreshDevices(true)}
          disabled={isLoading || disabled}
          title="Pindai ulang kamera USB"
          className="shrink-0 p-1.5 sm:p-2 bg-[var(--pb-surface)] hover:bg-[var(--pb-elevated)] text-[var(--pb-text-muted)] hover:text-[var(--pb-text)] rounded-[4px] border-[2px] border-[var(--pb-border-strong)] shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="font-pixel text-[var(--pb-text)] text-[11px] sm:text-xs uppercase flex items-center gap-1.5">
          <Camera size={13} className="text-[#FFB800] shrink-0" />
          <span>Pilih Perangkat Kamera</span>
        </label>
        <button
          type="button"
          onClick={() => refreshDevices(true)}
          disabled={isLoading || disabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 font-pixel text-[9px] sm:text-[10px] text-[var(--pb-text)] bg-[var(--pb-bg)] hover:bg-[var(--pb-elevated)] border-[1.5px] border-[var(--pb-border-strong)] rounded-[3px] shadow-[1px_1px_0px_#000] active:translate-y-[1px] transition-all cursor-pointer shrink-0"
        >
          <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          <span>Pindai USB</span>
        </button>
      </div>

      <div className="relative w-full">
        <select
          value={selectedDeviceId || ''}
          onChange={handleSelectChange}
          disabled={disabled || devices.length === 0 || isLoading}
          className="w-full pl-3 pr-8 py-2 sm:py-2.5 bg-[var(--pb-bg)] text-[var(--pb-text)] font-retro text-base sm:text-lg rounded-[4px] border-[2px] border-[var(--pb-border-strong)] shadow-[2px_2px_0px_#000] focus:outline-none focus:border-[var(--pb-primary)] disabled:opacity-60 cursor-pointer truncate"
        >
          {devices.length === 0 ? (
            <option value="">
              {isLoading
                ? 'Sedang memindai perangkat...'
                : hasPermission === false
                ? 'Izin kamera belum diberikan'
                : 'Tidak ada kamera terdeteksi'}
            </option>
          ) : (
            devices.map((d, index) => {
              const canon = isCanon(d.label)
              return (
                <option key={d.deviceId || index} value={d.deviceId}>
                  {canon ? `📸 [DSLR Canon] ${d.label}` : d.label}
                </option>
              )
            })
          )}
        </select>
      </div>

      {devices.length > 0 && devices.some((d) => isCanon(d.label)) && (
        <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-[4px] text-emerald-400 font-retro text-xs sm:text-sm">
          <Sparkles size={14} className="shrink-0 text-emerald-400" />
          <span>Canon EOS Webcam Utility terdeteksi dan siap digunakan!</span>
        </div>
      )}

      {hasPermission === false && devices.length === 0 && !isLoading && (
        <div className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-[4px] text-red-400 font-retro text-xs sm:text-sm">
          <AlertCircle size={14} className="shrink-0 text-red-400 mt-0.5" />
          <span>
            Akses kamera diblokir oleh browser. Harap izinkan akses kamera di ikon gembok URL browser Anda.
          </span>
        </div>
      )}
    </div>
  )
}
