import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, FolderOpen, Home, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/Modal'
import { EmptyState, Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { folderApi } from '@/api/folders'
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder } from '@/hooks/useFolders'
import { usePhotos, useDeletePhoto, useMovePhoto } from '@/hooks/usePhotos'
import FolderCard from '@/components/gallery/FolderCard'
import PhotoGrid from '@/components/gallery/PhotoGrid'
import FolderFormModal from '@/components/gallery/FolderFormModal'
import FolderQrModal from '@/components/gallery/FolderQrModal'
import PhotoPreviewModal from '@/components/gallery/PhotoPreviewModal'
import MovePhotoModal from '@/components/gallery/MovePhotoModal'
import type { Folder, Photo } from '@/types'

// ==========================================
// Gallery Page — Kelola folder & foto
// CRUD folder, navigasi sub-folder, grid foto
// ==========================================

interface Crumb {
  id: number
  name: string
}

const GalleryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const folderIdParam = searchParams.get('folder_id')
  const activeFolderId = folderIdParam ? Number(folderIdParam) : null

  // ===== Data =====
  const foldersQuery = useFolders(activeFolderId)
  const photosQuery = usePhotos(activeFolderId)
  const allFoldersQuery = useFolders(null)

  // ===== Mutations =====
  const createFolder = useCreateFolder()
  const updateFolder = useUpdateFolder()
  const deleteFolder = useDeleteFolder()
  const deletePhoto = useDeletePhoto()
  const movePhoto = useMovePhoto()

  // ===== Breadcrumb navigation =====
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([])
  const breadcrumbRef = React.useRef<Crumb[]>([])

  useEffect(() => {
    if (!activeFolderId) {
      breadcrumbRef.current = []
      setBreadcrumb([])
      return
    }

    const last = breadcrumbRef.current[breadcrumbRef.current.length - 1]
    if (last && last.id === activeFolderId) return

    // Saat akses langsung via URL — muat nama folder
    let cancelled = false
    folderApi
      .show(activeFolderId)
      .then((folder) => {
        if (!cancelled) {
          const crumb = [{ id: folder.id, name: folder.name }]
          breadcrumbRef.current = crumb
          setBreadcrumb(crumb)
        }
      })
      .catch(() => {
        if (!cancelled) {
          breadcrumbRef.current = []
          setBreadcrumb([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeFolderId])

  const openFolder = (folder: Folder) => {
    const crumbs = [...breadcrumbRef.current, { id: folder.id, name: folder.name }]
    breadcrumbRef.current = crumbs
    setBreadcrumb(crumbs)
    setSearchParams({ folder_id: String(folder.id) })
  }

  const goToRoot = () => {
    breadcrumbRef.current = []
    setBreadcrumb([])
    setSearchParams({})
  }

  const goToCrumb = (index: number) => {
    const target = breadcrumbRef.current[index]
    const crumbs = breadcrumbRef.current.slice(0, index + 1)
    breadcrumbRef.current = crumbs
    setBreadcrumb(crumbs)
    if (target) {
      setSearchParams({ folder_id: String(target.id) })
    } else {
      setSearchParams({})
    }
  }

  // ===== Modal state =====
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null)
  const [qrTarget, setQrTarget] = useState<Folder | null>(null)
  const [previewTarget, setPreviewTarget] = useState<Photo | null>(null)
  const [moveTarget, setMoveTarget] = useState<Photo | null>(null)
  const [deletePhotoTarget, setDeletePhotoTarget] = useState<Photo | null>(null)

  // ===== Handlers =====
  const handleCreateFolder = async (name: string) => {
    try {
      await createFolder.mutateAsync({ name, parent_folder_id: activeFolderId })
      toast.success('Folder berhasil dibuat.')
    } catch {
      toast.error('Gagal membuat folder. Coba lagi.')
    }
  }

  const handleRenameFolder = async (name: string) => {
    if (!renameTarget) return
    try {
      await updateFolder.mutateAsync({ id: renameTarget.id, payload: { name } })
      toast.success('Nama folder berhasil diperbarui.')
      setRenameTarget(null)
    } catch {
      toast.error('Gagal memperbarui nama folder.')
    }
  }

  const handleDeleteFolder = async () => {
    if (!deleteTarget) return
    try {
      await deleteFolder.mutateAsync(deleteTarget.id)
      toast.success('Folder berhasil dihapus.')
      setDeleteTarget(null)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal menghapus folder.')
      setDeleteTarget(null)
    }
  }

  const handleDeletePhoto = async () => {
    if (!deletePhotoTarget) return
    try {
      await deletePhoto.mutateAsync(deletePhotoTarget.id)
      toast.success('Foto berhasil dihapus.')
      setDeletePhotoTarget(null)
    } catch {
      toast.error('Gagal menghapus foto.')
      setDeletePhotoTarget(null)
    }
  }

  const handleMovePhoto = async (folderId: number) => {
    if (!moveTarget) return
    try {
      await movePhoto.mutateAsync({ id: moveTarget.id, folderId })
      toast.success('Foto berhasil dipindahkan.')
      setMoveTarget(null)
    } catch {
      toast.error('Gagal memindahkan foto.')
    }
  }

  const folders = foldersQuery.data ?? []
  const photos = photosQuery.data?.pages.flatMap((page) => page.data) ?? []
  const hasMore = Boolean(photosQuery.hasNextPage)

  return (
    <div>
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-6">
        <div className="min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-[#606060] mb-1">
            <button
              type="button"
              onClick={goToRoot}
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              <Home size={14} />
              <span>Galeri</span>
            </button>
            {breadcrumb.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight size={14} className="text-[#404040]" />
                <button
                  type="button"
                  onClick={() => goToCrumb(index)}
                  className={`truncate max-w-[160px] hover:text-white transition-colors ${
                    index === breadcrumb.length - 1 ? 'text-white font-medium' : ''
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          <h1 className="text-white text-2xl font-bold">
            {breadcrumb.length > 0
              ? breadcrumb[breadcrumb.length - 1].name
              : 'Galeri'}
          </h1>
          <p className="text-[#606060] text-sm mt-1">
            {activeFolderId
              ? 'Folder dan foto dalam folder ini'
              : 'Kelola folder dan foto hasil photobooth'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => foldersQuery.refetch()}
            disabled={foldersQuery.isFetching}
            leftIcon={<RefreshCw size={16} />}
          >
            Segarkan
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<Plus size={16} />}
          >
            Buat Folder
          </Button>
        </div>
      </div>

      {/* ===== Sub-folders ===== */}
      {foldersQuery.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" className="text-white" />
        </div>
      ) : folders.length > 0 ? (
        <div className="mb-10">
          <h2 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
            <FolderOpen size={16} className="text-[#A0A0A0]" />
            Sub-Folder
            <span className="text-[#606060] font-normal">{folders.length}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onOpen={openFolder}
                onRename={setRenameTarget}
                onDelete={setDeleteTarget}
                onShowQr={setQrTarget}
              />
            ))}
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-10"
        >
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl">
            <EmptyState
              icon={<FolderOpen size={48} />}
              title={activeFolderId ? 'Belum ada sub-folder' : 'Belum ada folder'}
              description={
                activeFolderId
                  ? 'Buat sub-folder untuk mengorganisasi foto lebih rapi.'
                  : 'Buat folder pertama untuk mulai menyimpan dan mengorganisasi foto photobooth.'
              }
              action={
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setIsCreateOpen(true)}
                  leftIcon={<Plus size={16} />}
                >
                  Buat Folder
                </Button>
              }
            />
          </div>
        </motion.div>
      )}

      {/* ===== Photo grid — hanya saat berada di dalam folder ===== */}
      {activeFolderId && (
        <div>
          <h2 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
            Foto
            <span className="text-[#606060] font-normal">
              {photosQuery.isLoading ? '' : photos.length}
            </span>
          </h2>
          <PhotoGrid
            photos={photos}
            isLoading={photosQuery.isLoading}
            isFetchingMore={photosQuery.isFetchingNextPage}
            hasMore={hasMore}
            onLoadMore={() => photosQuery.fetchNextPage()}
            onPreview={setPreviewTarget}
            onMove={setMoveTarget}
            onDelete={setDeletePhotoTarget}
          />
        </div>
      )}

      {/* ===== Modals ===== */}
      <FolderFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateFolder}
        isSubmitting={createFolder.isPending}
      />

      <FolderFormModal
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        onSubmit={handleRenameFolder}
        folder={renameTarget}
        isSubmitting={updateFolder.isPending}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteFolder}
        title="Hapus Folder"
        message={
          deleteTarget
            ? `Folder "${deleteTarget.name}" beserta seluruh isinya akan dihapus permanen. Lanjutkan?`
            : ''
        }
        confirmLabel="Ya, Hapus"
        loading={deleteFolder.isPending}
        danger
      />

      <ConfirmModal
        isOpen={Boolean(deletePhotoTarget)}
        onClose={() => setDeletePhotoTarget(null)}
        onConfirm={handleDeletePhoto}
        title="Hapus Foto"
        message="Foto ini akan dihapus permanen dari galeri. Lanjutkan?"
        confirmLabel="Ya, Hapus"
        loading={deletePhoto.isPending}
        danger
      />

      <FolderQrModal
        isOpen={Boolean(qrTarget)}
        onClose={() => setQrTarget(null)}
        folder={qrTarget}
      />

      <PhotoPreviewModal
        photo={previewTarget}
        onClose={() => setPreviewTarget(null)}
        onMove={setMoveTarget}
        onDelete={setDeletePhotoTarget}
      />

      <MovePhotoModal
        isOpen={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        onConfirm={handleMovePhoto}
        folders={allFoldersQuery.data ?? []}
        isLoadingFolders={allFoldersQuery.isLoading}
        isMoving={movePhoto.isPending}
      />
    </div>
  )
}

export default GalleryPage