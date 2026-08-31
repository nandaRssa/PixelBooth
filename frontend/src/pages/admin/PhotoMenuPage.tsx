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
import TemplatePreviewModal from '@/components/template/TemplatePreviewModal'
import type { Template } from '@/types'

// ==========================================
// Photo / Photobooth Menu Page
// Pilih template -> preview template -> mulai sesi.
// Sumber kamera utama: webcam device (browser).
// DSLR via hardware bridge bersifat opsional.
// ==========================================

import { CameraSelector } from '@/components/camera/CameraSelector'
import { useCameraDevices } from '@/hooks/useCameraDevices'


const PhotoMenuPage: React.FC = () => {
  const navigate = useNavigate()
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [startingTemplateId, setStartingTemplateId] = useState<number | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)

  const templatesQuery = useTemplates()
  const foldersQuery = useFolders(null)
  const hardwareQuery = useHardwareStatus()
  const createSession = useCreateSession()

  const { devices, isLoading: isCameraLoading, hasPermission } = useCameraDevices()
  const cameraAvailable = devices.length > 0 && hasPermission !== false
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
      setPreviewTemplate(null)

      const mode = getSessionDisplayMode()
      if (mode === 'fullscreen' || window.innerWidth < 1024) {
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
    <div className="flex flex-col w-full pb-12">
      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-6 shrink-0">
        <div className="min-w-0">
          <h1 className="font-pixel text-[var(--pb-text)] text-lg sm:text-xl lg:text-2xl leading-relaxed">Photo</h1>
          <p className="font-retro text-[var(--pb-text-muted)] text-lg sm:text-xl font-bold mt-1 tracking-wide">
            Pilih template untuk memulai sesi pemotretan
          </p>
        </div>
        <div className="self-start sm:self-auto shrink-0">
          <CameraStatusBadge
            status={
              isCameraLoading ? 'checking' : cameraAvailable ? 'connected' : 'disconnected'
            }
          />
        </div>
      </div>

      {/* ===== Selector & Status Kamera ===== */}
      <div className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 mb-4 shrink-0 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-retro text-[var(--pb-text)] text-lg sm:text-xl flex items-center gap-2 truncate uppercase tracking-wider font-bold">
              {!cameraAvailable && !isCameraLoading ? (
                <VideoOff size={18} className="text-amber-400 shrink-0" />
              ) : (
                <Video size={18} className="text-[#22C55E] shrink-0" />
              )}
              <span>Sumber Kamera Aktif</span>
            </p>
            <p className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg mt-1 truncate sm:whitespace-normal">
              {isCameraLoading
                ? '>> Memindai perangkat kamera...'
                : cameraAvailable
                  ? `>> ${devices.length} kamera terdeteksi. Siap untuk sesi foto.`
                  : '>> ERROR: Kamera tidak ditemukan atau izin belum diberikan.'}
            </p>
          </div>

          <div className="shrink-0 w-full sm:w-auto">
            <CameraSelector compact />
          </div>
        </div>

        {/* DSLR optional bridge status */}
        {hardware?.bridge_online && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t-[2px] border-dashed border-[var(--pb-border)]">
            <p className="font-retro text-[#22C55E] text-base sm:text-lg flex items-center gap-2 uppercase tracking-wide font-bold">
              <Wifi size={16} />
              {dslrConnected
                ? `DSLR Bridge: ${hardware.camera_model ?? 'kamera'}`
                : 'DSLR Bridge online'}
            </p>
            <span className="font-pixel text-[10px] text-[var(--pb-text-muted)]">DSLR</span>
          </div>
        )}
      </div>

      {/* ===== Folder Tujuan ===== */}
      <div className="mb-5 sm:mb-6 bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-5 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)]">
        <div className="min-w-0">
          <p className="font-pixel text-[var(--pb-text)] text-[10px] sm:text-xs leading-relaxed flex items-center gap-2">
            <FolderPlus size={16} className="text-[#FF5A36]" />
            TARGET FOLDER GALERI
          </p>
          <p className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg mt-1">
            Pilih folder tujuan sebelum memilih template.
          </p>
        </div>

        <div className="w-full sm:w-72 shrink-0">
          {foldersQuery.isLoading ? (
            <div className="flex items-center gap-2 bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-2.5">
              <Spinner size="sm" className="text-[var(--pb-text)]" />
              <span className="font-retro text-[var(--pb-text-muted)] text-lg">Memuat...</span>
            </div>
          ) : (
            <select
              value={selectedFolderId ?? ''}
              onChange={(e) =>
                setSelectedFolderId(e.target.value === '' ? null : Number(e.target.value))
              }
              className="w-full bg-[var(--pb-bg)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] px-4 py-2.5
                font-retro text-[var(--pb-text)] text-lg sm:text-xl tracking-wider
                focus:outline-none focus:border-[#FFB800]
                shadow-[2px_2px_0px_var(--pb-shadow-solid)]
                [&>option]:bg-[var(--pb-bg)]"
            >
              <option value="">[ Galeri - Tanpa Folder ]</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ===== Daftar Template (Full Page Scroll) ===== */}
      <div className="w-full pb-8">
        <h2 className="text-[var(--pb-text)] text-xs sm:text-sm font-pixel mb-3 flex items-center gap-2">
          <Layers size={16} className="text-[#FF5A36]" />
          <span>PILIH TEMPLATE</span>
          <span className="text-[var(--pb-text-muted)] font-retro text-base sm:text-lg font-normal ml-1">
            ({templatesQuery.isLoading ? '...' : templates.length})
          </span>
        </h2>
        {templatesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 bg-pb-surface border border-pb-border rounded-2xl">
            <Spinner size="lg" className="text-pb-text" />
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-pb-surface border border-pb-border rounded-2xl p-6 text-center">
            <ImageIcon size={36} className="text-pb-faint mx-auto mb-2" />
            <p className="text-pb-text font-medium text-sm mb-1">Belum ada template</p>
            <p className="text-pb-text-muted text-xs mb-4">
              Unggah template desain di menu Kelola Template terlebih dahulu.
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate('/templates')}>
              Kelola Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-4 lg:gap-5">
            {templates.map((template) => {
              const isStarting = startingTemplateId === template.id
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setPreviewTemplate(template)}
                  disabled={!!startingTemplateId}
                  className="relative aspect-[3/4]
                    bg-[var(--pb-surface)]
                    border-[3px] border-white
                    rounded-none overflow-hidden text-left
                    shadow-[3px_3px_0px_#000,6px_6px_0px_var(--pb-shadow-solid)]
                    cursor-pointer
                    transition-all
                    duration-150 ease-out
                    hover:border-[#FF5A36]
                    hover:shadow-[5px_5px_0px_#000,10px_10px_0px_var(--pb-shadow-solid)]
                    hover:-translate-x-1 hover:-translate-y-1
                    active:translate-x-1 active:translate-y-1
                    active:shadow-[1px_1px_0px_var(--pb-shadow-solid)]
                    disabled:opacity-60 disabled:cursor-not-allowed
                    group"
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
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--pb-elevated)]">
                      <ImageIcon size={24} className="text-[var(--pb-faint)]" />
                    </div>
                  )}

                  {/* Scanline overlay */}
                  <div
                    className="absolute inset-0 pointer-events-none z-[1]"
                    style={{
                      background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)',
                    }}
                  />

                  {/* Loading overlay */}
                  {isStarting && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-1.5 z-10">
                      <Spinner size="md" className="text-[#FF5A36]" />
                      <span className="font-pixel text-white text-[8px] leading-relaxed">LOADING...</span>
                    </div>
                  )}

                  {/* Frame count badge */}
                  <span className="absolute top-1 right-1 sm:top-2 sm:right-2 font-pixel text-white text-[7px] sm:text-[9px] md:text-[10px] px-1 py-0.5 sm:px-2 sm:py-1 rounded-none bg-black/90 border border-[#FF5A36] shadow-[1px_1px_0px_#000] sm:shadow-[2px_2px_0px_#000] z-[2]">
                    x{template.frame_count}
                  </span>

                  {/* Bottom info — hidden on mobile so it doesn't obstruct the template design, visible on sm+, fades out on hover */}
                  <div className="hidden sm:block absolute bottom-0 left-0 right-0 p-2 sm:p-2.5 bg-black/55 border-t-[2px] border-[#FF5A36] z-[2] transition-opacity duration-150 group-hover:opacity-0">
                    <p className="font-retro text-white text-base sm:text-lg truncate leading-tight font-bold">{template.name}</p>
                    <p className="font-retro pb-size-text font-bold text-xs sm:text-sm mt-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                      {template.canvas_width}x{template.canvas_height} px
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== Template Preview Modal (Slide & 1 Action Button) ===== */}
      <TemplatePreviewModal
        template={previewTemplate}
        templates={templates}
        onSelectTemplate={setPreviewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUseTemplate={handleSelectTemplate}
        isLoading={startingTemplateId !== null}
      />
    </div>
  )
}

export default PhotoMenuPage