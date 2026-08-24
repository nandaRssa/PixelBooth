import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Camera as CameraIcon,
  Check,
  Download,
  ExternalLink,
  FolderPlus,
  ImageIcon,
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
import { buildTemplateOverlay, renderFinalComposite } from '@/utils/templateOverlay'
import { getStorageUrl } from '@/api/client'
import { downloadFile } from '@/utils/download'
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
  const [showQrModal, setShowQrModal] = useState(false)
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
  const startCamera = async () => {
    try {
      // Hentikan stream lama (jika ada) sebelum membuat yang baru
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

  // ===== Capture =====
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
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia')

      // Mirror untuk selfie dengan tone natural kamera
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const base64 = canvas.toDataURL('image/jpeg', 0.85)
      const currentFrameNum = session.current_frame || 1
      localCapturesRef.current[currentFrameNum] = base64

      const result = await sessionApi.capture(session.id, base64)
      setSession(result.session)

      if (result.all_done) {
        // Semua frame selesai — matikan kamera, frame sudah tampil semua
        streamRef.current?.getTracks().forEach((track) => track.stop())
        setCameraActive(false)
        setAllDone(true)
        toast.success('Semua frame selesai!')
      } else {
        toast.success(`Foto ${result.capture.frame_number} berhasil diambil.`)
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

  // ===== Selesaikan sesi (render final) =====
  const handleComplete = async () => {
    if (!session || !template) return
    setIsCapturing(true)
    try {
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

      const result = await sessionApi.complete(session.id, {
        final_image_base64: finalImageBase64,
      })
      const photoData = (result.photo || {}) as any
      const uniqueToken = photoData.unique_token || session.session_token || String(session.id)
      const qrLink = photoData.qr_link || `${window.location.origin}/photo/${uniqueToken}`
      setResultPhoto({
        id: photoData.id,
        url: photoData.url || photoData.photo_url || photoData.storage_path,
        qr_url: photoData.qr_url || photoData.qr_path,
        qr_link: qrLink,
        unique_token: uniqueToken,
        filename: photoData.filename,
      })
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      toast.success('Sesi selesai. Foto tersimpan di galeri.')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal menyelesaikan sesi.')
    } finally {
      setIsCapturing(false)
    }
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
      <div className="flex items-center justify-center py-20">
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
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-pb-text text-2xl font-bold">Sesi Selesai</h1>
            <p className="text-pb-text-muted text-sm mt-1">Foto tersimpan di galeri.</p>
          </div>
        </div>

        <div className="bg-pb-surface border border-pb-border rounded-2xl p-8 flex flex-col items-center text-center">
          {resultPhoto.url ? (
            <img
              src={getStorageUrl(resultPhoto.url)}
              alt="Foto final"
              className="max-h-80 w-auto max-w-full rounded-xl mb-5 border border-pb-border shadow-xl"
            />
          ) : (
            <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mb-4">
              <Check size={36} className="text-green-400" />
            </div>
          )}
          <h2 className="text-pb-text font-semibold text-lg mb-1">Sesi Selesai!</h2>
          <p className="text-pb-text-secondary text-sm mb-6 max-w-sm">
            {totalFrames} frame telah diambil. Foto final disimpan di galeri{folderName ? ` dalam folder "${folderName}"` : ''} dan siap dibagikan via QR.
          </p>

          {/* Opsi Ulangi Frame jika diaktifkan */}
          {showRetakeOptions && (
            <div className="mb-6 border border-amber-500/20 bg-amber-500/5 rounded-2xl p-5 w-full max-w-md animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-amber-300 text-xs font-semibold uppercase tracking-wider">Opsi Pengulangan Foto</p>
              </div>

              {/* Tombol Ulangi dari Awal (Semua Frame) */}
              <button
                type="button"
                onClick={handleRestartSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 mb-3 rounded-xl
                  bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-amber-300 border border-amber-500/40
                  text-sm font-semibold transition-colors shadow-sm"
              >
                <RotateCcw size={16} />
                Ulangi dari Awal (Semua Foto)
              </button>

              <div className="relative flex py-1.5 items-center mb-2.5">
                <div className="flex-grow border-t border-amber-500/20"></div>
                <span className="flex-shrink mx-2 text-[11px] text-amber-400/60 font-medium">atau pilih foto tertentu</span>
                <div className="flex-grow border-t border-amber-500/20"></div>
              </div>

              <div className="flex items-center justify-center gap-2 flex-wrap">
                {Array.from({ length: totalFrames }, (_, i) => (
                  <Button
                    key={i}
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRetakeFrame(i)}
                    leftIcon={<RotateCcw size={13} />}
                  >
                    Foto {i + 1}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* 5 Tombol Aksi Utama: Unduh Foto, Scan QR, Buka Galeri, Ulangi, Selesai (Presisi di HP & Laptop) */}
          <div className="w-full max-w-sm sm:max-w-xl mx-auto flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
            {/* Baris 1: Unduh & QR (Di HP 2 Kolom Sejajar) */}
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:contents">
              {resultPhoto.url && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() =>
                    downloadFile(resultPhoto.url!, `pixelbooth-${session?.id ?? 'final'}.jpg`)
                  }
                  leftIcon={<Download size={15} className="shrink-0" />}
                  className="px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm min-h-[38px] sm:min-h-[48px] justify-center"
                >
                  Unduh Foto
                </Button>
              )}
              {resultPhoto.qr_url && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setShowQrModal(true)}
                  leftIcon={<QrCode size={15} className="shrink-0" />}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm min-h-[38px] sm:min-h-[48px] justify-center"
                >
                  Scan QR
                </Button>
              )}
            </div>

            {/* Baris 2: Galeri, Ulangi, Selesai (Di HP 3 Kolom Sejajar) */}
            <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:contents">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['photos'] })
                  queryClient.invalidateQueries({ queryKey: ['folders'] })
                  navigate(folderId ? `/gallery?folder_id=${folderId}` : '/gallery')
                }}
                leftIcon={<ExternalLink size={15} className="shrink-0" />}
                className="px-2 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm min-h-[38px] sm:min-h-[48px] justify-center"
              >
                <span className="truncate">Galeri</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowRetakeOptions((prev) => !prev)}
                leftIcon={<RotateCcw size={15} className="shrink-0" />}
                className={`px-2 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm min-h-[38px] sm:min-h-[48px] justify-center ${
                  showRetakeOptions ? 'border-amber-500 text-amber-400 bg-amber-500/10' : ''
                }`}
              >
                Ulangi
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => navigate('/photo')}
                leftIcon={<Check size={15} className="shrink-0" />}
                className="px-2 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm min-h-[38px] sm:min-h-[48px] justify-center"
              >
                Selesai
              </Button>
            </div>
          </div>
        </div>

        {/* Modal QR Code */}
        {showQrModal && resultPhoto && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3.5 sm:p-4 animate-in fade-in">
            <div className="bg-pb-surface border border-pb-border rounded-3xl p-5 sm:p-7 max-w-sm sm:max-w-md w-full text-center flex flex-col items-center relative shadow-2xl animate-in zoom-in-95">
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 right-4 text-pb-text-muted hover:text-pb-text transition-colors p-1.5 rounded-xl hover:bg-pb-surface-hover"
              >
                <X size={20} />
              </button>

              {/* Header Title */}
              <div className="mb-3.5">
                <h3 className="text-pb-text font-bold text-lg sm:text-xl">QR Code Foto</h3>
                <p className="text-pb-text-secondary text-xs mt-1">
                  Scan untuk melihat dan mengunduh foto Anda
                </p>
              </div>

              {/* Event Card Mockup (Compact & Balanced) */}
              <div className="w-[250px] sm:w-[270px] max-w-full rounded-2xl overflow-hidden shadow-2xl border border-pb-border bg-white mb-3.5 transition-transform hover:scale-[1.01]">
                {/* Header Hitam */}
                <div className="bg-[#141416] px-3 pt-3 pb-2 text-center select-none">
                  <p className="text-zinc-400 text-[8px] font-bold tracking-[0.3em] uppercase">
                    F O T O
                  </p>
                  <h4 className="text-white text-sm sm:text-base font-black tracking-[0.2em] uppercase leading-tight mt-0.5">
                    P I X E L B O O T H
                  </h4>
                  <p className="text-zinc-400 text-[7px] font-medium tracking-[0.2em] uppercase mt-0.5">
                    P H O T O B O O T H
                  </p>
                </div>

                {/* Body Putih dengan QR Canvas */}
                <div className="px-3 pt-3 pb-2.5 bg-white flex flex-col items-center justify-center">
                  <div className="w-full flex items-center justify-center mb-1.5">
                    <QRCodeCanvas
                      id="capture-session-qr-canvas"
                      value={resultPhoto.qr_link || `${window.location.origin}/photo/${resultPhoto.unique_token || ''}`}
                      size={240}
                      level="H"
                      bgColor="#FFFFFF"
                      fgColor="#000000"
                      includeMargin={false}
                      className="w-36 h-36 sm:w-40 sm:h-40 aspect-square block"
                    />
                  </div>

                  <div className="w-16 h-[1px] bg-zinc-200 my-1.5" />

                  <p className="text-zinc-600 text-[10px] font-medium leading-tight text-center max-w-[210px]">
                    Scan untuk melihat foto Anda
                  </p>
                  <p className="text-zinc-400 text-[7px] font-bold tracking-[0.2em] uppercase text-center mt-1">
                    P I X E L B O O T H
                  </p>
                </div>
              </div>

              {/* Action Buttons: Bagikan & Unduh Desain (Icon-only on Mobile & iPad, Icon+Text on Desktop) */}
              <div className="w-[260px] sm:w-[280px] max-w-full grid grid-cols-2 gap-2.5 mb-2">
                <button
                  type="button"
                  title="Bagikan Link Foto"
                  aria-label="Bagikan"
                  onClick={async () => {
                    const link = resultPhoto.qr_link || `${window.location.origin}/photo/${resultPhoto.unique_token || ''}`
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
                  className="h-11 w-full rounded-xl bg-pb-surface-hover hover:bg-pb-border text-pb-text border border-pb-border flex items-center justify-center gap-2 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <Share2 size={18} className="shrink-0 text-pb-text-secondary" />
                  <span className="hidden lg:inline">Bagikan</span>
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
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-[#FF5A36] via-[#FF7836] to-[#FF9836] hover:brightness-105 shadow-md shadow-orange-500/20 text-white flex items-center justify-center gap-2 text-xs font-semibold transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <Download size={18} className="shrink-0 text-white" />
                  <span className="hidden lg:inline">Unduh QR</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-[260px] sm:w-[280px] max-w-full py-2.5 rounded-xl bg-pb-surface-hover text-pb-text-secondary text-xs font-semibold hover:text-pb-text transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
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
    <div className="max-w-6xl mx-auto pb-8">
      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-pb-text text-xl sm:text-2xl font-bold">Sesi Foto</h1>
          <p className="text-pb-text-muted text-xs sm:text-sm mt-0.5">
            {template?.name ?? 'Template'} · {totalFrames} frame
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {cameraActive ? (
            <CameraStatusBadge status="connected" />
          ) : (
            <CameraStatusBadge status="disconnected" />
          )}
          <Button variant="secondary" size="sm" onClick={handleCancel} leftIcon={<X size={15} />}>
            Batalkan Sesi
          </Button>
        </div>
      </div>

      {/* ===== Progress frame ===== */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-2 bg-pb-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-pb-accent rounded-full transition-all duration-300"
            style={{
              width: `${(allDone ? totalFrames : completedCount) / totalFrames * 100}%`,
            }}
          />
        </div>
        <span className="text-pb-text-secondary text-xs sm:text-sm whitespace-nowrap font-medium">
          Foto {allDone ? totalFrames : activeFrameIndex + 1} / {totalFrames}
        </span>
      </div>

      {/* ===== Main Content: Camera Viewport (Left) + Controls (Right) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Camera View Area */}
        <div className="lg:col-span-7 xl:col-span-8 flex items-center justify-center min-h-[50vh] p-1 sm:p-2">
          <div
            className="relative bg-black rounded-2xl overflow-hidden shadow-2xl mx-auto flex items-center justify-center"
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
            {/* Video utama: sumber capture — selalu tersembunyi.
                Kamera selama sesi hanya tampil di dalam bingkai frame aktif. */}
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

            {/* Template Desain: DI DEPAN KAMERA (z-10) — Kamera otomatis berada DI BELAKANG DESAIN */}
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
                <div className="absolute inset-0 border-2 border-white/80 rounded-lg shadow-[0_0_24px_rgba(255,255,255,0.35)]" />
                <span
                  className="absolute -top-3 left-2 bg-white text-black text-[10px] font-bold
                    px-2 py-0.5 rounded-md shadow"
                >
                  Foto {activeFrameIndex + 1}
                </span>
              </div>
            )}

            {/* Fallback darurat tanpa template: kamera penuh + bingkai */}
            {previewSlots.length === 0 && (
              <>
                <div className="absolute inset-4 border-2 border-white/20 rounded-xl pointer-events-none" />
                {frameImages[0] && (
                  <img
                    src={frameImages[0]}
                    alt="Frame terakhir"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </>
            )}

            {/* Kamera tidak aktif */}
            {!cameraActive && !allDone && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 z-20">
                <VideoOff size={36} className="text-white/60 mb-3" />
                <p className="text-white/80 text-sm mb-4 font-medium">Kamera tidak aktif</p>
                {cameraError && <p className="text-red-400 text-xs max-w-xs mb-4">{cameraError}</p>}
                <Button variant="secondary" size="md" onClick={startCamera} leftIcon={<Video size={16} />}>
                  Aktifkan Kamera
                </Button>
              </div>
            )}

            {/* Countdown di dalam bingkai frame yang sedang diambil (teks putih kontras) */}
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
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-black/75 backdrop-blur-sm border-2 border-white flex items-center justify-center shadow-2xl"
                  >
                    <span className="text-white text-5xl sm:text-6xl font-black drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]">{countdown}</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Overlay loading/proses foto dengan teks putih kontras */}
            {isCapturing && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-30">
                <div className="text-center">
                  <Spinner size="lg" className="text-white mb-2 mx-auto" />
                  <p className="text-white font-semibold text-sm drop-shadow-md">Memproses foto...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls Card */}
        <div className="lg:col-span-5 xl:col-span-4 bg-pb-surface border border-pb-border rounded-2xl p-4 sm:p-5 flex flex-col shadow-xs">
          {allDone ? (
            <>
              <h3 className="text-pb-text font-semibold text-base mb-1">
                Semua Frame Selesai
              </h3>
              <p className="text-pb-text-muted text-sm mb-6">
                Foto final akan di-render sesuai template dan disimpan di galeri.
              </p>
              <Button
                variant="primary"
                size="xl"
                fullWidth
                onClick={handleComplete}
                leftIcon={<Check size={20} />}
              >
                Generate Foto Final
              </Button>
            </>
          ) : phase === 'idle' ? (
            <>
              <h3 className="text-pb-text font-semibold text-base mb-1">
                Siap untuk Foto {activeFrameIndex + 1}
              </h3>
              <p className="text-pb-text-muted text-sm mb-6">
                Kamera sudah berada di dalam bingkai. Posisikan subjek sesuai bingkai, lalu tekan
                tombol untuk memulai hitung mundur.
              </p>
              <Button
                variant="primary"
                size="xl"
                fullWidth
                onClick={startCountdown}
                disabled={!cameraActive}
                leftIcon={<CameraIcon size={20} />}
              >
                Potret
              </Button>
              {!cameraActive && (
                <p className="text-amber-400 text-xs text-center mt-3">
                  Aktifkan kamera terlebih dahulu.
                </p>
              )}
            </>
          ) : (
            <>
              <h3 className="text-pb-text font-semibold text-base mb-6 text-center">
                Hitung Mundur...
              </h3>
              <p className="text-pb-text-muted text-sm text-center">
                Siapkan pose!
              </p>
            </>
          )}

          <div className="flex-1" />

          {/* Status frame + retake */}
          <div className="mt-6 pt-4 border-t border-pb-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-pb-text-secondary text-xs font-medium">Status Frame</p>
              {completedCount > 0 && !allDone && (
                <button
                  type="button"
                  onClick={handleRestartSession}
                  disabled={phase === 'countdown' || isCapturing}
                  className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-1 transition-colors font-medium"
                >
                  <RotateCcw size={12} />
                  Ulangi dari Awal
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {Array.from({ length: totalFrames }, (_, i) => {
                const isActive = i === activeFrameIndex && !allDone
                const hasPhoto = !!frameImages[i]
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-pb-bg border border-pb-border rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      ) : hasPhoto ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-pb-border-light" />
                      )}
                      <span className="text-pb-text text-sm">Foto {i + 1}</span>
                    </div>
                    {hasPhoto && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRetakeFrame(i)}
                        disabled={phase === 'countdown' || isCapturing}
                        leftIcon={<RotateCcw size={13} />}
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
          <div className="mt-6 pt-4 border-t border-pb-border">
            <label className="block text-pb-text-secondary text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <FolderPlus size={13} />
              Simpan Hasil ke Folder
            </label>
            {foldersQuery.isLoading ? (
              <div className="flex items-center gap-2 bg-pb-bg border border-pb-border rounded-lg px-3 py-2.5">
                <Spinner size="sm" className="text-pb-text" />
                <span className="text-pb-text-muted text-xs">Memuat folder...</span>
              </div>
            ) : (
              <select
                value={folderId ?? ''}
                onChange={(e) =>
                  handleChangeFolder(e.target.value === '' ? null : Number(e.target.value))
                }
                disabled={isSavingFolder || allDone}
                className="w-full bg-pb-bg border border-pb-border rounded-lg px-3 py-2.5
                  text-pb-text text-sm focus:outline-none focus:ring-1 focus:border-pb-border-strong focus:ring-white/10
                  disabled:opacity-50 [&>option]:bg-pb-bg"
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
              <p className="text-green-400 text-xs mt-1.5">
                Hasil foto akan disimpan ke: {folderName}
              </p>
            )}
          </div>

          {/* Template info */}
          {template && (
            <div className="mt-6 pt-4 border-t border-pb-border">
              <p className="text-pb-text-muted text-xs mb-1">Template</p>
              <p className="text-pb-text text-sm font-medium truncate">{template.name}</p>
            </div>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="md"
        className="mt-4"
        onClick={() => navigate('/photo')}
        leftIcon={<ArrowLeft size={16} />}
      >
        Kembali
      </Button>
    </div>
  )
}

export default PhotoCapturePage