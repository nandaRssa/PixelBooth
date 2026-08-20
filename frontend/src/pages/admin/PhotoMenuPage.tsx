import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Battery,
  Camera,
  Check,
  ImageIcon,
  Layers,
  Play,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CameraStatusBadge, Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { useTemplates, useHardwareStatus } from '@/hooks/useTemplates'
import { useCreateSession } from '@/hooks/useSessions'
import type { Template } from '@/types'

// ==========================================
// Photo / Photobooth Menu Page
// Pilih template secara live + status kamera via polling
// ==========================================

const PhotoMenuPage: React.FC = () => {
  const navigate = useNavigate()
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)

  const templatesQuery = useTemplates()
  const hardwareQuery = useHardwareStatus()
  const createSession = useCreateSession()

  const templates = templatesQuery.data ?? []
  const hardware = hardwareQuery.data

  const cameraConnected = hardware?.camera === 'connected'

  const handleStartSession = async () => {
    if (!selectedTemplate) return

    try {
      const session = await createSession.mutateAsync({
        templateId: selectedTemplate.id,
        folderId: null,
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
        <div className="flex items-center gap-3">
          {hardware && (
            <CameraStatusBadge status={hardware.camera} />
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={() => hardwareQuery.refetch()}
            disabled={hardwareQuery.isFetching}
            leftIcon={<RefreshCw size={16} />}
          >
            Segarkan Status
          </Button>
        </div>
      </div>

      {/* ===== Status Kamera ===== */}
      {hardwareQuery.isLoading ? (
        <div className="flex items-center gap-3 bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 mb-6">
          <Spinner size="sm" className="text-white" />
          <p className="text-[#A0A0A0] text-sm">Memeriksa status kamera...</p>
        </div>
      ) : !hardware?.bridge_online ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 mb-6 flex items-start gap-3"
        >
          <WifiOff size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-amber-400 text-sm font-medium">Hardware bridge tidak terhubung</p>
            <p className="text-[#A0A0A0] text-xs mt-0.5">
              Pastikan hardware bridge berjalan (default port 5000) dan kamera DSLR terhubung.
              Status diperbarui otomatis setiap 5 detik.
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 mb-6 flex items-start gap-3"
        >
          <Wifi size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-green-400 text-sm font-medium">Bridge online</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-[#A0A0A0]">
              <span className="flex items-center gap-1.5">
                <Camera size={13} className="text-[#606060]" />
                {hardware.camera_model ?? 'Kamera terhubung'}
              </span>
              {typeof hardware.battery_level === 'number' && (
                <span className="flex items-center gap-1.5">
                  <Battery size={13} className="text-[#606060]" />
                  {hardware.battery_level}%
                </span>
              )}
              {hardware.bluetooth_connected && (
                <span className="text-green-400">Bluetooth aktif</span>
              )}
            </div>
          </div>
          {!cameraConnected && (
            <span className="text-amber-400 text-xs flex-shrink-0">Kamera belum siap</span>
          )}
        </motion.div>
      )}

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

      {/* ===== Aksi Mulai Sesi ===== */}
      <div className="flex items-center justify-between mt-8 bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
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
          {!cameraConnected && selectedTemplate && (
            <p className="flex items-center gap-1.5 text-amber-400 text-xs mt-1.5">
              <AlertTriangle size={12} />
              Kamera belum terhubung — capture hanya berfungsi dengan hardware bridge.
            </p>
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
  )
}

export default PhotoMenuPage