import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Camera as CameraIcon,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderPlus,
  ImageIcon,
  Printer,
  QrCode,
  RotateCcw,
  Share2,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { downloadQrCardPng } from '@/utils/downloadQr'
import { Button } from '@/components/ui/Button'
import { Spinner, CameraStatusBadge } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { sessionApi } from '@/api/sessions'
import { useFolders } from '@/hooks/useFolders'
import { resolvePreviewSlots } from '@/utils/previewSlots'
import { buildTemplateOverlay, renderFinalComposite, preloadTemplateImage } from '@/utils/templateOverlay'
import { getStorageUrl } from '@/api/client'
import { downloadFile } from '@/utils/download'
import { createCameraStream, getSelectedCameraId } from '@/utils/cameraManager'
import PrintModal from '@/components/gallery/PrintModal'
import type { PhotoSession } from '@/types'
import type { PreviewSlot } from '@/utils/previewSlots'

// ==========================================
// Photo Capture Page — Webcam (device camera)
// Alur: Capture → Auto Advance → Capture → ... → Selesai
// Kamera live hanya tampil di dalam bingkai frame yang aktif.
// ==========================================

type CapturePhase = 'idle' | 'countdown'

const COUNTDOWN_SECONDS = 3

const PhotoCapturePage: React.FC = () => {
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
  const [showQrModal, setShowQrModal] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [showRetakeOptions, setShowRetakeOptions] = useState(false)

  // ===== Folder tujuan penyimpanan =====
  const [folderId, setFolderId] = useState<number | null>(null)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [isSavingFolder, setIsSavingFolder] = useState(false)
  const foldersQuery = useFolders(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const activeVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const countdownRef = useRef<number | null>(null)
  const captureTriggeredRef = useRef(false)
  const captureInFlightRef = useRef(false)
  const captureFnRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const pendingCapturesRef = useRef<Promise<any>[]>([])

  // ===== Slot preview =====
  // Cerminan PhotoRenderService::resolveSlots agar preview sesuai hasil akhir
  const previewSlots = useMemo(() => {
    const tpl = session?.template
    if (!tpl) return []
    return resolvePreviewSlots(tpl, session?.total_frames ?? 0)
  }, [session?.template, session?.total_frames])

  const totalFrames = session?.total_frames ?? 0
  const template = session?.template

  // Frame aktif diambil dari pointer sesi (server). Setelah capture,
  // server otomatis memajukan current_frame → kamera berpindah sendiri.
  const activeFrameIndex = useMemo(() => {
    if (totalFrames === 0) return 0
    return Math.min(Math.max((session?.current_frame ?? 1) - 1, 0), totalFrames - 1)
  }, [session?.current_frame, totalFrames])

  const activeSlot = previewSlots[activeFrameIndex] ?? null

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

  // ===== Overlay template (desain di atas kamera, lubang foto transparan) =====
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
    buildTemplateOverlay(
      tpl.template_url,
      previewSlots,
      tpl.canvas_width,
      tpl.canvas_height
    )
      .then((url) => {
        if (!cancelled) setOverlay({ url, token: overlayToken })
      })
      .catch(() => {
        // Gagal membangun overlay -> fallback ke template mentah
        if (!cancelled) setOverlay(null)
      })

    return () => {
      cancelled = true
    }
  }, [session?.template, previewSlots, overlayToken])

  // Hanya tampilkan overlay yang dibangun untuk template & slot saat ini
  const overlayUrl = overlay && overlay.token === overlayToken ? overlay.url : null

  // ===== Auto Redirect on Mobile to Fullscreen =====
  useEffect(() => {
    if (window.innerWidth < 1024 && id) {
      navigate(`/photo/session-fs/${id}`, { replace: true })
    }
  }, [id, navigate])

  // ===== Muat sesi =====
  useEffect(() => {
    let cancelled = false
    sessionApi
      .show(Number(id))
      .then((data) => {
        if (!cancelled) {
          setSession(data)
          setFolderId(data.folder_id)
          setFolderName(data.folder?.name ?? null)
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
  const startCamera = async (preferredDeviceId?: string) => {
    try {
      // Hentikan stream lama (jika ada) sebelum membuat yang baru
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }

      const { stream } = await createCameraStream(preferredDeviceId)
      streamRef.current = stream
      setCameraActive(true)
      setCameraError(null)
    } catch {
      setCameraActive(false)
      setCameraError('Tidak dapat mengakses kamera. Izinkan akses kamera di browser.')
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

  // ===== Lampirkan stream ke video utama (sumber capture, tersembunyi) =====
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

  // ===== Lampirkan stream ke video slot frame aktif =====
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

  // ===== Countdown =====
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

  // Saat countdown mencapai 0, ambil foto TEPAT SATU KALI.
  // Pemicu capture tidak boleh berada di dalam updater setState —
  // StrictMode menjalankan updater dua kali dan memicu double-capture.
  // captureTriggeredRef mencegah pemicuan ganda; flag capture internal
  // dikelola oleh doCapture sendiri (tidak di-set di sini).
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
          // Jamin UI selalu kembali ke keadaan siap, baik capture sukses
          // maupun gagal — mencegah stuck di "Hitung Mundur".
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
      // Tidak bisa mengambil foto — kembali ke keadaan siap agar tidak stuck
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

      // Mirror untuk selfie dengan tone natural kamera
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
        // Semua frame selesai — matikan kamera, frame sudah tampil semua
        streamRef.current?.getTracks().forEach((track) => track.stop())
        setCameraActive(false)
        setAllDone(true)
        toast.success('Semua frame selesai!')
      } else {
        toast.success(`Foto ${currentFrameNum} berhasil diambil.`)
      }

      // 2. Kirim upload ke server di background
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

  const completingRef = useRef(false)

  // Auto-complete saat semua frame selesai (mode default)
  useEffect(() => {
    if (!allDone || !session || completingRef.current) return
    completingRef.current = true

    const timer = setTimeout(() => {
      void handleComplete()
    }, 400)

    return () => clearTimeout(timer)
  }, [allDone, session, template, previewSlots, frameImages])

  // ===== Retake frame tertentu =====
  const handleRetakeFrame = async (frameIndex: number) => {
    if (!session || phase === 'countdown' || isCapturing) return
    try {
      completingRef.current = false
      delete localCapturesRef.current[frameIndex + 1]
      const updated = await sessionApi.retake(session.id, frameIndex + 1)
      setSession(updated)
      setAllDone(false)
      setResultPhoto(null)
      setShowRetakeOptions(false)
      setPhase('idle')
      if (!cameraActive) {
        startCamera()
      }
      toast.info(`Kamera kembali ke Foto ${frameIndex + 1}.`)
    } catch {
      toast.error('Gagal memulai pengambilan ulang.')
    }
  }

  // ===== Ulangi sesi dari awal (semua frame) =====
  const handleRestartSession = async () => {
    if (!session || phase === 'countdown' || isCapturing) return
    try {
      completingRef.current = false
      localCapturesRef.current = {}
      const updated = await sessionApi.restart(session.id)
      setSession(updated)
      setAllDone(false)
      setResultPhoto(null)
      setShowRetakeOptions(false)
      setPhase('idle')
      if (!cameraActive) {
        startCamera()
      }
      toast.info('Sesi diulangi dari awal (Foto 1).')
    } catch {
      toast.error('Gagal mengulangi sesi dari awal.')
    }
  }

  // ===== Selesaikan sesi (render final instan & background sync) =====
  const handleComplete = async () => {
    if (!session || !template) return

    // 1. Render composite instan di client side (< 15ms)
    let finalImageBase64: string | undefined = undefined
    try {
      if (template.template_url) {
        finalImageBase64 = await renderFinalComposite(
          template.template_url,
          previewSlots,
          frameImages,
          template.canvas_width,
          template.canvas_height
        )
      }
    } catch (e) {
      console.warn('Client render final composite fallback:', e)
    }

    const uniqueToken = session.session_token || String(session.id)
    const initialQrLink = `${window.location.origin}/photo/${uniqueToken}`

    // 2. INSTANT OPTIMISTIC DISPLAY: Langsung tampilkan foto final seketika (0 ms delay)!
    if (finalImageBase64) {
      setResultPhoto({
        id: undefined,
        url: finalImageBase64,
        qr_url: undefined,
        qr_link: initialQrLink,
        unique_token: uniqueToken,
        filename: `PixelBooth-${(template.name || 'Photo').replace(/[^A-Za-z0-9]/g, '')}.jpg`,
      })
      setIsCapturing(false) // Hilangkan loading spinner secara instan
    } else {
      setIsCapturing(true)
    }

    setSyncStatus('syncing')

    // 3. Simpan di server di background (asynchronous) dengan auto-retry
    const syncTask = async (): Promise<boolean> => {
      try {
        if (pendingCapturesRef.current.length > 0) {
          await Promise.allSettled(pendingCapturesRef.current)
        }

        let result: any = null
        let lastError: any = null
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            result = await sessionApi.complete(session.id, {
              final_image_base64: finalImageBase64,
            })
            if (result) break
          } catch (e) {
            lastError = e
            if (attempt < 2) await new Promise((r) => setTimeout(r, 400))
          }
        }

        if (!result) throw lastError || new Error('Gagal menyimpan foto final ke server.')

        const photoData = (result.photo || {}) as any
        const finalToken = photoData.unique_token || uniqueToken
        let qrLink = photoData.qr_link || `${window.location.origin}/photo/${finalToken}`
        if (!qrLink.startsWith('http://') && !qrLink.startsWith('https://')) {
          qrLink = `${window.location.origin}${qrLink.startsWith('/') ? '' : '/'}${qrLink}`
        }

        // Update data permanen dari server tanpa mengganggu tampilan foto
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
        console.error('Background complete sync error:', err)
        setSyncStatus('error')
        toast.error('Gagal mengunggah foto ke galeri. Klik Coba Lagi.')
        return false
      } finally {
        setIsCapturing(false)
      }
    }

    syncPromiseRef.current = syncTask()
  }

  // ===== Coba lagi sinkronisasi jika gagal =====
  const handleRetrySync = async () => {
    if (!session || !resultPhoto) return
    setSyncStatus('syncing')
    toast.info('Mencoba menyimpan ulang foto ke galeri...')
    try {
      const result = await sessionApi.complete(session.id, {
        final_image_base64: resultPhoto.url,
      })
      const photoData = (result.photo || {}) as any
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

  // ===== Navigasi pintar ke Galeri (tunggu sync tuntas jika sedang proses) =====
  const handleGoToGallery = async () => {
    if (syncStatus === 'syncing' && syncPromiseRef.current) {
      setIsNavigating(true)
      toast.info('Menyelesaikan penyimpanan foto ke galeri...')
      await syncPromiseRef.current
      setIsNavigating(false)
    }
    queryClient.invalidateQueries({ queryKey: ['photos'] })
    queryClient.invalidateQueries({ queryKey: ['folders'] })
    navigate(folderId ? `/gallery?folder_id=${folderId}` : '/gallery')
  }

  // ===== Navigasi Selesai (tunggu sync jika masih proses) =====
  const handleFinishSession = async () => {
    if (syncStatus === 'syncing' && syncPromiseRef.current) {
      setIsNavigating(true)
      toast.info('Menyelesaikan penyimpanan foto...')
      await syncPromiseRef.current
      setIsNavigating(false)
    }
    navigate('/photo')
  }

  // ===== Ubah folder tujuan penyimpanan =====
  const handleChangeFolder = async (value: number | null) => {
    if (!session) return
    setIsSavingFolder(true)
    try {
      const updated = await sessionApi.setFolder(session.id, value)
      setSession((prev) =>
        prev ? { ...prev, folder_id: updated.folder_id, folder: updated.folder } : prev
      )
      setFolderId(updated.folder_id)
      setFolderName(updated.folder?.name ?? null)
      toast.success(value ? 'Folder tujuan diubah.' : 'Disimpan ke galeri tanpa folder.')
    } catch {
      toast.error('Gagal mengubah folder tujuan.')
    } finally {
      setIsSavingFolder(false)
    }
  }

  // ===== Batal sesi =====
  const handleCancel = async () => {
    if (!session) return
    try {
      await sessionApi.cancel(session.id)
      toast.success('Sesi dibatalkan.')
    } catch {
      // ignore
    }
    navigate('/photo', { replace: true })
  }

  // ===== Loading =====
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" className="text-pb-text" />
      </div>
    )
  }

  // ===== Error =====
  if (status === 'error' || !session) {
    return (
      <div className="bg-pb-surface border border-pb-border rounded-2xl p-10 text-center max-w-md mx-auto">
        <ImageIcon size={40} className="text-pb-faint mx-auto mb-3" />
        <h2 className="text-pb-text font-semibold text-base mb-2">Sesi tidak ditemukan</h2>
        <p className="text-pb-text-muted text-sm mb-6">
          Sesi mungkin telah berakhir atau dihapus.
        </p>
        <Button variant="secondary" size="md" onClick={() => navigate('/photo')}>
          Kembali ke Photo
        </Button>
      </div>
    )
  }

  // ===== Hasil akhir =====
  if (resultPhoto) {
    return (
      <div className="max-w-4xl mx-auto pb-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-pixel text-[var(--pb-text)] text-2xl sm:text-3xl lg:text-4xl font-bold leading-relaxed">
              Sesi Selesai!
            </h1>
            <p className="font-retro text-[var(--pb-text-muted)] text-lg sm:text-xl font-bold mt-1">
              Foto berhasil di-generate dan tersimpan di galeri.
            </p>
          </div>
        </div>

        <div className="bg-[var(--pb-surface)] border-[3px] border-[var(--pb-border-strong)] rounded-[4px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[4px_4px_0px_#000,7px_7px_0px_var(--pb-shadow-solid)]">
          {resultPhoto.url ? (
            <img
              src={getStorageUrl(resultPhoto.url)}
              alt="Foto final"
              className="max-h-[56vh] sm:max-h-[70vh] w-auto max-w-full rounded-none mb-6 border-[3px] border-white shadow-[4px_4px_0px_#000]"
            />
          ) : (
            <div className="w-24 h-24 bg-green-500/20 border-[3px] border-green-500 rounded-[4px] flex items-center justify-center mb-5 shadow-[3px_3px_0px_#000]">
              <Check size={44} className="text-green-400 stroke-[3]" />
            </div>
          )}

          <h2 className="font-pixel text-[var(--pb-text)] text-xl sm:text-2xl font-bold mb-2">
            Foto Final Berhasil Digenerate
          </h2>
          <p className="font-retro text-[var(--pb-text-secondary)] text-lg sm:text-xl font-bold mb-8 max-w-md">
            {totalFrames} frame telah selesai diambil. Foto tersimpan di galeri{folderName ? ` dalam folder "${folderName}"` : ''} dan siap dibagikan via QR.
          </p>

          {/* Opsi Ulangi Frame jika diaktifkan */}
          {showRetakeOptions && (
            <div className="mb-8 border-[2px] border-amber-500 bg-amber-500/10 rounded-[4px] p-5 sm:p-6 w-full max-w-lg shadow-[3px_3px_0px_#000] animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="font-pixel text-amber-300 text-xs sm:text-sm font-bold uppercase tracking-wider">
                  Opsi Pengulangan Foto
                </p>
              </div>

              {/* Tombol Ulangi dari Awal (Semua Frame) */}
              <button
                type="button"
                onClick={handleRestartSession}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-5 mb-4 rounded-[4px]
                  bg-amber-500 hover:bg-amber-400 active:translate-x-[1px] active:translate-y-[1px] text-black border-[2px] border-black
                  font-retro text-lg sm:text-xl font-bold uppercase tracking-wide transition-all shadow-[3px_3px_0px_#000] cursor-pointer"
              >
                <RotateCcw size={20} className="stroke-[2.5]" />
                Ulangi dari Awal (Semua Foto)
              </button>

              <div className="relative flex py-2 items-center mb-3">
                <div className="flex-grow border-t-[2px] border-amber-500/40"></div>
                <span className="flex-shrink mx-3 font-retro text-sm sm:text-base text-amber-300 font-bold">atau pilih foto tertentu</span>
                <div className="flex-grow border-t-[2px] border-amber-500/40"></div>
              </div>

              <div className="flex items-center justify-center gap-2.5 flex-wrap">
                {Array.from({ length: totalFrames }, (_, i) => (
                  <Button
                    key={i}
                    variant="secondary"
                    size="md"
                    onClick={() => handleRetakeFrame(i)}
                    leftIcon={<RotateCcw size={16} />}
                  >
                    Foto {i + 1}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Status Badge Sinkronisasi */}
          <div className="mb-6">
            {syncStatus === 'syncing' && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-retro text-sm sm:text-base font-bold shadow-[2px_2px_0px_#000]">
                <Spinner size="sm" className="text-amber-400" />
                <span>Memproses & menyimpan ke galeri...</span>
              </div>
            )}
            {syncStatus === 'saved' && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-retro text-sm sm:text-base font-bold shadow-[2px_2px_0px_#000]">
                <CheckCircle2 size={18} className="text-emerald-400 stroke-[2.5]" />
                <span>Foto 100% Tersimpan di Galeri</span>
              </div>
            )}
            {syncStatus === 'error' && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-400 font-retro text-sm sm:text-base font-bold shadow-[2px_2px_0px_#000]">
                <AlertTriangle size={18} className="text-red-400 stroke-[2.5]" />
                <span>Gagal menyimpan ke galeri server</span>
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
            {resultPhoto.url && (
              <Button
                variant="primary"
                size="lg"
                onClick={() =>
                  downloadFile(resultPhoto.url!, resultPhoto.filename || `pixelbooth-${session?.id ?? 'final'}.jpg`)
                }
                leftIcon={<Download size={18} className="shrink-0" />}
                className="!min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-6 sm:!text-xl"
              >
                Unduh Foto
              </Button>
            )}
            {resultPhoto.url && (
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
              onClick={handleGoToGallery}
              leftIcon={
                isNavigating ? (
                  <Spinner size="sm" className="text-[var(--pb-text)] shrink-0" />
                ) : (
                  <ExternalLink size={18} className="shrink-0" />
                )
              }
              className="!min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-6 sm:!text-xl"
            >
              {isNavigating ? 'Menyimpan...' : 'Galeri'}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setShowRetakeOptions((prev) => !prev)}
              leftIcon={<RotateCcw size={18} className="shrink-0" />}
              className={showRetakeOptions ? 'border-amber-500 text-amber-400 bg-amber-500/10 !min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-6 sm:!text-xl' : '!min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-6 sm:!text-xl'}
            >
              Ulangi
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={isNavigating}
              onClick={handleFinishSession}
              leftIcon={
                isNavigating ? (
                  <Spinner size="sm" className="text-[var(--pb-text)] shrink-0" />
                ) : (
                  <Check size={18} className="shrink-0" />
                )
              }
              className="!min-h-[44px] !py-2 !px-4 !text-base sm:!min-h-[54px] sm:!py-3 sm:!px-6 sm:!text-xl"
            >
              Selesai
            </Button>
          </div>
        </div>

        {/* Modal QR Code */}
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
                      id="capture-session-qr-canvas"
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
                        canvasId: 'capture-session-qr-canvas',
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

  const slotPosition = (slot: PreviewSlot) => {
    if (!template) return { inset: 0 }

    const style: React.CSSProperties = {
      left: `${(slot.x / template.canvas_width) * 100}%`,
      top: `${(slot.y / template.canvas_height) * 100}%`,
      width: `${(slot.width / template.canvas_width) * 100}%`,
      height: `${(slot.height / template.canvas_height) * 100}%`,
    }

    // Rotasi frame manual (pivot tengah)
    if (slot.rotation) {
      style.transform = `rotate(${slot.rotation}deg)`
    }

    return style
  }
  // Transform video: mirror selfie default; flip frame membalik arahnya
  const videoTransform = (slot: PreviewSlot): string => {
    const sx = slot.flip_h ? 1 : -1
    const sy = slot.flip_v ? -1 : 1
    return `scaleX(${sx}) scaleY(${sy})`
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div>
          <h1 className="font-pixel text-[var(--pb-text)] text-xl sm:text-2xl lg:text-3xl font-bold">
            Sesi Foto
          </h1>
          <p className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg font-bold mt-1">
            {template?.name ?? 'Template'} · {totalFrames} frame foto
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          {cameraActive ? (
            <CameraStatusBadge status="connected" />
          ) : (
            <CameraStatusBadge status="disconnected" />
          )}
          <Button variant="secondary" size="md" onClick={handleCancel} leftIcon={<X size={18} />}>
            Batalkan Sesi
          </Button>
        </div>
      </div>

      {/* ===== Progress frame ===== */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 h-3 bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] rounded-full overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
          <div
            className="h-full bg-gradient-to-r from-[#FF5A36] to-[#FFB800] rounded-full transition-all duration-300"
            style={{
              width: `${(allDone ? totalFrames : completedCount) / totalFrames * 100}%`,
            }}
          />
        </div>
        <span className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm whitespace-nowrap font-bold">
          Foto {allDone ? totalFrames : activeFrameIndex + 1} / {totalFrames}
        </span>
      </div>

      {/* ===== Main Content: Camera Viewport (Left) + Controls (Right) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Camera View Area */}
        <div className="lg:col-span-7 xl:col-span-8 flex items-center justify-center min-h-[50vh] p-1 sm:p-2">
          <div
            className="relative bg-black rounded-[4px] border-[3px] border-black overflow-hidden shadow-[4px_4px_0px_#000,8px_8px_0px_var(--pb-shadow-solid)] mx-auto flex items-center justify-center"
            style={{
              aspectRatio: template
                ? `${template.canvas_width} / ${template.canvas_height}`
                : '3 / 4',
              maxWidth: '100%',
              maxHeight: '74vh',
              width: template
                ? `min(100%, calc(74vh * ${template.canvas_width} / ${template.canvas_height}))`
                : 'auto',
              height: template
                ? `min(74vh, calc(100% * ${template.canvas_height} / ${template.canvas_width}))`
                : 'auto',
            }}
          >
            {/* Video utama: sumber capture */}
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
            {previewSlots.length > 0 && template && (
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
                      <div className="w-full h-full bg-black" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Template Desain */}
            {template && template.template_url && (
              <img
                src={overlayUrl || getStorageUrl(template.template_url)}
                alt={template?.name ?? 'Template'}
                draggable={false}
                className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none z-10"
              />
            )}

            {/* Highlight bingkai aktif */}
            {!allDone && cameraActive && activeSlot && (
              <div
                className="absolute pointer-events-none z-10"
                style={slotPosition(activeSlot)}
              >
                <div className="absolute inset-0 border-[3px] border-[#00FFCC] rounded-none shadow-[0_0_24px_rgba(0,255,204,0.5)] animate-pulse" />
                <span
                  className="absolute -top-3.5 left-2 bg-[#00FFCC] text-black font-pixel text-xs font-bold
                    px-2.5 py-1 rounded-[2px] shadow-[2px_2px_0px_#000]"
                >
                  Foto {activeFrameIndex + 1}
                </span>
              </div>
            )}

            {/* Kamera tidak aktif */}
            {!cameraActive && !allDone && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-20 bg-black/80">
                <VideoOff size={44} className="text-white/60 mb-3" />
                <p className="font-retro text-white text-lg sm:text-xl mb-4 font-bold">Kamera tidak aktif</p>
                {cameraError && <p className="font-retro text-red-400 text-sm max-w-xs mb-4 font-bold">{cameraError}</p>}
                <Button variant="primary" size="md" onClick={() => startCamera()} leftIcon={<Video size={18} />}>
                  Aktifkan Kamera
                </Button>
              </div>
            )}

            {/* Countdown di dalam bingkai frame */}
            <AnimatePresence>
              {phase === 'countdown' && countdown !== null && countdown > 0 && activeSlot && template && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute z-30 flex items-center justify-center pointer-events-none"
                  style={slotPosition(activeSlot)}
                >
                  <motion.div
                    key={countdown}
                    initial={{ scale: 1.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-black/80 backdrop-blur-sm border-[4px] border-[#FFB800] flex items-center justify-center shadow-[0_0_30px_rgba(255,184,0,0.8)]"
                  >
                    <span className="text-[#FFB800] font-pixel text-6xl sm:text-7xl font-bold drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]">{countdown}</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Overlay loading/proses foto */}
            {isCapturing && (
              <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-30">
                <div className="text-center">
                  <Spinner size="lg" className="text-[#FF5A36] mb-3 mx-auto" />
                  <p className="font-pixel text-white text-base sm:text-lg font-bold drop-shadow-md">Memproses foto...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls Card */}
        <div className="lg:col-span-5 xl:col-span-4 bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-5 sm:p-6 flex flex-col shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)]">
          {allDone ? (
            <>
              <h3 className="font-pixel text-[var(--pb-text)] text-base sm:text-lg font-bold mb-2">
                Semua Frame Selesai!
              </h3>
              <p className="font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-6">
                Foto final akan di-render otomatis sesuai template dan disimpan ke galeri.
              </p>
              <Button
                variant="primary"
                size="xl"
                fullWidth
                onClick={handleComplete}
                leftIcon={<Check size={24} />}
              >
                Generate Foto Final
              </Button>
            </>
          ) : phase === 'idle' ? (
            <>
              <h3 className="font-pixel text-[var(--pb-text)] text-base sm:text-lg font-bold mb-2">
                Siap untuk Foto {activeFrameIndex + 1}
              </h3>
              <p className="font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-6">
                Kamera sudah berada di dalam bingkai. Posisikan subjek sesuai bingkai, lalu tekan
                tombol untuk memulai hitung mundur.
              </p>
              <Button
                variant="primary"
                size="xl"
                fullWidth
                onClick={startCountdown}
                disabled={!cameraActive}
                leftIcon={<CameraIcon size={24} />}
              >
                Potret
              </Button>
              {!cameraActive && (
                <p className="font-retro text-amber-400 text-base font-bold text-center mt-3">
                  Aktifkan kamera terlebih dahulu.
                </p>
              )}
            </>
          ) : (
            <>
              <h3 className="font-pixel text-[var(--pb-text)] text-lg sm:text-xl font-bold mb-4 text-center">
                Hitung Mundur...
              </h3>
              <p className="font-retro text-[#FFB800] text-2xl font-bold text-center animate-bounce">
                Siapkan pose terbaik Anda!
              </p>
            </>
          )}

          <div className="flex-1" />

          {/* Status frame + retake */}
          <div className="mt-6 pt-4 border-t-[2px] border-[var(--pb-border)]">
            <div className="flex items-center justify-between mb-3">
              <p className="font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold">Status Frame</p>
              {completedCount > 0 && !allDone && (
                <button
                  type="button"
                  onClick={handleRestartSession}
                  disabled={phase === 'countdown' || isCapturing}
                  className="font-retro text-amber-400 hover:text-amber-300 text-sm sm:text-base flex items-center gap-1.5 transition-colors font-bold cursor-pointer"
                >
                  <RotateCcw size={14} />
                  Ulangi dari Awal
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: totalFrames }, (_, i) => {
                const isActive = i === activeFrameIndex && !allDone
                const hasPhoto = !!frameImages[i]
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-3.5 py-2.5 shadow-[1px_1px_0px_var(--pb-shadow-solid)]"
                  >
                    <div className="flex items-center gap-2.5">
                      {isActive ? (
                        <span className="w-3 h-3 rounded-full bg-[#00FFCC] animate-pulse border border-black" />
                      ) : hasPhoto ? (
                        <Check size={16} className="text-green-400 stroke-[3]" />
                      ) : (
                        <span className="w-3 h-3 rounded-full bg-[var(--pb-border)] border border-black" />
                      )}
                      <span className="font-retro text-[var(--pb-text)] text-base sm:text-lg font-bold">Foto {i + 1}</span>
                    </div>
                    {hasPhoto && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRetakeFrame(i)}
                        disabled={phase === 'countdown' || isCapturing}
                        leftIcon={<RotateCcw size={14} />}
                      >
                        Ulangi
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pilihan folder penyimpanan */}
          <div className="mt-6 pt-4 border-t-[2px] border-[var(--pb-border)]">
            <label className="block font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-2 flex items-center gap-2">
              <FolderPlus size={18} className="text-[#FF5A36]" />
              Simpan Hasil ke Folder
            </label>
            {foldersQuery.isLoading ? (
              <div className="flex items-center gap-2 bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-3">
                <Spinner size="sm" className="text-pb-text" />
                <span className="font-retro text-[var(--pb-text-muted)] text-base">Memuat folder...</span>
              </div>
            ) : (
              <select
                value={folderId ?? ''}
                onChange={(e) =>
                  handleChangeFolder(e.target.value === '' ? null : Number(e.target.value))
                }
                disabled={isSavingFolder || allDone}
                className="w-full bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-2.5
                  font-retro text-base sm:text-lg font-bold text-[var(--pb-text)] focus:outline-none focus:border-[#FFB800] shadow-[2px_2px_0px_var(--pb-shadow-solid)]
                  disabled:opacity-50 [&>option]:bg-[var(--pb-bg)]"
              >
                <option value="">Galeri (Tanpa Folder)</option>
                {(foldersQuery.data ?? []).map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            )}
            {folderName && (
              <p className="font-retro text-green-400 text-sm sm:text-base font-bold mt-2">
                Hasil foto akan disimpan ke: {folderName}
              </p>
            )}
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="md"
        className="mt-6"
        onClick={() => navigate('/photo')}
        leftIcon={<ArrowLeft size={18} />}
      >
        Kembali
      </Button>
    </div>
  )
}

export default PhotoCapturePage