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
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
        <div>
          <label className="block font-retro text-[var(--pb-text-secondary)] text-base sm:text-lg font-bold mb-2">
            Nama Folder
          </label>
          <div className="relative">
            {isEdit ? (
              <Pencil size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FF5A36]" />
            ) : (
              <FolderPlus size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FF5A36]" />
            )}
            <input
              {...register('name')}
              type="text"
              placeholder="contoh: Pernikahan Andi & Sari"
              autoFocus
              className={`
                w-full bg-[var(--pb-bg)] border-[2px] rounded-[4px] pl-11 pr-4 py-3
                font-retro text-lg sm:text-xl font-bold text-[var(--pb-text)] placeholder:text-[var(--pb-faint)]
                focus:outline-none focus:border-[#FFB800] shadow-[2px_2px_0px_var(--pb-shadow-solid)] transition-colors
                ${errors.name
                  ? 'border-red-500'
                  : 'border-[var(--pb-border-strong)]'
                }
              `}
            />
          </div>
          {errors.name && (
            <p className="font-retro text-red-400 text-sm sm:text-base font-bold mt-1.5">{errors.name.message}</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" size="md" fullWidth onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
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