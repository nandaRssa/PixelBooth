import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Camera,
  Check,
  FolderPlus,
  ImageIcon,
  Layers,
  Play,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CameraStatusBadge, Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { useTemplates, useHardwareStatus } from '@/hooks/useTemplates'
import { useFolders } from '@/hooks/useFolders'
import { useCreateSession } from '@/hooks/useSessions'
import type { Template } from '@/types'

// ==========================================
// Photo / Photobooth Menu Page
// Pilih template + mulai sesi.
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
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)

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

  const handleStartSession = async () => {
    if (!selectedTemplate) return

    try {
      const session = await createSession.mutateAsync({
        templateId: selectedTemplate.id,
        folderId: selectedFolderId,
      })
      toast.success(`Sesi dimulai dengan template "${selectedTemplate.name}".`)
      navigate(`/photo/session/${session.id}`)
    } catch {
      toast.error('Gagal memulai sesi. Coba lagi.')
    }
  }

  return (
    <div>
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Photo</h1>
          <p className="text-[#606060] text-sm mt-1">Mulai sesi pemotretan photobooth</p>
        </div>
        <CameraStatusBadge
          status={
            webcamAvailable === null ? 'checking' : webcamAvailable ? 'connected' : 'disconnected'
          }
        />
      </div>

      {/* ===== Status Sumber Kamera ===== */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium flex items-center gap-2">
              {webcamAvailable === false ? (
                <VideoOff size={16} className="text-amber-400" />
              ) : (
                <Video size={16} className="text-green-400" />
              )}
              Webcam Device (Utama)
            </p>
            <p className="text-[#606060] text-xs mt-1">
              {webcamAvailable === null
                ? 'Memeriksa kamera device...'
                : webcamAvailable
                  ? 'Kamera device terdeteksi. Capture berjalan langsung di browser.'
                  : 'Tidak ada kamera device terdeteksi. Periksa izin akses kamera.'}
            </p>
          </div>
          <span className="text-xs text-[#606060]">Sumber default</span>
        </div>

        {/* DSLR opsional */}
        {hardwareQuery.isLoading ? (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#2A2A2A]">
            <Spinner size="sm" className="text-white" />
            <p className="text-[#A0A0A0] text-xs">Memeriksa hardware bridge (DSLR)...</p>
          </div>
        ) : hardware?.bridge_online ? (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2A2A2A]">
            <p className="text-green-400 text-xs flex items-center gap-2">
              <Wifi size={14} />
              {dslrConnected
                ? `DSLR terhubung via bridge: ${hardware.camera_model ?? 'kamera'}${
                    typeof hardware.battery_level === 'number' ? ` · baterai ${hardware.battery_level}%` : ''
                  }`
                : 'Bridge online, kamera DSLR belum siap'}
            </p>
            <span className="text-xs text-[#606060]">Opsional</span>
          </div>
        ) : null}
      </div>

      {/* ===== Info Singkat ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Format yang Didukung', value: 'PNG, JPG, WEBP' },
          { label: 'Ukuran Canvas', value: 'Bebas (pixel based)' },
          { label: 'Alur Wajib', value: 'Confirm Frame Editor sebelum sesi' },
        ].map((info) => (
          <div key={info.label} className="bg-[#141414] border border-[#2A2A2A] rounded-xl px-4 py-4">
            <p className="text-[#606060] text-xs mb-1">{info.label}</p>
            <p className="text-white text-sm font-medium">{info.value}</p>
          </div>
        ))}
      </div>

      {/* ===== Aksi Mulai Sesi ===== */}
      <div className="mb-6 bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex-1 min-w-0">
            {selectedTemplate ? (
              <>
                <p className="text-white font-medium text-sm">
                  Template terpilih: {selectedTemplate.name}
                </p>
                <p className="text-[#606060] text-xs mt-0.5">
                  {selectedTemplate.frame_count} frame · {selectedTemplate.canvas_width} x {selectedTemplate.canvas_height}
                </p>
              </>
            ) : (
              <>
                <p className="text-white font-medium text-sm">Siap memotret?</p>
                <p className="text-[#606060] text-xs mt-0.5">Pilih template untuk memulai sesi baru.</p>
              </>
            )}

            {webcamAvailable === false && (
              <p className="flex items-center gap-1.5 text-amber-400 text-xs mt-1.5">
                <AlertTriangle size={12} />
                Webcam tidak terdeteksi — izinkan akses kamera di browser.
              </p>
            )}
            {dslrConnected && (
              <p className="flex items-center gap-1.5 text-[#A0A0A0] text-xs mt-1.5">
                <Camera size={12} />
                Capture akan menggunakan webcam device.
              </p>
            )}
          </div>

          {/* Pilihan folder penyimpanan */}
          <div className="w-full lg:w-72">
            <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <FolderPlus size={13} />
              Simpan Hasil ke Folder
            </label>
            {foldersQuery.isLoading ? (
              <div className="flex items-center gap-2 bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-4 py-2.5">
                <Spinner size="sm" className="text-white" />
                <span className="text-[#606060] text-sm">Memuat folder...</span>
              </div>
            ) : (
              <select
                value={selectedFolderId ?? ''}
                onChange={(e) =>
                  setSelectedFolderId(e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-3 py-2.5
                  text-white text-sm focus:outline-none focus:ring-1 focus:border-[#404040] focus:ring-white/10
                  [&>option]:bg-[#0A0A0A]"
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

          <Button
            variant="primary"
            size="lg"
            onClick={handleStartSession}
            disabled={!selectedTemplate || createSession.isPending}
            loading={createSession.isPending}
            leftIcon={<Play size={18} />}
          >
            Mulai Sesi Baru
          </Button>
        </div>
      </div>

      {/* ===== Pilih Template ===== */}
      <h2 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
        <Layers size={16} className="text-[#A0A0A0]" />
        Pilih Template
        <span className="text-[#606060] font-normal">
          {templatesQuery.isLoading ? '' : templates.length}
        </span>
      </h2>
      {templatesQuery.isLoading ? (
        <div className="flex items-center justify-center py-16 bg-[#141414] border border-[#2A2A2A] rounded-2xl">
          <Spinner size="lg" className="text-white" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-8 text-center">
          <ImageIcon size={40} className="text-[#333] mx-auto mb-3" />
          <p className="text-white font-medium mb-1">Belum ada template</p>
          <p className="text-[#606060] text-sm mb-5">
            Unggah template desain di menu Kelola Template terlebih dahulu.
          </p>
          <Button variant="outline" size="md" onClick={() => navigate('/templates')}>
            Kelola Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {templates.map((template) => {
            const isSelected = selectedTemplate?.id === template.id
            return (
              <motion.button
                key={template.id}
                type="button"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedTemplate(isSelected ? null : template)}
                className={`
                  relative aspect-[3/4] bg-[#141414] border rounded-xl overflow-hidden text-left
                  transition-colors duration-150
                  ${isSelected
                    ? 'border-white ring-2 ring-white/30'
                    : 'border-[#2A2A2A] hover:border-[#404040]'}
                `}
              >
                {template.preview_url ? (
                  <img
                    src={template.preview_url}
                    alt={template.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : template.template_url ? (
                  <img
                    src={template.template_url}
                    alt={template.name}
                    className="absolute inset-0 w-full h-full object-cover opacity-40"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#1A1A1A]">
                    <ImageIcon size={32} className="text-[#333]" />
                  </div>
                )}

                {/* Badge jumlah frame */}
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm
                  text-white text-xs font-medium">
                  {template.frame_count} frame
                </span>

                {/* Indikator terpilih */}
                {isSelected && (
                  <span className="absolute top-2 left-2 w-6 h-6 rounded-md bg-white flex items-center justify-center">
                    <Check size={14} className="text-black" />
                  </span>
                )}

                {/* Info bawah */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                  <p className="text-white text-sm font-medium truncate">{template.name}</p>
                  <p className="text-[#A0A0A0] text-xs">
                    {template.canvas_width} x {template.canvas_height}
                  </p>
                </div>
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PhotoMenuPage