import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Camera, Check, CheckCircle2, Download, FolderOpen, ImagePlus, Printer, QrCode, RefreshCw, RotateCcw, Share2, X } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { downloadQrCardPng } from '@/utils/downloadQr'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { sessionApi } from '@/api/sessions'
import { useFolders } from '@/hooks/useFolders'
import { resolvePreviewSlots } from '@/utils/previewSlots'
import { buildTemplateOverlay, renderFinalComposite, preloadTemplateImage } from '@/utils/templateOverlay'
import { getStorageUrl } from '@/api/client'
import { downloadFile } from '@/utils/download'
import { createCameraStream } from '@/utils/cameraManager'
import { useCameraDevices } from '@/hooks/useCameraDevices'
import PrintModal from '@/components/gallery/PrintModal'
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
  const [resultPhoto, setResultPhoto] = useState<{
    id?: number
    url?: string
    qr_url?: string
    qr_link?: string
    unique_token?: string
    filename?: string
  } | null>(null)
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'saved' | 'error'>('saved')
  const [isNavigating, setIsNavigating] = useState(false)
  const syncPromiseRef = useRef<Promise<boolean> | null>(null)
  const completingRef = useRef(false)
  const [isRetaking, setIsRetaking] = useState(false)
  const [showRetakePanel, setShowRetakePanel] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)

  // ===== Folder tujuan =====
  const foldersQuery = useFolders(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const activeVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const countdownRef = useRef<number | null>(null)
  const captureTriggeredRef = useRef(false)
  const captureInFlightRef = useRef(false)
  const captureFnRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const pendingCapturesRef = useRef<Promise<any>[]>([])

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

  const localCapturesRef = useRef<Record<number, string>>({})

  // Foto hasil tiap frame (prioritaskan cache base64 lokal untuk render instan)
  const frameImages = useMemo(() => {
    const arr: (string | null)[] = Array(totalFrames).fill(null)
    for (const cap of session?.captures ?? []) {
      if (cap.status === 'retaken') continue
      const idx = cap.frame_number - 1
      if (idx >= 0 && idx < totalFrames) {
        arr[idx] = localCapturesRef.current[cap.frame_number] || cap.photo_url
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

    // Preload gambar template ke cache agar render final instan
    preloadTemplateImage(tpl.template_url)

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

  const { devices, selectedDeviceId, setSelectedDeviceId } = useCameraDevices()

  // ===== Mulai webcam =====
  const startCamera = async (preferredDeviceId?: string) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      const { stream } = await createCameraStream(preferredDeviceId)
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

  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    captureTriggeredRef.current = false
    setCountdown(null)
    setPhase('idle')
    toast.info('Hitung mundur dibatalkan.')
  }

  // ===== Remote Bluetooth Shutter & Shortcut Listener =====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && phase === 'countdown') {
        e.preventDefault()
        cancelCountdown()
        return
      }

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

  // ===== Capture — pipeline instan & non-blocking =====
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
      // Gunakan resolusi native sensor penuh kamera
      canvas.width = video.videoWidth || 1920
      canvas.height = video.videoHeight || 1080
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia')

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const base64 = canvas.toDataURL('image/jpeg', 0.95)
      const currentFrameNum = session.current_frame || 1
      localCapturesRef.current[currentFrameNum] = base64

      const isLastFrame = currentFrameNum >= totalFrames
      const nextFrameNum = isLastFrame ? totalFrames : currentFrameNum + 1

      // 1. Update UI secara instan (Optimistic UI)
      setSession((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          current_frame: nextFrameNum,
          captures: [
            ...(prev.captures || []).filter((c) => c.frame_number !== currentFrameNum),
            {
              id: Date.now(),
              session_id: prev.id,
              frame_number: currentFrameNum,
              photo_url: base64,
              photo_path: '',
              status: 'approved',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any,
          ],
        }
      })

      if (isLastFrame) {
        streamRef.current?.getTracks().forEach((track) => track.stop())
        setCameraActive(false)
        setAllDone(true)
      }

      // 2. Kirim upload ke server di background tanpa memblokir interaksi
      const uploadPromise = sessionApi.capture(session.id, base64)
        .then((result) => {
          setSession((prev) => (prev ? { ...prev, ...result.session } : result.session))
          if (result.all_done) {
            setAllDone(true)
          }
          return result
        })
        .catch((err) => {
          console.error('Background frame capture upload error:', err)
          toast.error('Gagal mengunggah foto. Coba lagi.')
        })

      pendingCapturesRef.current.push(uploadPromise)
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

    const finishSession = async () => {
      // 1. Render composite instan di client side (< 15ms)
      let finalImageBase64: string | undefined = undefined
      try {
        if (template?.template_url) {
          finalImageBase64 = await renderFinalComposite(
            template.template_url,
            previewSlots,
            frameImages,
            template.canvas_width,
            template.canvas_height
          )
        }
      } catch (e) {
        console.warn('Client render final composite fallback in fullscreen:', e)
      }

      const uniqueToken = session.session_token || String(session.id)
      const initialQrLink = `${window.location.origin}/photo/${uniqueToken}`

      // 2. INSTANT OPTIMISTIC DISPLAY: Langsung tampilkan hasil akhir seketika!
      if (finalImageBase64) {
        setResultPhoto({
          id: undefined,
          url: finalImageBase64,
          qr_url: undefined,
          qr_link: initialQrLink,
          unique_token: uniqueToken,
          filename: `PixelBooth-${(template?.name || 'Photo').replace(/[^A-Za-z0-9]/g, '')}.jpg`,
        })
      }

      setSyncStatus('syncing')

      // 3. Simpan di server di background (asynchronous) dengan auto-retry
      const syncTask = async (): Promise<boolean> => {
        try {
          if (pendingCapturesRef.current.length > 0) {
            await Promise.allSettled(pendingCapturesRef.current)
          }

          let res: any = null
          let lastError: any = null
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              res = await sessionApi.complete(session.id, {
                final_image_base64: finalImageBase64,
              })
              if (res) break
            } catch (e) {
              lastError = e
              if (attempt < 2) await new Promise((r) => setTimeout(r, 400))
            }
          }

          if (!res) throw lastError || new Error('Gagal menyimpan ke server')

          const photoData = (res.photo || {}) as any
          const finalToken = photoData.unique_token || uniqueToken
          let qrLink = photoData.qr_link || `${window.location.origin}/photo/${finalToken}`
          if (!qrLink.startsWith('http://') && !qrLink.startsWith('https://')) {
            qrLink = `${window.location.origin}${qrLink.startsWith('/') ? '' : '/'}${qrLink}`
          }
          setResultPhoto({
            id: photoData.id,
            url: photoData.url || photoData.photo_url || photoData.storage_path || finalImageBase64,
            qr_url: photoData.qr_url || photoData.qr_path || 'ready',
            qr_link: qrLink,
            unique_token: finalToken,
            filename: photoData.filename,
          })
          setSyncStatus('saved')
          queryClient.invalidateQueries({ queryKey: ['folders'] })
          queryClient.invalidateQueries({ queryKey: ['photos'] })
          return true
        } catch (err: unknown) {
          console.error('Fullscreen background complete sync error:', err)
          setSyncStatus('error')
          toast.error('Gagal mengunggah foto ke galeri. Klik Coba Lagi.')
          return false
        }
      }

      syncPromiseRef.current = syncTask()
    }

    void finishSession()
  }, [allDone, session, template, previewSlots, frameImages])

  // ===== Coba lagi sinkronisasi jika gagal =====
  const handleRetrySync = async () => {
    if (!session || !resultPhoto) return
    setSyncStatus('syncing')
    toast.info('Mencoba menyimpan ulang foto ke galeri...')
    try {
      const res = await sessionApi.complete(session.id, {
        final_image_base64: resultPhoto.url,
      })
      const photoData = (res.photo || {}) as any
      const finalToken = photoData.unique_token || resultPhoto.unique_token
      let qrLink = photoData.qr_link || resultPhoto.qr_link
      if (qrLink && !qrLink.startsWith('http://') && !qrLink.startsWith('https://')) {
        qrLink = `${window.location.origin}${qrLink.startsWith('/') ? '' : '/'}${qrLink}`
      }

      setResultPhoto((prev) =>
        prev
          ? {
              ...prev,
              id: photoData.id,
              qr_url: photoData.qr_url || photoData.qr_path || 'ready',
              qr_link: qrLink,
            }
          : prev
      )
      setSyncStatus('saved')
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      toast.success('Foto berhasil tersimpan ke galeri!')
    } catch {
      setSyncStatus('error')
      toast.error('Masih gagal menyimpan foto. Silakan cek koneksi/server.')
    }
  }

  // ===== Buka galeri (setelah selesai, tunggu sync tuntas) =====
  const handleOpenGallery = async () => {
    if (syncStatus === 'syncing' && syncPromiseRef.current) {
      setIsNavigating(true)
      toast.info('Menyelesaikan penyimpanan foto ke galeri...')
      await syncPromiseRef.current
      setIsNavigating(false)
    }
    queryClient.invalidateQueries({ queryKey: ['photos'] })
    queryClient.invalidateQueries({ queryKey: ['folders'] })
    navigate(session?.folder_id ? `/gallery?folder_id=${session.folder_id}` : '/gallery')
  }

  // ===== Selesai sesi (tunggu sync tuntas jika sedang proses) =====
  const handleFinishFullscreenSession = async () => {
    if (syncStatus === 'syncing' && syncPromiseRef.current) {
      setIsNavigating(true)
      toast.info('Menyelesaikan penyimpanan foto...')
      await syncPromiseRef.current
      setIsNavigating(false)
    }
    navigate('/photo', { replace: true })
  }

  // ===== Ulangi frame tertentu =====
  const handleRetakeFrame = async (frameIndex: number) => {
    if (!session || phase === 'countdown' || isCapturing || isRetaking) return
    setIsRetaking(true)
    try {
      completingRef.current = false
      delete localCapturesRef.current[frameIndex + 1]
      // Optimistic update
      setSession((prev) =>
        prev
          ? {
              ...prev,
              current_frame: frameIndex + 1,
              captures: (prev.captures || []).filter((c) => c.frame_number !== frameIndex + 1),
            }
          : prev
      )
      setAllDone(false)
      setResultPhoto(null)
      setShowRetakePanel(false)
      setPhase('idle')
      if (!cameraActive) {
        startCamera()
      }
      toast.info(`Kamera kembali ke Foto ${frameIndex + 1}.`)

      const updated = await sessionApi.retake(session.id, frameIndex + 1)
      setSession((prev) => (prev ? { ...prev, ...updated } : updated))
    } catch {
      toast.error('Gagal memulai pengambilan ulang.')
    } finally {
      setIsRetaking(false)
    }
  }

  // ===== Ulangi sesi dari awal (semua frame) =====
  const handleRestartSession = async () => {
    if (!session || phase === 'countdown' || isCapturing || isRetaking) return
    setIsRetaking(true)
    try {
      completingRef.current = false
      localCapturesRef.current = {}
      setSession((prev) =>
        prev
          ? {
              ...prev,
              current_frame: 1,
              captures: [],
            }
          : prev
      )
      setAllDone(false)
      setResultPhoto(null)
      setShowRetakePanel(false)
      setPhase('idle')
      if (!cameraActive) {
        startCamera()
      }
      toast.info('Sesi diulangi dari awal (Foto 1).')

      const updated = await sessionApi.restart(session.id)
      setSession((prev) => (prev ? { ...prev, ...updated } : updated))
    } catch {
      toast.error('Gagal mengulangi sesi dari awal.')
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
      <div className="flex-1 min-h-0 flex items-center justify-center p-2 sm:p-4 pb-2">
        <div
          className="relative bg-black rounded-lg overflow-hidden shadow-2xl mx-auto flex items-center justify-center"
          style={{
            aspectRatio: `${cw} / ${ch}`,
            width: `min(100%, calc((100dvh - 7rem) * ${cw} / ${ch}))`,
            maxHeight: 'calc(100dvh - 7rem)',
            maxWidth: '100%',
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
              opacity: previewSlots.length === 0 ? 1 : 0,
            }}
          />

          {/* Lapisan slot kamera: DI BELAKANG DESAIN (z-0) */}
          {previewSlots.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-0">
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
                        transform: videoTransform(slot),
                      }}
                    />
                  ) : frameImages[i] ? (
                    <img
                      src={getStorageUrl(frameImages[i])}
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

          {/* Template Desain: DI DEPAN KAMERA (z-10) — Kamera otomatis berada DI BELAKANG DESAIN */}
          {template && template.template_url && (
            <img
              src={overlayUrl || getStorageUrl(template.template_url)}
              alt={template.name}
              draggable={false}
              className="absolute inset-0 w-full h-full object-fill pointer-events-none z-10"
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

          {/* Countdown besar di tengah (z-30 agar selalu tampil di atas layer desain) */}
          {phase === 'countdown' && countdown !== null && countdown > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-black/75 backdrop-blur-sm border-2 border-white flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.8)]">
                <span
                  className="text-white font-black leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]"
                  style={{ fontSize: 'min(20vw, 5.5rem)' }}
                >
                  {countdown}
                </span>
              </div>
            </div>
          )}

          {/* Processing overlay saat capture / rendering */}
          {isCapturing && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-40 pointer-events-none">
              <div className="text-center">
                <Spinner size="lg" className="text-white mb-2 mx-auto" />
                <p className="text-white font-semibold text-sm drop-shadow-md">Memproses foto...</p>
              </div>
            </div>
          )}

          {/* Kamera tidak aktif */}
          {!cameraActive && !allDone && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center">
              <p className="text-white/90 text-sm max-w-xs">{cameraError ?? 'Kamera tidak aktif.'}</p>
              <button
                type="button"
                onClick={() => startCamera()}
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
        <div className="shrink-0 relative z-40 flex flex-col items-center justify-center gap-2 px-4 pb-1">
          {/* Panel Minimalis Ulangi Foto (Hanya Ulangi dari Awal & Foto 1..N) */}
          {showRetakePanel && (
            <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-black/95 backdrop-blur-md border border-amber-500/60 shadow-[0_0_20px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 max-w-sm w-full">
              <p className="font-pixel text-amber-400 text-xs font-bold uppercase tracking-wider self-start">
                Ulangi Foto:
              </p>

              {/* 1. Ulangi dari Awal */}
              <button
                type="button"
                onClick={handleRestartSession}
                disabled={isRetaking || phase === 'countdown' || isCapturing}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-[4px]
                  bg-amber-500 hover:bg-amber-400 text-black border border-black
                  font-retro text-sm font-bold uppercase transition-all shadow-[2px_2px_0px_#000] cursor-pointer disabled:opacity-40"
              >
                <RotateCcw size={15} className="stroke-[2.5]" />
                Ulangi dari Awal
              </button>

              {/* 2. Pilihan Ulangi Foto (Hanya foto yang sudah berhasil diambil) */}
              <div className="flex items-center gap-1.5 flex-wrap w-full">
                {Array.from({ length: totalFrames }, (_, i) => {
                  if (!frameImages[i]) return null
                  const isCurrent = i === activeFrameIndex
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleRetakeFrame(i)}
                      disabled={isRetaking || phase === 'countdown' || isCapturing || isCurrent}
                      className={`flex-1 min-w-[65px] flex items-center justify-center gap-1 py-1.5 px-2 rounded-[4px] border-[2px] font-retro text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-[#00FFCC]/20 text-[#00FFCC] border-[#00FFCC] cursor-default opacity-80'
                          : 'bg-white/10 hover:bg-amber-500 hover:text-black text-amber-300 border-amber-400'
                      }`}
                    >
                      <RotateCcw size={12} />
                      <span>Foto {i + 1}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Indikator progres minimal ===== */}
      {!allDone && (
        <div className="shrink-0 relative z-30 flex justify-center pb-1 pointer-events-none">
          <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium tracking-wide">
            Foto {activeFrameIndex + 1} / {totalFrames} (Selesai {completedCount})
          </span>
        </div>
      )}

      {/* ===== Kontrol minimalis saat sesi berlangsung (touch friendly) ===== */}
      {!allDone && (
        <div
          className="shrink-0 relative z-40 flex items-center justify-center gap-5 sm:gap-8 px-6 pt-2"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {/* Exit */}
          <button
            type="button"
            onClick={handleExit}
            aria-label="Keluar sesi"
            title="Keluar sesi"
            className="flex items-center justify-center w-14 h-14 rounded-full
              bg-white/10 active:bg-white/25 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X size={26} />
          </button>

          {/* Shutter */}
          <button
            type="button"
            onClick={startCountdown}
            disabled={!cameraActive || allDone || phase === 'countdown' || isCapturing}
            aria-label="Ambil foto"
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
              cameraActive && !allDone
                ? 'active:scale-95'
                : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <span className="absolute inset-0 rounded-full border-4 border-white" />
            <span className="w-14 h-14 rounded-full bg-white" />
          </button>

          {/* Retake Button (Saat ada foto yang sudah diambil) */}
          {completedCount > 0 && !allDone && (
            <button
              type="button"
              onClick={() => setShowRetakePanel((v) => !v)}
              aria-label="Ulangi foto"
              title="Opsi ulangi foto"
              className={`flex items-center justify-center w-14 h-14 rounded-full transition-all border-2 cursor-pointer ${
                showRetakePanel
                  ? 'bg-amber-500 border-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300'
              }`}
            >
              <RotateCcw size={22} className={isRetaking ? 'animate-spin' : ''} />
            </button>
          )}

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
      )}

      {/* ===== Overlay selesai (menggantikan tombol sesi foto dengan 6 tombol aksi) ===== */}
      {allDone && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center gap-5 p-6 overflow-y-auto animate-in fade-in">
          {resultPhoto?.url ? (
            <img
              src={getStorageUrl(resultPhoto.url)}
              alt="Foto final"
              className="max-h-[56vh] sm:max-h-[70vh] w-auto max-w-full rounded-xl shadow-2xl border border-white/10"
            />
          ) : (
            <Spinner size="lg" className="text-white" />
          )}

          {/* Opsi Retake setelah semua selesai — chip per frame + Ulangi dari Awal */}
          {showRetakePanel && resultPhoto?.url && (
            <div className="flex flex-col items-center gap-3.5 bg-black/80 border-[2px] border-amber-500/60 p-5 sm:p-6 rounded-[4px] max-w-lg w-full shadow-[4px_4px_0px_#000] animate-in fade-in zoom-in-95">
              <p className="font-pixel text-amber-300 text-xs sm:text-sm font-bold uppercase tracking-wider">
                Opsi Pengulangan Foto
              </p>

              {/* Tombol Ulangi dari Awal (Semua Frame) */}
              <button
                type="button"
                onClick={handleRestartSession}
                disabled={isRetaking}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-5 rounded-[4px]
                  bg-amber-500 hover:bg-amber-400 active:translate-x-[1px] active:translate-y-[1px] text-black border-[2px] border-black
                  font-retro text-lg sm:text-xl font-bold uppercase transition-colors disabled:opacity-40 shadow-[3px_3px_0px_#000] cursor-pointer"
              >
                {isRetaking ? <RotateCcw size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                Ulangi dari Awal (Semua Foto)
              </button>

              <div className="w-full flex items-center my-1">
                <div className="flex-grow border-t-[2px] border-white/20"></div>
                <span className="flex-shrink mx-3 font-retro text-sm text-white/70 font-bold">atau pilih foto tertentu</span>
                <div className="flex-grow border-t-[2px] border-white/20"></div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap justify-center">
                {Array.from({ length: totalFrames }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleRetakeFrame(i)}
                    disabled={isRetaking}
                    className="flex items-center gap-2 px-4 py-2 rounded-[4px]
                      bg-white/15 hover:bg-[#FF5A36] active:translate-x-[1px] active:translate-y-[1px] text-white border-[2px] border-white/40 hover:border-black
                      font-retro text-base sm:text-lg font-bold transition-all disabled:opacity-40 cursor-pointer shadow-[2px_2px_0px_#000]"
                  >
                    {isRetaking ? <RotateCcw size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                    Foto {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status Badge Sinkronisasi */}
          <div className="mb-2">
            {syncStatus === 'syncing' && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 font-retro text-sm sm:text-base font-bold shadow-[2px_2px_0px_#000]">
                <Spinner size="sm" className="text-amber-400" />
                <span>Memproses & menyimpan ke galeri...</span>
              </div>
            )}
            {syncStatus === 'saved' && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-retro text-sm sm:text-base font-bold shadow-[2px_2px_0px_#000]">
                <CheckCircle2 size={18} className="text-emerald-400 stroke-[2.5]" />
                <span>Foto 100% Tersimpan di Galeri</span>
              </div>
            )}
            {syncStatus === 'error' && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 font-retro text-sm sm:text-base font-bold shadow-[2px_2px_0px_#000]">
                <AlertTriangle size={18} className="text-red-400 stroke-[2.5]" />
                <span>Gagal menyimpan ke server</span>
                <button
                  type="button"
                  onClick={handleRetrySync}
                  className="underline hover:text-white ml-2 font-bold cursor-pointer"
                >
                  Coba Lagi
                </button>
              </div>
            )}
          </div>

          {/* 6 Tombol Aksi Utama: Unduh Foto, Print Foto, Scan QR, Buka Galeri, Ulangi, Selesai */}
          <div className="w-full max-w-3xl mx-auto flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-center gap-2.5 sm:gap-4">
            {resultPhoto?.url && (
              <Button
                variant="primary"
                size="lg"
                onClick={async () => {
                  if (resultPhoto?.url) {
                    await downloadFile(resultPhoto.url, resultPhoto.filename || 'pixelbooth-photo.jpg')
                    toast.success('Foto berhasil diunduh!')
                  }
                }}
                leftIcon={<Download size={18} className="shrink-0" />}
                className="!min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-6 sm:!text-xl"
              >
                Unduh Foto
              </Button>
            )}
            {resultPhoto?.url && (
              <Button
                variant="primary"
                size="lg"
                onClick={() => setShowPrintModal(true)}
                leftIcon={<Printer size={18} className="shrink-0 stroke-[2.5]" />}
                className="!bg-[#FF5A36] hover:!bg-[#FF7040] text-white shadow-[2px_2px_0px_#000] !min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-6 sm:!text-xl font-bold"
              >
                Print Foto
              </Button>
            )}
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowQrModal(true)}
              leftIcon={<QrCode size={18} className="shrink-0" />}
              className="bg-emerald-600 hover:bg-emerald-500 text-white !min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-6 sm:!text-xl"
            >
              Scan QR
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={isNavigating}
              onClick={handleOpenGallery}
              leftIcon={
                isNavigating ? (
                  <Spinner size="sm" className="text-[var(--pb-text)] shrink-0" />
                ) : (
                  <ImagePlus size={18} className="shrink-0" />
                )
              }
              className="!min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-7 sm:!text-xl"
            >
              {isNavigating ? 'Menyimpan...' : 'Galeri'}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setShowRetakePanel((prev) => !prev)}
              leftIcon={<RotateCcw size={18} className="shrink-0" />}
              className={showRetakePanel ? 'border-amber-500 text-amber-400 bg-amber-500/10 !min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-7 sm:!text-xl' : '!min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-7 sm:!text-xl'}
            >
              Ulangi
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={isNavigating}
              onClick={handleFinishFullscreenSession}
              leftIcon={
                isNavigating ? (
                  <Spinner size="sm" className="text-[var(--pb-text)] shrink-0" />
                ) : (
                  <Check size={18} className="shrink-0" />
                )
              }
              className="!min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-7 sm:!text-xl"
            >
              Selesai
            </Button>
          </div>
        </div>
      )}

      {/* ===== Modal Scan QR Foto ===== */}
      {showQrModal && resultPhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[var(--pb-surface)] border-[3px] border-[var(--pb-border-strong)] rounded-[4px] p-6 sm:p-8 max-w-xl w-full text-center flex flex-col items-center relative shadow-[6px_6px_0px_var(--pb-shadow-solid)] animate-in zoom-in-95">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] text-[var(--pb-text)] hover:text-white hover:bg-[#FF5A36] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* Header Title */}
            <div className="mb-4">
              <h3 className="font-pixel text-[var(--pb-text)] font-bold text-lg sm:text-xl">QR Code Foto</h3>
              <p className="font-retro text-[var(--pb-text-secondary)] text-base font-bold mt-1">
                Scan untuk melihat dan mengunduh foto Anda
              </p>
            </div>

            {/* Event Card Mockup */}
            <div className="w-[320px] sm:w-[380px] max-w-full rounded-[6px] overflow-hidden border-[3px] border-black shadow-[4px_4px_0px_#000,8px_8px_0px_var(--pb-shadow-solid)] bg-white mb-5 transition-transform hover:scale-[1.01]">
              <div className="bg-[#141416] px-4 pt-3.5 pb-3 text-center select-none overflow-hidden">
                <p className="text-zinc-400 font-pixel text-[8px] tracking-[0.18em] uppercase font-bold">
                  F O T O
                </p>
                <h4 className="text-white font-pixel text-sm font-bold tracking-[0.1em] uppercase leading-tight mt-1 truncate">
                  PIXELBOOTH
                </h4>
                <p className="text-zinc-400 font-retro text-[10px] font-bold tracking-[0.1em] uppercase mt-0.5">
                  PHOTOBOOTH
                </p>
              </div>

              <div className="px-5 pt-5 pb-4 bg-white flex flex-col items-center justify-center">
                <div className="w-full flex items-center justify-center mb-2.5">
                  <QRCodeCanvas
                    id="fullscreen-session-qr-canvas"
                    value={
                      resultPhoto.qr_link && (resultPhoto.qr_link.startsWith('http://') || resultPhoto.qr_link.startsWith('https://'))
                        ? resultPhoto.qr_link
                        : `${window.location.origin}/photo/${resultPhoto.unique_token || ''}`
                    }
                    size={280}
                    level="H"
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                    includeMargin={false}
                    className="w-48 h-48 sm:w-60 sm:h-60 aspect-square block border-[2px] border-black"
                  />
                </div>

                <div className="w-28 h-[2px] bg-zinc-300 my-2.5" />

                <p className="font-retro text-zinc-700 text-sm sm:text-base font-bold leading-tight text-center max-w-[280px]">
                  Scan untuk melihat foto Anda
                </p>
                <p className="font-pixel text-zinc-500 text-[9px] font-bold tracking-[0.1em] uppercase text-center mt-1.5">
                  PIXELBOOTH
                </p>
              </div>
            </div>

            {/* Action Buttons: Bagikan & Unduh Desain */}
            <div className="w-full grid grid-cols-2 gap-3 mb-3">
              <button
                type="button"
                title="Bagikan Link Foto"
                aria-label="Bagikan"
                onClick={async () => {
                  const rawLink = resultPhoto.qr_link || `${window.location.origin}/photo/${resultPhoto.unique_token || ''}`
                  const link = (rawLink.startsWith('http://') || rawLink.startsWith('https://'))
                    ? rawLink
                    : `${window.location.origin}${rawLink.startsWith('/') ? '' : '/'}${rawLink}`
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: 'Foto PixelBooth', url: link })
                    } catch {
                      // User cancelled
                    }
                  } else {
                    await navigator.clipboard?.writeText(link)
                    toast.success('Link foto disalin ke clipboard.')
                  }
                }}
                className="h-12 w-full rounded-[4px] bg-[var(--pb-elevated)] hover:bg-[var(--pb-border)] text-[var(--pb-text)] border-[2px] border-[var(--pb-border-strong)] flex items-center justify-center gap-2 font-retro text-base font-bold uppercase transition-all cursor-pointer shadow-[2px_2px_0px_var(--pb-shadow-solid)]"
              >
                <Share2 size={18} className="shrink-0 text-[#FF5A36]" />
                <span>Bagikan</span>
              </button>

              <button
                type="button"
                title="Unduh QR Code"
                aria-label="Unduh QR"
                onClick={async () => {
                  try {
                    await downloadQrCardPng({
                      type: 'FOTO',
                      canvasId: 'fullscreen-session-qr-canvas',
                      caption: 'Scan untuk melihat foto Anda',
                      filename: `QR-Foto-${(resultPhoto.unique_token || 'card').slice(0, 8)}.png`,
                    })
                    toast.success('Desain QR Card berhasil diunduh.')
                  } catch {
                    toast.error('Gagal mengunduh QR.')
                  }
                }}
                className="h-12 w-full rounded-[4px] bg-[#FF5A36] hover:bg-[#FF7040] shadow-[2px_2px_0px_#000] border-[2px] border-black text-white flex items-center justify-center gap-2 font-retro text-base font-bold uppercase transition-all cursor-pointer"
              >
                <Download size={18} className="shrink-0 text-white" />
                <span>Unduh QR</span>
              </button>
            </div>

            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => setShowQrModal(false)}
            >
              Tutup
            </Button>
          </div>
        </div>
      )}

      {/* Modal Print Foto */}
      {showPrintModal && resultPhoto?.url && (
        <PrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          photos={{
            id: resultPhoto.id,
            url: resultPhoto.url,
            title: resultPhoto.filename || 'Hasil Sesi Foto',
          }}
          title="Cetak Foto Hasil Sesi"
        />
      )}
    </div>
  )
}

export default FullscreenSessionPage
