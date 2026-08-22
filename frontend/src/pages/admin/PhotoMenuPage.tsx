import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  FolderPlus,
  ImageIcon,
  Layers,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CameraStatusBadge, Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { useTemplates, useHardwareStatus } from '@/hooks/useTemplates'
import { getStorageUrl } from '@/api/client'
import { useFolders } from '@/hooks/useFolders'
import { useCreateSession } from '@/hooks/useSessions'
import { getSessionDisplayMode } from '@/utils/sessionDisplay'
import type { Template } from '@/types'

// ==========================================
// Photo / Photobooth Menu Page
// Pilih template -> langsung mulai sesi.
// Sumber kamera utama: webcam device (browser).
// DSLR via hardware bridge bersifat opsional.
// ==========================================

// Hook sederhana untuk memeriksa ketersediaan kamera device
function useWebcamAvailability() {
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          if (!cancelled) setAvailable(false)
          return
        }
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) {
          setAvailable(devices.some((d) => d.kind === 'videoinput'))
        }
      } catch {
        if (!cancelled) setAvailable(false)
      }
    }

    check()

    return () => {
      cancelled = true
    }
  }, [])

  return available
}

const PhotoMenuPage: React.FC = () => {
  const navigate = useNavigate()
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [startingTemplateId, setStartingTemplateId] = useState<number | null>(null)

  const templatesQuery = useTemplates()
  const foldersQuery = useFolders(null)
  const hardwareQuery = useHardwareStatus()
  const createSession = useCreateSession()

  const webcamAvailable = useWebcamAvailability()
  // Hanya template yang sudah dikonfirmasi di Frame Editor yang bisa dipakai
  const templates = (templatesQuery.data ?? []).filter((t) => t.status === 'active')
  const folders = foldersQuery.data ?? []
  const hardware = hardwareQuery.data

  const dslrConnected = hardware?.camera === 'connected'

  const handleSelectTemplate = async (template: Template) => {
    if (startingTemplateId) return
    setStartingTemplateId(template.id)

    try {
      const session = await createSession.mutateAsync({
        templateId: template.id,
        folderId: selectedFolderId,
      })
      toast.success(`Sesi dimulai dengan template "${template.name}".`)

      const mode = getSessionDisplayMode()
      if (mode === 'fullscreen') {
        navigate(`/photo/session-fs/${session.id}`)
      } else {
        navigate(`/photo/session/${session.id}`)
      }
    } catch {
      toast.error('Gagal memulai sesi. Coba lagi.')
      setStartingTemplateId(null)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-pb-text text-2xl font-bold">Photo</h1>
          <p className="text-pb-text-muted text-sm mt-1">Pilih template untuk langsung memulai sesi pemotretan</p>
        </div>
        <CameraStatusBadge
          status={
            webcamAvailable === null ? 'checking' : webcamAvailable ? 'connected' : 'disconnected'
          }
        />
      </div>

      {/* ===== Status Sumber Kamera ===== */}
      <div className="bg-pb-surface border border-pb-border rounded-xl p-4 mb-6 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-pb-text text-sm font-medium flex items-center gap-2">
              {webcamAvailable === false ? (
                <VideoOff size={16} className="text-amber-400" />
              ) : (
                <Video size={16} className="text-green-400" />
              )}
              Webcam Device (Utama)
            </p>
            <p className="text-pb-text-muted text-xs mt-1">
              {webcamAvailable === null
                ? 'Memeriksa kamera device...'
                : webcamAvailable
                  ? 'Kamera device terdeteksi. Capture berjalan langsung di browser.'
                  : 'Tidak ada kamera device terdeteksi. Periksa izin akses kamera.'}
            </p>
          </div>
          <span className="text-xs text-pb-text-muted">Sumber default</span>
        </div>

        {/* DSLR opsional */}
        {hardwareQuery.isLoading ? (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-pb-border">
            <Spinner size="sm" className="text-pb-text" />
            <p className="text-pb-text-secondary text-xs">Memeriksa hardware bridge (DSLR)...</p>
          </div>
        ) : hardware?.bridge_online ? (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-pb-border">
            <p className="text-green-400 text-xs flex items-center gap-2">
              <Wifi size={14} />
              {dslrConnected
                ? `DSLR terhubung via bridge: ${hardware.camera_model ?? 'kamera'}${
                    typeof hardware.battery_level === 'number' ? ` · baterai ${hardware.battery_level}%` : ''
                  }`
                : 'Bridge online, kamera DSLR belum siap'}
            </p>
            <span className="text-xs text-pb-text-muted">Opsional</span>
          </div>
        ) : null}
      </div>

      {/* ===== Pilihan Folder Tujuan ===== */}
      <div className="mb-6 bg-pb-surface border border-pb-border rounded-2xl p-5 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-pb-text font-medium text-sm">Target Penyimpanan</p>
          <p className="text-pb-text-muted text-xs mt-0.5">Pilih folder galeri tujuan sebelum memilih template foto.</p>

          {webcamAvailable === false && (
            <p className="flex items-center gap-1.5 text-amber-400 text-xs mt-1.5">
              <AlertTriangle size={12} />
              Webcam tidak terdeteksi — izinkan akses kamera di browser.
            </p>
          )}
        </div>

        <div className="w-full sm:w-72">
          <label className="block text-pb-text-secondary text-xs font-medium mb-1.5 flex items-center gap-1.5">
            <FolderPlus size={13} />
            Simpan Hasil ke Folder
          </label>
          {foldersQuery.isLoading ? (
            <div className="flex items-center gap-2 bg-pb-bg border border-pb-border rounded-lg px-4 py-2.5">
              <Spinner size="sm" className="text-pb-text" />
              <span className="text-pb-text-muted text-sm">Memuat folder...</span>
            </div>
          ) : (
            <select
              value={selectedFolderId ?? ''}
              onChange={(e) =>
                setSelectedFolderId(e.target.value === '' ? null : Number(e.target.value))
              }
              className="w-full bg-pb-bg border border-pb-border rounded-lg px-3 py-2.5
                text-pb-text text-sm focus:outline-none focus:ring-1 focus:border-pb-border-strong focus:ring-white/10
                [&>option]:bg-pb-bg"
            >
              <option value="">Galeri (Tanpa Folder)</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ===== Daftar Template (scroll area) ===== */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        <h2 className="text-pb-text text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers size={16} className="text-pb-text-secondary" />
          Pilih Template
          <span className="text-pb-text-muted font-normal">
            {templatesQuery.isLoading ? '' : templates.length}
          </span>
        </h2>
        {templatesQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 bg-pb-surface border border-pb-border rounded-2xl">
            <Spinner size="lg" className="text-pb-text" />
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-pb-surface border border-pb-border rounded-2xl p-8 text-center">
            <ImageIcon size={40} className="text-pb-faint mx-auto mb-3" />
            <p className="text-pb-text font-medium mb-1">Belum ada template</p>
            <p className="text-pb-text-muted text-sm mb-5">
              Unggah template desain di menu Kelola Template terlebih dahulu.
            </p>
            <Button variant="outline" size="md" onClick={() => navigate('/templates')}>
              Kelola Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
            {templates.map((template) => {
              const isStarting = startingTemplateId === template.id
              return (
                <motion.button
                  key={template.id}
                  type="button"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={startingTemplateId ? {} : { y: -4, scale: 1.02 }}
                  whileTap={startingTemplateId ? {} : { scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  onClick={() => handleSelectTemplate(template)}
                  disabled={!!startingTemplateId}
                  className="relative aspect-[3/4] bg-pb-surface border border-pb-border hover:border-[#FF5A36] rounded-xl overflow-hidden text-left shadow-xs hover:shadow-xl transition-all duration-200 group disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {template.preview_url ? (
                    <img
                      src={getStorageUrl(template.preview_url)}
                      alt={template.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : template.template_url ? (
                    <img
                      src={getStorageUrl(template.template_url)}
                      alt={template.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-pb-elevated">
                      <ImageIcon size={24} className="text-pb-faint" />
                    </div>
                  )}

                  {/* Loading Overlay jika card sedang diklik */}
                  {isStarting && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-1.5 z-10">
                      <Spinner size="md" className="text-white" />
                      <span className="text-white text-[10px] sm:text-xs font-medium">Memuat Sesi...</span>
                    </div>
                  )}

                  {/* Badge jumlah frame */}
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-md
                    text-white text-[9px] sm:text-[10px] font-medium border border-white/10 shadow-md">
                    {template.frame_count} f
                  </span>

                  {/* Info bawah */}
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-2.5 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
                    <p className="text-white text-[11px] sm:text-xs font-semibold truncate leading-tight">{template.name}</p>
                    <p className="text-white/70 text-[9px] sm:text-[10px] mt-0.5">
                      {template.canvas_width} x {template.canvas_height}
                    </p>
                  </div>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default PhotoMenuPage