import React, { useState, useEffect, useRef } from 'react'
import { Monitor, Maximize, Camera, Video, VideoOff, Info, CheckCircle2 } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import {
  getSessionDisplayMode,
  setSessionDisplayMode,
  type SessionDisplayMode,
} from '@/utils/sessionDisplay'
import { CameraSelector } from '@/components/camera/CameraSelector'
import { createCameraStream, getSelectedCameraId } from '@/utils/cameraManager'
import { useCameraDevices } from '@/hooks/useCameraDevices'

// ==========================================
// PIXELBOOTH — Halaman Pengaturan
// Pengaturan mode tampilan Photo Session & Konfigurasi Kamera (Webcam / DSLR).
// ==========================================

const DISPLAY_MODES: {
  value: SessionDisplayMode
  label: string
  desc: string
  icon: React.ReactNode
}[] = [
  {
    value: 'default',
    label: 'Default',
    desc: 'Menggunakan tampilan Photo Session yang sudah ada lengkap dengan navbar dan panel kontrol.',
    icon: <Monitor size={18} />,
  },
  {
    value: 'fullscreen',
    label: 'Fullscreen',
    desc: 'Tampilan khusus photobooth fullscreen template + live camera memenuhi seluruh layar, kontrol minimal.',
    icon: <Maximize size={18} />,
  },
]

const SettingsPage: React.FC = () => {
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  )
  const [mode, setMode] = useState<SessionDisplayMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024 ? 'fullscreen' : getSessionDisplayMode()
  )

  // Camera preview test states
  const { selectedDeviceId } = useCameraDevices()
  const [testStream, setTestStream] = useState<MediaStream | null>(null)
  const [isTestingCamera, setIsTestingCamera] = useState(false)
  const [cameraTestError, setCameraTestError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (mobile) {
        setMode('fullscreen')
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleSelectMode = (value: SessionDisplayMode) => {
    if (isMobile && value === 'default') {
      toast.info('Mode Default dinonaktifkan di smartphone (Otomatis Fullscreen).')
      return
    }
    setMode(value)
    setSessionDisplayMode(value)
    toast.success(
      `Mode tampilan: ${value === 'default' ? 'Default' : 'Fullscreen'}.`
    )
  }

  // Camera testing logic
  const startCameraTest = async (deviceId?: string) => {
    try {
      if (testStream) {
        testStream.getTracks().forEach((t) => t.stop())
      }
      setCameraTestError(null)
      setIsTestingCamera(true)

      const targetId = deviceId ?? selectedDeviceId ?? getSelectedCameraId()
      const { stream } = await createCameraStream(targetId)
      setTestStream(stream)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    } catch (err: any) {
      setCameraTestError(err?.message || 'Gagal menyalakan preview kamera.')
      setIsTestingCamera(false)
    }
  }

  const stopCameraTest = () => {
    if (testStream) {
      testStream.getTracks().forEach((t) => t.stop())
      setTestStream(null)
    }
    setIsTestingCamera(false)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const handleCameraChange = (newDeviceId: string) => {
    toast.success('Kamera aktif berhasil diperbarui!')
    if (isTestingCamera) {
      startCameraTest(newDeviceId)
    }
  }

  useEffect(() => {
    return () => {
      if (testStream) {
        testStream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [testStream])

  return (
    <div className="max-w-4xl pb-12 w-full">
      {/* ===== Header ===== */}
      <div className="mb-5 sm:mb-8">
        <h1 className="font-pixel text-[var(--pb-text)] text-base sm:text-lg lg:text-xl leading-relaxed">Pengaturan</h1>
        <p className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg lg:text-xl mt-1 sm:mt-2 tracking-wide">
          Konfigurasi aplikasi photobooth, sumber kamera, dan tampilan sesi.
        </p>
      </div>

      {/* ===== Camera & Hardware Settings ===== */}
      <section className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-6 lg:p-7 mb-6 shadow-[3px_3px_0px_#000,6px_6px_0px_var(--pb-shadow-solid)]">
        {/* Section Header with Responsive Flex Wrap */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
          <h2 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm leading-relaxed uppercase flex items-center gap-2">
            <Camera size={16} className="text-[#FFB800] shrink-0" />
            <span>Kamera & Perangkat Input</span>
          </h2>
          <span className="self-start sm:self-auto font-pixel text-[8px] sm:text-[9px] text-[#22C55E] bg-[#22C55E]/10 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-[3px] border-[1.5px] sm:border-[2px] border-[#22C55E]">
            WEBRTC LIVE
          </span>
        </div>

        <p className="font-retro text-[var(--pb-text-muted)] text-sm sm:text-base lg:text-lg mb-5 leading-relaxed">
          Pilih kamera yang digunakan untuk sesi pemotretan (Webcam bawaan, Webcam USB, atau Canon DSLR via EOS Webcam Utility).
        </p>

        {/* Responsive Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start">
          {/* Left Column: Selector & Setup Guide */}
          <div className="flex flex-col gap-4 w-full min-w-0">
            <CameraSelector onChange={handleCameraChange} />

            <div className="pt-1">
              {!isTestingCamera ? (
                <button
                  type="button"
                  onClick={() => startCameraTest()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FF5A36] hover:bg-[#FF7043] text-white font-pixel text-[11px] sm:text-xs rounded-[4px] border-[2px] border-black shadow-[2px_2px_0px_#000] active:translate-y-[1px] transition-all cursor-pointer"
                >
                  <Video size={14} className="shrink-0" />
                  <span>Uji Preview Kamera</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCameraTest}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--pb-surface)] hover:bg-[var(--pb-elevated)] text-[var(--pb-text)] font-pixel text-[11px] sm:text-xs rounded-[4px] border-[2px] border-[var(--pb-border-strong)] shadow-[2px_2px_0px_#000] active:translate-y-[1px] transition-all cursor-pointer"
                >
                  <VideoOff size={14} className="shrink-0" />
                  <span>Matikan Preview</span>
                </button>
              )}
            </div>

            {/* Canon Connection Tip Box */}
            <div className="p-3.5 sm:p-4 bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border)] rounded-[4px] mt-1">
              <div className="flex items-center gap-2 font-pixel text-[10px] sm:text-[11px] text-[#FFB800] mb-2 leading-tight">
                <Info size={14} className="shrink-0" />
                <span>Panduan Menghubungkan Kamera Canon DSLR:</span>
              </div>
              <ol className="font-retro text-xs sm:text-sm text-[var(--pb-text-muted)] space-y-1 list-decimal list-inside leading-relaxed">
                <li>Install software <strong className="text-[var(--pb-text)]">Canon EOS Webcam Utility</strong> di PC.</li>
                <li>Hubungkan kamera Canon ke port USB dengan kabel data.</li>
                <li>Nyalakan kamera dan ubah mode putar ke <strong className="text-[var(--pb-text)]">Movie / Video</strong>.</li>
                <li>Klik tombol <strong className="text-[var(--pb-text)]">"Pindai USB"</strong>, lalu pilih <strong className="text-[var(--pb-text)]">EOS Webcam Utility</strong>.</li>
              </ol>
            </div>
          </div>

          {/* Right Column: Live Test Preview Canvas */}
          <div className="flex flex-col w-full min-w-0">
            <label className="font-pixel text-[var(--pb-text)] text-[11px] sm:text-xs uppercase mb-2 flex items-center justify-between">
              <span>Preview Video Langsung</span>
              {isTestingCamera && (
                <span className="text-[#22C55E] text-[9px] font-pixel lowercase tracking-normal">
                  ● aktif
                </span>
              )}
            </label>
            <div className="relative aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/3] w-full bg-black border-[2px] border-[var(--pb-border-strong)] rounded-[4px] overflow-hidden flex items-center justify-center shadow-[2px_2px_0px_#000]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isTestingCamera ? 'block' : 'hidden'}`}
              />

              {!isTestingCamera && (
                <div className="flex flex-col items-center justify-center p-4 text-center">
                  <Camera size={32} className="text-[var(--pb-text-muted)] mb-2 opacity-50" />
                  <p className="font-pixel text-[10px] text-[var(--pb-text-muted)] uppercase">
                    Preview Kamera Mati
                  </p>
                  <p className="font-retro text-xs sm:text-sm text-[var(--pb-text-muted)] mt-1 max-w-[220px]">
                    Klik tombol "Uji Preview Kamera" untuk melihat framing & kualitas
                  </p>
                </div>
              )}

              {cameraTestError && (
                <div className="absolute inset-0 bg-black/85 flex items-center justify-center p-4 text-center">
                  <p className="font-retro text-red-400 text-sm sm:text-base">
                    {cameraTestError}
                  </p>
                </div>
              )}

              {isTestingCamera && !cameraTestError && (
                <div className="absolute top-2.5 left-2.5 bg-black/70 backdrop-blur-sm px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-[3px] border border-white/10 flex items-center gap-1.5 pointer-events-none">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-pixel text-[8px] sm:text-[9px] text-white uppercase tracking-wider">
                    LIVE PREVIEW
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Photo Session Display Mode ===== */}
      <section className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-6 lg:p-7 mb-6 shadow-[3px_3px_0px_#000,6px_6px_0px_var(--pb-shadow-solid)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <h2 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm leading-relaxed uppercase">
            Photo Session Display Mode
          </h2>
          {isMobile && (
            <span className="self-start sm:self-auto font-pixel text-[8px] sm:text-[9px] text-[#FF5A36] bg-[#FF5A36]/10 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-[3px] border-[1.5px] sm:border-[2px] border-[#FF5A36]">
              LAYAR HP: FULLSCREEN
            </span>
          )}
        </div>
        <p className="font-retro text-[var(--pb-text-muted)] text-sm sm:text-base lg:text-lg mb-5 tracking-wide leading-relaxed">
          Display Mode digunakan setiap kali sesi foto dimulai dari menu Photo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {DISPLAY_MODES.map((opt) => {
            const isDisabled = isMobile && opt.value === 'default'
            const active = isMobile ? opt.value === 'fullscreen' : mode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelectMode(opt.value)}
                disabled={isDisabled}
                aria-pressed={active}
                className={`text-left rounded-[4px] border-[2px] p-4 sm:p-5 lg:p-6 transition-all duration-100 relative ${
                  isDisabled
                    ? 'opacity-35 cursor-not-allowed bg-[var(--pb-bg)] border-[var(--pb-border)] select-none'
                    : active
                    ? 'border-[#FFB800] bg-[#FF5A36]/15 shadow-[3px_3px_0px_#000,6px_6px_0px_#FFB800]'
                    : 'border-[var(--pb-border-strong)] bg-[var(--pb-bg)] shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)] hover:border-[#FFB800] hover:shadow-[4px_4px_0px_#000,8px_8px_0px_var(--pb-shadow-solid)] active:translate-x-[2px] active:translate-y-[2px]'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span
                    className={
                      isDisabled
                        ? 'text-[var(--pb-text-muted)]'
                        : active
                        ? 'text-[#FFB800]'
                        : 'text-[#FF5A36]'
                    }
                  >
                    {opt.icon}
                  </span>
                  <span
                    className={`font-pixel text-[11px] sm:text-xs leading-relaxed ${
                      isDisabled
                        ? 'text-[var(--pb-text-muted)] line-through'
                        : 'text-[var(--pb-text)]'
                    }`}
                  >
                    {opt.label}
                  </span>
                  {isDisabled ? (
                    <span className="ml-auto font-retro text-xs sm:text-sm px-2 py-0.5 rounded-[3px] bg-[var(--pb-elevated)] text-[var(--pb-text-muted)] border-[1.5px] border-[var(--pb-border-strong)]">
                      NONAKTIF
                    </span>
                  ) : active ? (
                    <span className="ml-auto font-pixel text-[8px] sm:text-[9px] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-[3px] bg-[#FF5A36] text-white border-[1.5px] sm:border-[2px] border-black shadow-[2px_2px_0px_#000]">
                      {isMobile ? 'WAJIB' : 'AKTIF'}
                    </span>
                  ) : null}
                </div>
                <p className="font-retro text-[var(--pb-text-muted)] text-xs sm:text-sm lg:text-base leading-relaxed">
                  {isDisabled
                    ? 'Mode default dinonaktifkan di HP agar tidak sempit.'
                    : opt.desc}
                </p>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default SettingsPage
