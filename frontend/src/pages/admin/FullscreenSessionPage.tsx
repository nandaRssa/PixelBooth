import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, ImagePlus, RefreshCw, RotateCcw, X } from 'lucide-react'
import { Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { sessionApi } from '@/api/sessions'
import { useFolders } from '@/hooks/useFolders'
import { resolvePreviewSlots } from '@/utils/previewSlots'
import { buildTemplateOverlay } from '@/utils/templateOverlay'
import type { PhotoSession } from '@/types'
import type { PreviewSlot } from '@/utils/previewSlots'

// ==========================================
// PIXELBOOTH — Fullscreen Session Page
// Layout photobooth khusus: template + live camera memenuhi viewport.
// Mesin capture identik dengan PhotoCapturePage (frame config, filter,
// mirror, overlay) — hanya cara tampilnya yang berbeda. UI minimal:
// shutter, exit, pilih folder. Tanpa navbar/header/editor.
// ==========================================

type CapturePhase = 'idle' | 'countdown'

const COUNTDOWN_SECONDS = 3

const FullscreenSessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [session, setSession] = useState<PhotoSession | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)

  const [phase, setPhase] = useState<CapturePhase>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [resultPhoto, setResultPhoto] = useState<{ url?: string } | null>(null)
  const completingRef = useRef(false)
  const [isRetaking, setIsRetaking] = useState(false)
  const [showRetakePanel, setShowRetakePanel] = useState(false)

  // ===== Folder tujuan =====
  const foldersQuery = useFolders(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const activeVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const countdownRef = useRef<number | null>(null)
  const captureTriggeredRef = useRef(false)
  const captureInFlightRef = useRef(false)
  const captureFnRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // ===== Slot preview — sama dengan PhotoRenderService::resolveSlots =====
  const previewSlots = useMemo(() => {
    const tpl = session?.template
    if (!tpl) return []
    return resolvePreviewSlots(tpl, session?.total_frames ?? 0)
  }, [session?.template, session?.total_frames])

  const totalFrames = session?.total_frames ?? 0
  const template = session?.template

  const activeFrameIndex = useMemo(() => {
    if (totalFrames === 0) return 0
    return Math.min(Math.max((session?.current_frame ?? 1) - 1, 0), totalFrames - 1)
  }, [session?.current_frame, totalFrames])

  // Foto hasil tiap frame dari server
  const frameImages = useMemo(() => {
    const arr: (string | null)[] = Array(totalFrames).fill(null)
    for (const cap of session?.captures ?? []) {
      if (cap.status === 'retaken') continue
      const idx = cap.frame_number - 1
      if (idx >= 0 && idx < totalFrames) {
        arr[idx] = cap.photo_url
      }
    }
    return arr
  }, [session?.captures, totalFrames])

  const completedCount = frameImages.filter(Boolean).length

  // ===== Overlay template (desain di atas kamera, lubang transparan) =====
  const [overlay, setOverlay] = useState<{ url: string; token: string } | null>(null)

  const overlayToken = useMemo(() => {
    const tpl = session?.template
    if (!tpl || previewSlots.length === 0) return ''
    return `${tpl.id}-${tpl.updated_at ?? ''}-${JSON.stringify(previewSlots)}`
  }, [session?.template, previewSlots])

  useEffect(() => {
    const tpl = session?.template
    if (!tpl || !tpl.template_url || previewSlots.length === 0) return

    let cancelled = false
    buildTemplateOverlay(tpl.template_url, previewSlots, tpl.canvas_width, tpl.canvas_height)
      .then((url) => {
        if (!cancelled) setOverlay({ url, token: overlayToken })
      })
      .catch(() => {
        if (!cancelled) setOverlay(null)
      })

    return () => {
      cancelled = true
    }
  }, [session?.template, previewSlots, overlayToken])

  const overlayUrl = overlay && overlay.token === overlayToken ? overlay.url : null

  // ===== Muat sesi =====
  useEffect(() => {
    let cancelled = false
    sessionApi
      .show(Number(id))
      .then((data) => {
        if (!cancelled) {
          setSession(data)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [id])

  // ===== Mulai webcam =====
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraActive(true)
      setCameraError(null)
    } catch {
      setCameraActive(false)
      setCameraError('Kamera tidak dapat diakses. Izinkan akses kamera di browser.')
    }
  }

  useEffect(() => {
    if (status === 'ready') {
      startCamera()
    }
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [status])

  // Lampirkan stream ke video utama (sumber capture, tersembunyi)
  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (cameraActive && video && stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }
      video.play().catch(() => {})
    }
  }, [cameraActive])

  // Lampirkan stream ke video slot frame aktif
  useEffect(() => {
    const video = activeVideoRef.current
    const stream = streamRef.current
    if (cameraActive && video && stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }
      video.play().catch(() => {})
    }
  }, [cameraActive, phase, activeFrameIndex, previewSlots])

  // ===== Countdown & capture trigger =====
  const startCountdown = () => {
    if (phase !== 'idle' || !cameraActive || allDone) return
    setPhase('countdown')
    setCountdown(COUNTDOWN_SECONDS)

    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }
    countdownRef.current = window.setInterval(() => {
      setCountdown((prev) => (prev === null ? prev : prev - 1))
    }, 1000)
  }

  // ===== Remote Bluetooth Shutter Listener =====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.code === 'Space' ||
          e.code === 'Enter' ||
          e.code === 'AudioVolumeUp' ||
          e.code === 'PageDown') &&
        phase === 'idle' &&
        cameraActive &&
        !allDone
      ) {
        if (e.code === 'Space' || e.code === 'PageDown') {
          e.preventDefault()
        }
        startCountdown()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, cameraActive, allDone])

  // Capture tepat satu kali saat countdown habis (guard StrictMode double-run)
  useEffect(() => {
    if (phase !== 'countdown' || countdown === null || countdown > 0) return

    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }

    if (!captureTriggeredRef.current) {
      captureTriggeredRef.current = true
      captureFnRef
        .current()
        .catch(() => {})
        .finally(() => {
          captureTriggeredRef.current = false
          setPhase('idle')
        })
    }
  }, [phase, countdown])

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // ===== Capture — pipeline identik dengan mode Default =====
  const doCapture = async () => {
    if (!session || !videoRef.current) {
      setPhase('idle')
      return
    }
    if (captureInFlightRef.current) return
    captureInFlightRef.current = true
    setIsCapturing(true)

    try {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia')

      ctx.filter = 'brightness(1.45) contrast(1.1) saturate(1.1)'
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      ctx.filter = 'none'

      const base64 = canvas.toDataURL('image/jpeg', 0.85)

      const result = await sessionApi.capture(session.id, base64)
      setSession(result.session)

      if (result.all_done) {
        streamRef.current?.getTracks().forEach((track) => track.stop())
        setCameraActive(false)
        setAllDone(true)
      }
    } catch {
      toast.error('Gagal mengambil foto. Coba lagi.')
    } finally {
      captureInFlightRef.current = false
      setIsCapturing(false)
      setPhase('idle')
    }
  }

  useEffect(() => {
    captureFnRef.current = doCapture
  })

  // ===== Auto-complete saat semua frame selesai → foto final tersimpan =====
  useEffect(() => {
    if (!allDone || !session || completingRef.current) return
    completingRef.current = true
    sessionApi
      .complete(session.id)
      .then((res) => {
        setResultPhoto(res.photo as { url?: string })
        toast.success('Sesi selesai! Foto tersimpan di galeri.')
      })
      .catch(() => {
        toast.error('Gagal menyelesaikan sesi.')
      })
  }, [allDone, session])

  // ===== Ulangi frame tertentu =====
  const handleRetakeFrame = async (frameIndex: number) => {
    if (!session || phase === 'countdown' || isCapturing || isRetaking) return
    setIsRetaking(true)
    try {
      const updated = await sessionApi.retake(session.id, frameIndex + 1)
      setSession(updated)
      setAllDone(false)
      setResultPhoto(null)
      completingRef.current = false
      setShowRetakePanel(false)
      setPhase('idle')
      if (!cameraActive) {
        startCamera()
      }
    } catch {
      toast.error('Gagal memulai pengambilan ulang.')
    } finally {
      setIsRetaking(false)
    }
  }

  // ===== Ubah folder tujuan =====
  const handleChangeFolder = async (value: number | null) => {
    if (!session) return
    try {
      await sessionApi.setFolder(session.id, value)
      toast.success(value ? 'Folder tujuan diubah.' : 'Disimpan ke galeri.')
    } catch {
      toast.error('Gagal mengubah folder tujuan.')
    }
  }

  // ===== Keluar / batalkan sesi =====
  const handleExit = async () => {
    if (!allDone && session) {
      try {
        await sessionApi.cancel(session.id)
      } catch {
        // ignore
      }
    }
    navigate('/photo', { replace: true })
  }

  // ===== Buka galeri (setelah selesai) =====
  const handleOpenGallery = () => {
    queryClient.invalidateQueries({ queryKey: ['photos'] })
    queryClient.invalidateQueries({ queryKey: ['folders'] })
    navigate(session?.folder_id ? `/gallery?folder_id=${session.folder_id}` : '/gallery')
  }

  // ===== Posisi & transform slot — rumus sama dengan mode Default =====
  const slotPosition = (slot: PreviewSlot): React.CSSProperties => {
    if (!template) return {}

    const style: React.CSSProperties = {
      left: `${(slot.x / template.canvas_width) * 100}%`,
      top: `${(slot.y / template.canvas_height) * 100}%`,
      width: `${(slot.width / template.canvas_width) * 100}%`,
      height: `${(slot.height / template.canvas_height) * 100}%`,
    }

    if (slot.rotation) {
      style.transform = `rotate(${slot.rotation}deg)`
    }

    return style
  }

  const videoTransform = (slot: PreviewSlot): string => {
    const sx = slot.flip_h ? 1 : -1
    const sy = slot.flip_v ? -1 : 1
    return `scaleX(${sx}) scaleY(${sy})`
  }

  // ===== Loading =====
  if (status === 'loading') {
    return (
      <div className="fixed inset-0 z-[80] bg-black flex items-center justify-center">
        <Spinner size="lg" className="text-white" />
      </div>
    )
  }

  // ===== Error =====
  if (status === 'error' || !session) {
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white/70 text-sm">Sesi tidak ditemukan atau sudah berakhir.</p>
        <button
          type="button"
          onClick={() => navigate('/photo', { replace: true })}
          className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
        >
          Kembali
        </button>
      </div>
    )
  }

  const cw = template?.canvas_width ?? 4
  const ch = template?.canvas_height ?? 3

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col overflow-hidden select-none">
      {/* ===== Area Template (maksimal, tengah, aspect ratio terjaga) ===== */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-5 pb-2">
        <div
          className="relative bg-black rounded-lg overflow-hidden shadow-2xl"
          style={{
            aspectRatio: `${cw} / ${ch}`,
            width: `min(100%, calc((100dvh - 8rem) * ${cw} / ${ch}))`,
            maxHeight: '100%',
          }}
        >
          {/* Video utama: sumber capture — tersembunyi */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
            style={{
              filter: 'brightness(1.45) contrast(1.1) saturate(1.1)',
              opacity: previewSlots.length === 0 ? 1 : 0,
            }}
          />

          {/* Template mentah (fallback di bawah kamera) */}
          {!overlayUrl && template?.template_url && (
            <img
              src={template.template_url}
              alt={template.name}
              draggable={false}
              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
            />
          )}

          {/* Lapisan slot: live camera / foto jadi / hitam */}
          {previewSlots.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {previewSlots.map((slot, i) => (
                <div key={i} className="absolute overflow-hidden" style={slotPosition(slot)}>
                  {i === activeFrameIndex && cameraActive && !allDone ? (
                    <video
                      ref={activeVideoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover"
                      style={{
                        filter: 'brightness(1.45) contrast(1.1) saturate(1.1)',
                        transform: videoTransform(slot),
                      }}
                    />
                  ) : frameImages[i] ? (
                    <img
                      src={frameImages[i]}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-full object-cover"
                      style={{
                        transform: `scaleX(${slot.flip_h ? -1 : 1}) scaleY(${slot.flip_v ? -1 : 1})`,
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-900" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Overlay terproses di atas kamera */}
          {overlayUrl && (
            <img
              src={overlayUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
            />
          )}

          {/* Indikator frame aktif */}
          {!allDone && cameraActive && previewSlots[activeFrameIndex] && (
            <div
              className="absolute pointer-events-none"
              style={slotPosition(previewSlots[activeFrameIndex])}
            >
              <div className="absolute inset-0 border-2 border-white/80 rounded-lg shadow-[0_0_24px_rgba(255,255,255,0.35)]" />
            </div>
          )}

          {/* Fallback tanpa frame config */}
          {previewSlots.length === 0 && (
            <div className="absolute inset-4 border-2 border-white/20 rounded-xl pointer-events-none" />
          )}

          {/* Countdown besar di tengah */}
          {phase === 'countdown' && countdown !== null && countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                className="text-white font-bold leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
                style={{ fontSize: 'min(24vw, 9rem)' }}
              >
                {countdown}
              </span>
            </div>
          )}

          {/* Flash putih saat capture */}
          {isCapturing && <div className="absolute inset-0 bg-white animate-pulse" />}

          {/* Kamera tidak aktif */}
          {!cameraActive && !allDone && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center">
              <p className="text-white/90 text-sm max-w-xs">{cameraError ?? 'Kamera tidak aktif.'}</p>
              <button
                type="button"
                onClick={startCamera}
                aria-label="Aktifkan kamera"
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20
                  text-white text-sm font-medium transition-colors min-h-[48px]"
              >
                <RefreshCw size={16} />
                Coba Lagi
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== Retake panel minimalis (muncul saat ada frame selesai & belum allDone) ===== */}
      {completedCount > 0 && !allDone && (
        <div className="shrink-0 flex items-center justify-center gap-2 px-4 pb-1">
          {/* Toggle button */}
          <button
            type="button"
            onClick={() => setShowRetakePanel((v) => !v)}
            aria-label="Ulangi foto"
            title="Ulangi foto"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              showRetakePanel
                ? 'bg-white/20 text-white'
                : 'bg-white/10 hover:bg-white/15 text-white/70'
            }`}
          >
            <RotateCcw size={12} />
            Ulangi
          </button>

          {/* Chip tiap frame yang sudah difoto */}
          {showRetakePanel &&
            Array.from({ length: totalFrames }, (_, i) => {
              const hasPhoto = !!frameImages[i]
              if (!hasPhoto) return null
              const isBusy = isRetaking || phase === 'countdown' || isCapturing
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleRetakeFrame(i)}
                  disabled={isBusy}
                  aria-label={`Ulangi foto ${i + 1}`}
                  title={`Ulangi foto ${i + 1}`}
                  className="flex items-center justify-center w-9 h-9 rounded-full
                    bg-white/15 hover:bg-amber-400/30 active:bg-amber-400/50
                    text-white text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isRetaking ? <RotateCcw size={14} className="animate-spin" /> : i + 1}
                </button>
              )
            })}
        </div>
      )}

      {/* ===== Indikator progres minimal ===== */}
      {!allDone && (
        <div className="shrink-0 flex justify-center pb-1 pointer-events-none">
          <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium tracking-wide">
            {completedCount} / {totalFrames}
          </span>
        </div>
      )}

      {/* ===== Kontrol minimalis (touch friendly) ===== */}
      <div
        className="shrink-0 flex items-center justify-center gap-6 sm:gap-10 px-6 pt-2"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Exit */}
        <button
          type="button"
          onClick={handleExit}
          aria-label="Keluar sesi"
          title="Keluar sesi"
          className="flex items-center justify-center w-14 h-14 rounded-full
            bg-white/10 active:bg-white/25 hover:bg-white/20 text-white transition-colors"
        >
          <X size={26} />
        </button>

        {/* Shutter */}
        <button
          type="button"
          onClick={startCountdown}
          disabled={!cameraActive || allDone || phase === 'countdown' || isCapturing}
          aria-label="Ambil foto"
          className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-transform ${
            cameraActive && !allDone
              ? 'active:scale-95'
              : 'opacity-40 cursor-not-allowed'
          }`}
        >
          <span className="absolute inset-0 rounded-full border-4 border-white" />
          <span className="w-14 h-14 rounded-full bg-white" />
        </button>

        {/* Folder — icon + native select overlay (ramah touchscreen) */}
        <div className="relative">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full
              bg-white/10 text-white pointer-events-none"
            aria-hidden
          >
            <FolderOpen size={24} />
          </div>
          <select
            value={session.folder_id ?? ''}
            onChange={(e) => handleChangeFolder(e.target.value === '' ? null : Number(e.target.value))}
            disabled={false}
            aria-label="Pilih folder penyimpanan"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [&>option]:bg-neutral-900 [&>option]:text-white"
          >
            <option value="" className="bg-neutral-900 text-white">Galeri (Tanpa Folder)</option>
            {(foldersQuery.data ?? []).map((f) => (
              <option key={f.id} value={f.id} className="bg-neutral-900 text-white">
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== Overlay selesai (minimal) ===== */}
      {allDone && (
        <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center gap-6 p-6">
          {resultPhoto?.url ? (
            <img
              src={resultPhoto.url}
              alt="Foto final"
              className="max-h-[55vh] w-auto max-w-full rounded-xl shadow-2xl"
            />
          ) : (
            <Spinner size="lg" className="text-white" />
          )}

          {/* Retake setelah semua selesai — chip per frame */}
          {resultPhoto?.url && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-white/80 text-xs font-medium">Ulangi frame tertentu?</p>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {Array.from({ length: totalFrames }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleRetakeFrame(i)}
                    disabled={isRetaking}
                    aria-label={`Ulangi foto ${i + 1}`}
                    className="flex items-center justify-center w-11 h-11 rounded-full
                      bg-white/10 hover:bg-amber-400/30 active:bg-amber-400/50
                      text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRetaking ? <RotateCcw size={14} className="animate-spin" /> : i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleOpenGallery}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-pb-accent text-pb-on-accent
                text-sm font-medium hover:opacity-85 transition-opacity min-h-[52px]"
            >
              <ImagePlus size={18} />
              Lihat Galeri
            </button>
            <button
              type="button"
              onClick={() => navigate('/photo', { replace: true })}
              className="px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white
                text-sm font-medium transition-colors min-h-[52px]"
            >
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default FullscreenSessionPage
