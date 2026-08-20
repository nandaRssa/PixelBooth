import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Camera as CameraIcon,
  Check,
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
import type { PhotoSession } from '@/types'

// ==========================================
// Photo Capture Page — Webcam (device camera)
// Kamera device langsung; DSLR bersifat opsional
// ==========================================

type CapturePhase = 'idle' | 'countdown' | 'captured' | 'done'

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
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [resultPhoto, setResultPhoto] = useState<{ url?: string; qr_url?: string } | null>(null)

  // ===== Folder tujuan penyimpanan =====
  const [folderId, setFolderId] = useState<number | null>(null)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [isSavingFolder, setIsSavingFolder] = useState(false)
  const foldersQuery = useFolders(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const countdownRef = useRef<number | null>(null)
  const captureFnRef = useRef<() => void>(() => {})

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

  // ===== Lampirkan stream ke elemen video saat kamera aktif =====
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

  // ===== Countdown =====
  const startCountdown = () => {
    if (phase !== 'idle' || !cameraActive) return
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
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth || 1280
      canvas.height = videoRef.current.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia')

      // Mirror untuk selfie + peningkatan kecerahan (frame webcam sering gelap)
      ctx.filter = 'brightness(1.45) contrast(1.1) saturate(1.1)'
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      ctx.filter = 'none'

      const base64 = canvas.toDataURL('image/jpeg', 0.85)

      const result = await sessionApi.capture(session.id, base64)
      setSession(result.session)
      setCapturedUrl(canvas.toDataURL('image/jpeg', 0.7))
      setPhase('captured')
      toast.success(`Frame ${result.capture.frame_number} berhasil diambil.`)
    } catch {
      toast.error('Gagal mengambil foto. Coba lagi.')
    } finally {
      setIsCapturing(false)
    }
  }

  useEffect(() => {
    captureFnRef.current = doCapture
  })

  // ===== Lanjut ke frame berikutnya =====
  const handleNextFrame = async () => {
    if (!session) return
    try {
      const result = await sessionApi.nextFrame(session.id)
      setSession(result.data)
      setCapturedUrl(null)
      if (result.all_done) {
        setPhase('done')
        toast.success('Semua frame selesai!')
      } else {
        setPhase('idle')
      }
    } catch {
      toast.error('Gagal melanjutkan frame.')
    }
  }

  // ===== Retake frame =====
  const handleRetake = () => {
    setCapturedUrl(null)
    setPhase('idle')
  }

  // ===== Selesaikan sesi =====
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

  const totalFrames = session.total_frames
  const currentFrame = session.current_frame
  const template = session.template

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

          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={() => navigate('/gallery')}
              leftIcon={<ExternalLink size={16} />}
            >
              Buka Galeri
            </Button>
            <Button
              variant="primary"
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
              width: `${(phase === 'done' ? totalFrames : Math.min(currentFrame, totalFrames)) / totalFrames * 100}%`,
            }}
          />
        </div>
        <span className="text-[#A0A0A0] text-sm whitespace-nowrap">
          Frame {Math.min(currentFrame, totalFrames)} / {totalFrames}
        </span>
      </div>

      {/* ===== Camera Preview ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Video / Captured */}
        <div className="lg:col-span-2 bg-[#0D0D0D] border border-[#2A2A2A] rounded-2xl overflow-hidden relative aspect-[4/3]">
          {/* Video selalu dirender agar stream tetap terpasang */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover -scale-x-100"
            style={{ filter: 'brightness(1.45) contrast(1.1) saturate(1.1)' }}
          />

          {/* Frame overlay indicator */}
          <div className="absolute inset-4 border-2 border-white/20 rounded-xl pointer-events-none" />

          {/* Hasil frame terakhir menutupi preview */}
          {capturedUrl && phase === 'captured' && (
            <img
              src={capturedUrl}
              alt="Frame terakhir"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Kamera tidak aktif */}
          {!cameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
              <VideoOff size={36} className="text-[#333] mb-3" />
              <p className="text-[#A0A0A0] text-sm mb-4">Kamera tidak aktif</p>
              {cameraError && <p className="text-red-400 text-xs max-w-xs mb-4">{cameraError}</p>}
              <Button variant="secondary" size="md" onClick={startCamera} leftIcon={<Video size={16} />}>
                Aktifkan Kamera
              </Button>
            </div>
          )}

          {/* Countdown overlay */}
          <AnimatePresence>
            {phase === 'countdown' && countdown !== null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 flex items-center justify-center z-10"
              >
                <motion.div
                  key={countdown}
                  initial={{ scale: 1.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-28 h-28 rounded-full bg-white/10 border border-white/30 flex items-center justify-center"
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

        {/* ===== Controls ===== */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5 flex flex-col">
          {phase === 'idle' && (
            <>
              <h3 className="text-white font-semibold text-base mb-1">
                Siap untuk Frame {currentFrame}
              </h3>
              <p className="text-[#606060] text-sm mb-6">
                Posisikan subjek di dalam bingkai, lalu tekan tombol untuk memulai hitung mundur.
              </p>
              <Button
                variant="primary"
                size="xl"
                fullWidth
                onClick={startCountdown}
                disabled={!cameraActive}
                leftIcon={<CameraIcon size={20} />}
              >
                Tangkap Foto
              </Button>
              {!cameraActive && (
                <p className="text-amber-400 text-xs text-center mt-3">
                  Aktifkan kamera terlebih dahulu.
                </p>
              )}
            </>
          )}

          {phase === 'countdown' && (
            <>
              <h3 className="text-white font-semibold text-base mb-6 text-center">
                Hitung Mundur...
              </h3>
              <p className="text-[#606060] text-sm text-center">
                Siapkan pose!
              </p>
            </>
          )}

          {phase === 'captured' && (
            <>
              <h3 className="text-white font-semibold text-base mb-1">
                Frame {currentFrame} Terambil
              </h3>
              <p className="text-[#606060] text-sm mb-6">
                Foto terlihat bagus? Lanjutkan atau ulangi.
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleNextFrame}
                  leftIcon={<Check size={18} />}
                >
                  {currentFrame >= totalFrames ? 'Selesaikan Sesi' : 'Lanjut ke Frame Berikutnya'}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={handleRetake}
                  leftIcon={<RotateCcw size={18} />}
                >
                  Ulangi Foto
                </Button>
              </div>
            </>
          )}

          {phase === 'done' && (
            <>
              <h3 className="text-white font-semibold text-base mb-1">
                Semua Frame Selesai
              </h3>
              <p className="text-[#606060] text-sm mb-6">
                Foto final akan di-render sesuai template dan disimpan di galeri.
              </p>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleComplete}
                leftIcon={<Check size={18} />}
              >
                Simpan Foto Final
              </Button>
            </>
          )}

          <div className="flex-1" />

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
                disabled={isSavingFolder}
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