import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Camera as CameraIcon,
  Check,
  Download,
  ExternalLink,
  FolderPlus,
  ImageIcon,
  RotateCcw,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner, CameraStatusBadge } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { sessionApi } from '@/api/sessions'
import { useFolders } from '@/hooks/useFolders'
import { resolvePreviewSlots } from '@/utils/previewSlots'
import { buildTemplateOverlay } from '@/utils/templateOverlay'
import type { PhotoSession } from '@/types'

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

  const [session, setSession] = useState<PhotoSession | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)

  const [phase, setPhase] = useState<CapturePhase>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [resultPhoto, setResultPhoto] = useState<{ url?: string; qr_url?: string } | null>(null)

  // ===== Folder tujuan penyimpanan =====
  const [folderId, setFolderId] = useState<number | null>(null)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [isSavingFolder, setIsSavingFolder] = useState(false)
  const foldersQuery = useFolders(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const activeVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const countdownRef = useRef<number | null>(null)
  const captureFnRef = useRef<() => void>(() => {})

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

  // Foto hasil tiap frame (dari capture terbaru yang disetujui server)
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
    buildTemplateOverlay(tpl.template_url, previewSlots, tpl.canvas_width, tpl.canvas_height)
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

    const tick = () => {
      setCountdown((prev) => {
        if (prev === null) return prev
        if (prev <= 1) {
          clearInterval(countdownRef.current ?? undefined)
          captureFnRef.current()
          return null
        }
        return prev - 1
      })
    }

    countdownRef.current = window.setInterval(tick, 1000)
  }

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // ===== Capture =====
  const doCapture = async () => {
    if (!session || !videoRef.current) return
    setIsCapturing(true)

    try {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia')

      // Mirror untuk selfie + peningkatan kecerahan (frame webcam sering gelap)
      ctx.filter = 'brightness(1.45) contrast(1.1) saturate(1.1)'
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      ctx.filter = 'none'

      const base64 = canvas.toDataURL('image/jpeg', 0.85)

      const result = await sessionApi.capture(session.id, base64)
      setSession(result.session)
      setPhase('idle')

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
      setIsCapturing(false)
    }
  }

  useEffect(() => {
    captureFnRef.current = doCapture
  })

  // ===== Retake frame tertentu =====
  const handleRetakeFrame = async (frameIndex: number) => {
    if (!session || phase === 'countdown' || isCapturing) return
    try {
      const updated = await sessionApi.retake(session.id, frameIndex + 1)
      setSession(updated)
      setAllDone(false)
      setPhase('idle')
      if (!cameraActive) {
        startCamera()
      }
      toast.info(`Kamera kembali ke Foto ${frameIndex + 1}.`)
    } catch {
      toast.error('Gagal memulai pengambilan ulang.')
    }
  }

  // ===== Selesaikan sesi (render final) =====
  const handleComplete = async () => {
    if (!session) return
    try {
      const result = await sessionApi.complete(session.id)
      setResultPhoto(result.photo as { url?: string; qr_url?: string })
      toast.success('Sesi selesai. Foto tersimpan di galeri.')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal menyelesaikan sesi.')
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
        <Spinner size="lg" className="text-white" />
      </div>
    )
  }

  // ===== Error =====
  if (status === 'error' || !session) {
    return (
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-10 text-center max-w-md mx-auto">
        <ImageIcon size={40} className="text-[#333] mx-auto mb-3" />
        <h2 className="text-white font-semibold text-base mb-2">Sesi tidak ditemukan</h2>
        <p className="text-[#606060] text-sm mb-6">
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
            <h1 className="text-white text-2xl font-bold">Sesi Selesai</h1>
            <p className="text-[#606060] text-sm mt-1">Foto tersimpan di galeri.</p>
          </div>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-8 flex flex-col items-center text-center">
          {resultPhoto.url ? (
            <img
              src={resultPhoto.url}
              alt="Foto final"
              className="max-h-80 w-auto max-w-full rounded-xl mb-5 border border-[#2A2A2A]"
            />
          ) : (
            <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mb-4">
              <Check size={36} className="text-green-400" />
            </div>
          )}
          <h2 className="text-white font-semibold text-lg mb-1">Sesi Selesai!</h2>
          <p className="text-[#A0A0A0] text-sm mb-6 max-w-sm">
            {totalFrames} frame telah diambil. Foto final disimpan di galeri{folderName ? ` dalam folder "${folderName}"` : ''} dan siap dibagikan via QR.
          </p>

          <div className="flex flex-col items-center gap-2 w-full max-w-xs mb-6">
            {resultPhoto.qr_url && (
              <div className="flex flex-col items-center gap-2 bg-white rounded-xl p-4">
                <img
                  src={resultPhoto.qr_url}
                  alt="QR Foto"
                  className="w-44 h-auto rounded-lg"
                />
                <p className="text-black/60 text-xs text-center">
                  Scan untuk akses foto
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {resultPhoto.url && (
              <a
                href={resultPhoto.url}
                download
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium
                  bg-white text-black hover:bg-gray-200 transition-colors"
              >
                <Download size={16} />
                Download Foto
              </a>
            )}
            <Button
              variant="secondary"
              size="md"
              onClick={() => navigate('/gallery')}
              leftIcon={<ExternalLink size={16} />}
            >
              Buka Galeri
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => navigate('/photo')}
              leftIcon={<CameraIcon size={16} />}
            >
              Sesi Baru
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const slotPosition = (slot: { x: number; y: number; width: number; height: number }) =>
    template
      ? {
          left: `${(slot.x / template.canvas_width) * 100}%`,
          top: `${(slot.y / template.canvas_height) * 100}%`,
          width: `${(slot.width / template.canvas_width) * 100}%`,
          height: `${(slot.height / template.canvas_height) * 100}%`,
        }
      : { inset: 0 }

  return (
    <div>
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Sesi Foto</h1>
          <p className="text-[#606060] text-sm mt-1">
            {template?.name ?? 'Template'} · {totalFrames} frame
          </p>
        </div>
        <div className="flex items-center gap-3">
          {cameraActive ? (
            <CameraStatusBadge status="connected" />
          ) : (
            <CameraStatusBadge status="disconnected" />
          )}
          <Button variant="secondary" size="md" onClick={handleCancel} leftIcon={<X size={16} />}>
            Batalkan Sesi
          </Button>
        </div>
      </div>

      {/* ===== Progress frame ===== */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-2 bg-[#1E1E1E] rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{
              width: `${(allDone ? totalFrames : completedCount) / totalFrames * 100}%`,
            }}
          />
        </div>
        <span className="text-[#A0A0A0] text-sm whitespace-nowrap">
          Foto {allDone ? totalFrames : activeFrameIndex + 1} / {totalFrames}
        </span>
      </div>

      {/* ===== Camera Preview ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Video / Captured */}
        <div className="lg:col-span-2 flex justify-center">
          <div
            className="relative bg-[#0D0D0D] border border-[#2A2A2A] rounded-2xl overflow-hidden"
            style={{
              aspectRatio: template
                ? `${template.canvas_width} / ${template.canvas_height}`
                : '4 / 3',
              width: template
                ? `min(100%, calc(78vh * ${template.canvas_width} / ${template.canvas_height}))`
                : '100%',
              maxHeight: '78vh',
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
                filter: 'brightness(1.45) contrast(1.1) saturate(1.1)',
                opacity: previewSlots.length === 0 ? 1 : 0,
              }}
            />

            {/* Template mentah (fallback): ditaruh di BAWAH kamera slot */}
            {!overlayUrl && template && template.template_url && (
              <img
                src={template.template_url}
                alt={template.name}
                draggable={false}
                className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
              />
            )}

            {/* Lapisan slot: kamera live (frame aktif) / foto (selesai) / hitam (pending) */}
            {previewSlots.length > 0 && template && (
              <div className="absolute inset-0 pointer-events-none">
                {previewSlots.map((slot, i) => (
                  <div key={i} className="absolute overflow-hidden" style={slotPosition(slot)}>
                    {i === activeFrameIndex && cameraActive && !allDone ? (
                      <video
                        ref={activeVideoRef}
                        playsInline
                        muted
                        autoPlay
                        className="w-full h-full object-cover -scale-x-100"
                        style={{ filter: 'brightness(1.45) contrast(1.1) saturate(1.1)' }}
                      />
                    ) : frameImages[i] ? (
                      <img
                        src={frameImages[i]}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-black" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Overlay terproses: desain template DI ATAS kamera (lubang foto transparan) */}
            {overlayUrl && (
              <img
                src={overlayUrl}
                alt={template?.name ?? 'Template'}
                draggable={false}
                className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
              />
            )}

            {/* Indikator frame aktif: outline + glow + label */}
            {!allDone && activeSlot && template && (
              <div
                className="absolute pointer-events-none"
                style={slotPosition(activeSlot)}
              >
                <div className="absolute inset-0 border-2 border-white/80 rounded-lg shadow-[0_0_24px_rgba(255,255,255,0.35)]" />
                <span
                  className="absolute -top-3 left-2 bg-white text-black text-[11px] font-semibold
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
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <VideoOff size={36} className="text-[#333] mb-3" />
                <p className="text-[#A0A0A0] text-sm mb-4">Kamera tidak aktif</p>
                {cameraError && <p className="text-red-400 text-xs max-w-xs mb-4">{cameraError}</p>}
                <Button variant="secondary" size="md" onClick={startCamera} leftIcon={<Video size={16} />}>
                  Aktifkan Kamera
                </Button>
              </div>
            )}

            {/* Countdown di dalam bingkai frame yang sedang diambil */}
            <AnimatePresence>
              {phase === 'countdown' && countdown !== null && activeSlot && template && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute z-10 flex items-center justify-center pointer-events-none"
                  style={slotPosition(activeSlot)}
                >
                  <motion.div
                    key={countdown}
                    initial={{ scale: 1.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-28 h-28 rounded-full bg-black/50 border border-white/40 flex items-center justify-center"
                  >
                    <span className="text-white text-6xl font-bold">{countdown}</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {isCapturing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                <div className="text-center">
                  <Spinner size="lg" className="text-white mb-2" />
                  <p className="text-[#A0A0A0] text-sm">Memproses foto...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== Controls ===== */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5 flex flex-col">
          {allDone ? (
            <>
              <h3 className="text-white font-semibold text-base mb-1">
                Semua Frame Selesai
              </h3>
              <p className="text-[#606060] text-sm mb-6">
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
              <h3 className="text-white font-semibold text-base mb-1">
                Siap untuk Foto {activeFrameIndex + 1}
              </h3>
              <p className="text-[#606060] text-sm mb-6">
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
              <h3 className="text-white font-semibold text-base mb-6 text-center">
                Hitung Mundur...
              </h3>
              <p className="text-[#606060] text-sm text-center">
                Siapkan pose!
              </p>
            </>
          )}

          <div className="flex-1" />

          {/* Status frame + retake */}
          <div className="mt-6 pt-4 border-t border-[#2A2A2A]">
            <p className="text-[#A0A0A0] text-xs font-medium mb-2">Status Frame</p>
            <div className="flex flex-col gap-2">
              {Array.from({ length: totalFrames }, (_, i) => {
                const isActive = i === activeFrameIndex && !allDone
                const hasPhoto = !!frameImages[i]
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      ) : hasPhoto ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-[#333]" />
                      )}
                      <span className="text-white text-sm">Foto {i + 1}</span>
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
          <div className="mt-6 pt-4 border-t border-[#2A2A2A]">
            <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <FolderPlus size={13} />
              Simpan Hasil ke Folder
            </label>
            {foldersQuery.isLoading ? (
              <div className="flex items-center gap-2 bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-3 py-2.5">
                <Spinner size="sm" className="text-white" />
                <span className="text-[#606060] text-xs">Memuat folder...</span>
              </div>
            ) : (
              <select
                value={folderId ?? ''}
                onChange={(e) =>
                  handleChangeFolder(e.target.value === '' ? null : Number(e.target.value))
                }
                disabled={isSavingFolder || allDone}
                className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-3 py-2.5
                  text-white text-sm focus:outline-none focus:ring-1 focus:border-[#404040] focus:ring-white/10
                  disabled:opacity-50 [&>option]:bg-[#0A0A0A]"
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
            <div className="mt-6 pt-4 border-t border-[#2A2A2A]">
              <p className="text-[#606060] text-xs mb-1">Template</p>
              <p className="text-white text-sm font-medium truncate">{template.name}</p>
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