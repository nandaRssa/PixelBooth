import React, { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { FolderPlus, Pencil } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Folder } from '@/types'

// ==========================================
// Folder Form Modal — buat & ubah nama folder
// ==========================================

const folderSchema = z.object({
  name: z
    .string()
    .min(1, 'Nama folder wajib diisi')
    .max(255, 'Nama folder maksimal 255 karakter'),
})

type FolderForm = z.infer<typeof folderSchema>

interface FolderFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
  folder?: Folder | null
  isSubmitting?: boolean
}

const FolderFormModal: React.FC<FolderFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  folder = null,
  isSubmitting = false,
}) => {
  const isEdit = Boolean(folder)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FolderForm>({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: '' },
  })

  useEffect(() => {
    if (isOpen) {
      reset({ name: folder?.name ?? '' })
    }
  }, [isOpen, folder, reset])

  const handleFormSubmit = async (data: FolderForm) => {
    try {
      await onSubmit(data.name)
      onClose()
    } catch {
      // Gagal — biarkan modal tetap terbuka agar user bisa memperbaiki
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Ubah Nama Folder' : 'Buat Folder Baru'}
      size="sm"
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div>
          <label className="block text-pb-text-secondary text-xs font-medium mb-1.5">
            Nama Folder
          </label>
          <div className="relative">
            {isEdit ? (
              <Pencil size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pb-text-muted" />
            ) : (
              <FolderPlus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pb-text-muted" />
            )}
            <input
              {...register('name')}
              type="text"
              placeholder="contoh: Pernikahan Andi & Sari"
              autoFocus
              className={`
                w-full bg-pb-bg border rounded-lg pl-9 pr-4 py-3
                text-pb-text text-sm placeholder:text-pb-faint
                focus:outline-none focus:ring-1 transition-colors
                ${errors.name
                  ? 'border-red-500/50 focus:ring-red-500/30'
                  : 'border-pb-border focus:border-pb-border-strong focus:ring-white/10'
                }
              `}
            />
          </div>
          {errors.name && (
            <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={isSubmitting}
          >
            {isSubmitting ? 'Menyimpan...' : isEdit ? 'Simpan' : 'Buat Folder'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default FolderFormModal