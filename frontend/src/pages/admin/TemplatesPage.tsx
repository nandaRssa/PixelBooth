import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Layers, Plus, Trash2, Upload, ImageIcon, FileImage, X } from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EmptyState, Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { useTemplates, useCreateTemplate, useDeleteTemplate } from '@/hooks/useTemplates'
import type { Template } from '@/types'

// ==========================================
// Templates Management Page
// Upload, list, dan hapus template pemotretan
// ==========================================

interface UploadForm {
  name: string
  canvas_width: string
  canvas_height: string
  frame_count: string
  frame_configuration: string
}

const EMPTY_FORM: UploadForm = {
  name: '',
  canvas_width: '1080',
  canvas_height: '1920',
  frame_count: '1',
  frame_configuration: '',
}

const TemplatesPage: React.FC = () => {
  const templatesQuery = useTemplates()
  const createTemplate = useCreateTemplate()
  const deleteTemplate = useDeleteTemplate()

  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [form, setForm] = useState<UploadForm>(EMPTY_FORM)
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)

  const templateInputRef = useRef<HTMLInputElement>(null)
  const previewInputRef = useRef<HTMLInputElement>(null)

  const templates = templatesQuery.data ?? []

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, kind: 'template' | 'preview') => {
    const file = e.target.files?.[0] ?? null
    if (kind === 'template') setTemplateFile(file)
    else setPreviewFile(file)
  }

  const setField = (field: keyof UploadForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const openUpload = () => {
    setForm(EMPTY_FORM)
    setTemplateFile(null)
    setPreviewFile(null)
    setIsUploadOpen(true)
  }

  const handleUpload = async () => {
    if (!templateFile) {
      toast.error('Pilih file template terlebih dahulu.')
      return
    }

    const width = Number(form.canvas_width)
    const height = Number(form.canvas_height)
    const frames = Number(form.frame_count)

    if (!form.name.trim()) {
      toast.error('Nama template wajib diisi.')
      return
    }
    if (!width || width < 100 || !height || height < 100) {
      toast.error('Ukuran canvas minimal 100px.')
      return
    }
    if (!frames || frames < 1 || frames > 10) {
      toast.error('Jumlah frame antara 1 sampai 10.')
      return
    }

    // Validasi JSON frame configuration jika diisi
    let frameConfig: string | null = null
    if (form.frame_configuration.trim()) {
      try {
        JSON.parse(form.frame_configuration)
        frameConfig = form.frame_configuration.trim()
      } catch {
        toast.error('Frame configuration bukan JSON yang valid.')
        return
      }
    }

    try {
      await createTemplate.mutateAsync({
        name: form.name.trim(),
        template_file: templateFile,
        preview_file: previewFile,
        canvas_width: width,
        canvas_height: height,
        frame_count: frames,
        frame_configuration: frameConfig,
      })
      toast.success('Template berhasil diunggah.')
      setIsUploadOpen(false)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal mengunggah template.')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteTemplate.mutateAsync(deleteTarget.id)
      toast.success('Template berhasil dihapus.')
      setDeleteTarget(null)
    } catch {
      toast.error('Gagal menghapus template.')
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Kelola Template</h1>
          <p className="text-[#606060] text-sm mt-1">Upload dan kelola template pemotretan</p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={openUpload}
          leftIcon={<Upload size={16} />}
        >
          Upload Template
        </Button>
      </div>

      {/* ===== Info ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Format yang Didukung', value: 'PNG, JPG, WEBP' },
          { label: 'Ukuran Canvas', value: 'Bebas (pixel based)' },
          { label: 'Max Frame', value: '10 frame per template' },
        ].map((info) => (
          <div key={info.label} className="bg-[#141414] border border-[#2A2A2A] rounded-xl px-4 py-4">
            <p className="text-[#606060] text-xs mb-1">{info.label}</p>
            <p className="text-white text-sm font-medium">{info.value}</p>
          </div>
        ))}
      </div>

      {/* ===== Template List ===== */}
      {templatesQuery.isLoading ? (
        <div className="flex items-center justify-center py-20 bg-[#141414] border border-[#2A2A2A] rounded-2xl">
          <Spinner size="lg" className="text-white" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl">
          <EmptyState
            icon={<Layers size={48} />}
            title="Belum ada template"
            description="Upload template desain dari Canva atau program desain lainnya. Template akan digunakan saat sesi pemotretan."
            action={
              <Button variant="outline" size="md" onClick={openUpload} leftIcon={<Upload size={16} />}>
                Upload Template
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {templates.map((template) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="group relative aspect-[3/4] bg-[#141414] border border-[#2A2A2A] rounded-xl overflow-hidden"
            >
              {template.preview_url ? (
                <img
                  src={template.preview_url}
                  alt={template.name}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : template.template_url ? (
                <img
                  src={template.template_url}
                  alt={template.name}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover opacity-40"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[#1A1A1A]">
                  <ImageIcon size={32} className="text-[#333]" />
                </div>
              )}

              <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm
                text-white text-xs font-medium">
                {template.frame_count} frame
              </span>

              <button
                type="button"
                onClick={() => setDeleteTarget(template)}
                className="absolute top-2 left-2 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm
                  text-[#A0A0A0] hover:text-red-400 hover:bg-black/80 transition-colors
                  opacity-0 group-hover:opacity-100"
                title="Hapus Template"
              >
                <Trash2 size={14} />
              </button>

              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-white text-sm font-medium truncate">{template.name}</p>
                <p className="text-[#A0A0A0] text-xs">
                  {template.canvas_width} x {template.canvas_height}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ===== Upload Modal ===== */}
      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} title="Upload Template" size="lg">
        <div className="space-y-4">
          {/* Nama */}
          <div>
            <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">Nama Template</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Contoh: Classic Strip 3 Frame"
              className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-4 py-2.5
                text-white text-sm placeholder:text-[#404040]
                focus:outline-none focus:ring-1 focus:border-[#404040] focus:ring-white/10 transition-colors"
            />
          </div>

          {/* File Template */}
          <div>
            <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">
              File Template <span className="text-red-400">*</span>
            </label>
            <input
              ref={templateInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e, 'template')}
            />
            <button
              type="button"
              onClick={() => templateInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-[#2A2A2A] rounded-lg px-4 py-6
                text-[#A0A0A0] hover:text-white hover:border-[#404040] hover:bg-white/5 transition-colors"
            >
              {templateFile ? (
                <>
                  <FileImage size={18} className="text-green-400" />
                  <span className="text-sm">{templateFile.name}</span>
                  <span className="text-xs text-[#606060]">
                    ({(templateFile.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  <span className="text-sm">Pilih file template (PNG/JPG/WEBP, maks 20 MB)</span>
                </>
              )}
            </button>
          </div>

          {/* File Preview (opsional) */}
          <div>
            <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">Preview (opsional)</label>
            <input
              ref={previewInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e, 'preview')}
            />
            <button
              type="button"
              onClick={() => previewInputRef.current?.click()}
              className="w-full flex items-center gap-2 border border-[#2A2A2A] rounded-lg px-4 py-3
                text-[#A0A0A0] hover:text-white hover:border-[#404040] hover:bg-white/5 transition-colors"
            >
              {previewFile ? (
                <>
                  <FileImage size={16} className="text-green-400" />
                  <span className="text-sm truncate">{previewFile.name}</span>
                </>
              ) : (
                <>
                  <ImageIcon size={16} />
                  <span className="text-sm">Tidak ada file preview</span>
                </>
              )}
              {previewFile && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreviewFile(null)
                  }}
                  className="ml-auto text-[#606060] hover:text-red-400"
                >
                  <X size={14} />
                </span>
              )}
            </button>
          </div>

          {/* Dimensi & Frame */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">Lebar (px)</label>
              <input
                type="number"
                value={form.canvas_width}
                onChange={(e) => setField('canvas_width', e.target.value)}
                min={100}
                className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-3 py-2.5
                  text-white text-sm focus:outline-none focus:ring-1 focus:border-[#404040] focus:ring-white/10"
              />
            </div>
            <div>
              <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">Tinggi (px)</label>
              <input
                type="number"
                value={form.canvas_height}
                onChange={(e) => setField('canvas_height', e.target.value)}
                min={100}
                className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-3 py-2.5
                  text-white text-sm focus:outline-none focus:ring-1 focus:border-[#404040] focus:ring-white/10"
              />
            </div>
            <div>
              <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">Jumlah Frame</label>
              <input
                type="number"
                value={form.frame_count}
                onChange={(e) => setField('frame_count', e.target.value)}
                min={1}
                max={10}
                className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-3 py-2.5
                  text-white text-sm focus:outline-none focus:ring-1 focus:border-[#404040] focus:ring-white/10"
              />
            </div>
          </div>

          {/* Frame Configuration JSON (opsional) */}
          <div>
            <label className="block text-[#A0A0A0] text-xs font-medium mb-1.5">
              Frame Configuration (opsional, JSON)
            </label>
            <textarea
              value={form.frame_configuration}
              onChange={(e) => setField('frame_configuration', e.target.value)}
              rows={3}
              placeholder='[{"id":1,"x":60,"y":150,"width":960,"height":500,"order":1}]'
              className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg px-4 py-2.5
                text-white text-sm font-mono placeholder:text-[#404040]
                focus:outline-none focus:ring-1 focus:border-[#404040] focus:ring-white/10 transition-colors"
            />
            <p className="text-[#606060] text-xs mt-1">
              Kosongkan jika ingin mengatur frame di editor nanti.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setIsUploadOpen(false)}
            disabled={createTemplate.isPending}
          >
            Batal
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleUpload}
            loading={createTemplate.isPending}
            leftIcon={<Plus size={16} />}
          >
            {createTemplate.isPending ? 'Mengunggah...' : 'Unggah Template'}
          </Button>
        </div>
      </Modal>

      {/* ===== Delete Confirm ===== */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Template"
        message={
          deleteTarget
            ? `Template "${deleteTarget.name}" beserta file-nya akan dihapus permanen. Lanjutkan?`
            : ''
        }
        confirmLabel="Ya, Hapus"
        loading={deleteTemplate.isPending}
        danger
      />
    </div>
  )
}

export default TemplatesPage