import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckSquare, ChevronRight, FolderInput, FolderOpen, Home, ImageIcon, Plus, Printer, RefreshCw, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/Modal'
import { EmptyState, Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { folderApi } from '@/api/folders'
import { photoApi } from '@/api/photos'
import {
  useFolders,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  useBulkDeleteFolders,
  useBulkMoveFolders,
} from '@/hooks/useFolders'
import {
  usePhotos,
  useDeletePhoto,
  useMovePhoto,
  useBulkDeletePhotos,
  useBulkMovePhotos,
} from '@/hooks/usePhotos'
import FolderCard from '@/components/gallery/FolderCard'
import PhotoGrid from '@/components/gallery/PhotoGrid'
import FolderFormModal from '@/components/gallery/FolderFormModal'
import FolderQrModal from '@/components/gallery/FolderQrModal'
import PhotoQrModal from '@/components/gallery/PhotoQrModal'
import PhotoPreviewModal from '@/components/gallery/PhotoPreviewModal'
import MovePhotoModal from '@/components/gallery/MovePhotoModal'
import MoveFolderModal from '@/components/gallery/MoveFolderModal'
import PrintModal from '@/components/gallery/PrintModal'
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
  const bulkDeletePhotos = useBulkDeletePhotos()
  const bulkMovePhotos = useBulkMovePhotos()

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
    setSelectionMode(false)
    setSelectedIds(new Set())
    setSearchParams({ folder_id: String(folder.id) })
  }

  const goToRoot = () => {
    breadcrumbRef.current = []
    setBreadcrumb([])
    setSelectionMode(false)
    setSelectedIds(new Set())
    setSearchParams({})
  }

  const goToCrumb = (index: number) => {
    const target = breadcrumbRef.current[index]
    const crumbs = breadcrumbRef.current.slice(0, index + 1)
    breadcrumbRef.current = crumbs
    setBreadcrumb(crumbs)
    setSelectionMode(false)
    setSelectedIds(new Set())
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
  const [photoQrTarget, setPhotoQrTarget] = useState<Photo | null>(null)
  const [printModalState, setPrintModalState] = useState<{
    isOpen: boolean
    photos: Array<{ id: number; url: string; title?: string }>
    title: string
  }>({
    isOpen: false,
    photos: [],
    title: 'Cetak Foto',
  })

  // ===== Seleksi massal Foto =====
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // ===== Seleksi massal Folder =====
  const [folderSelectionMode, setFolderSelectionMode] = useState(false)
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set())
  const [bulkFolderMoveOpen, setBulkFolderMoveOpen] = useState(false)
  const [bulkFolderDeleteOpen, setBulkFolderDeleteOpen] = useState(false)
  const bulkDeleteFolders = useBulkDeleteFolders()
  const bulkMoveFolders = useBulkMoveFolders()

  // ===== Handlers =====
  const handleCreateFolder = async (name: string) => {
    try {
      await createFolder.mutateAsync({ name, parent_folder_id: activeFolderId })
      toast.success('Folder berhasil dibuat.')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal membuat folder. Coba lagi.')
      throw err
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
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal menghapus foto. Coba lagi.')
    }
  }

  const handleMovePhoto = async (folderId: number | null) => {
    if (!moveTarget) return
    try {
      await movePhoto.mutateAsync({ id: moveTarget.id, folderId })
      toast.success('Foto berhasil dipindahkan.')
      setMoveTarget(null)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal memindahkan foto. Coba lagi.')
    }
  }

  const handleToggleSelect = (photo: Photo) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(photo.id)) next.delete(photo.id)
      else next.add(photo.id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === photos.length ? new Set() : new Set(photos.map((p) => p.id))
    )
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    try {
      await bulkDeletePhotos.mutateAsync([...selectedIds])
      toast.success(`${selectedIds.size} foto berhasil dihapus.`)
      setSelectedIds(new Set())
      setSelectionMode(false)
      setBulkDeleteOpen(false)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal menghapus foto.')
    }
  }

  const handleBulkMove = async (folderId: number | null) => {
    if (selectedIds.size === 0) return
    try {
      await bulkMovePhotos.mutateAsync({ photoIds: [...selectedIds], folderId })
      toast.success(`${selectedIds.size} foto berhasil dipindahkan.`)
      setSelectedIds(new Set())
      setSelectionMode(false)
      setBulkMoveOpen(false)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal memindahkan foto. Coba lagi.')
    }
  }

  // ===== Handlers Seleksi Folder =====
  const handleToggleSelectFolder = (folder: Folder) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(folder.id)) next.delete(folder.id)
      else next.add(folder.id)
      return next
    })
  }

  const handleSelectAllFolders = () => {
    setSelectedFolderIds((prev) =>
      prev.size === folders.length ? new Set() : new Set(folders.map((f) => f.id))
    )
  }

  const handleBulkDeleteFolders = async () => {
    if (selectedFolderIds.size === 0) return
    try {
      await bulkDeleteFolders.mutateAsync([...selectedFolderIds])
      toast.success(`${selectedFolderIds.size} folder berhasil dihapus.`)
      setSelectedFolderIds(new Set())
      setFolderSelectionMode(false)
      setBulkFolderDeleteOpen(false)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal menghapus folder.')
    }
  }

  const handleBulkMoveFolders = async (targetParentFolderId: number | null) => {
    if (selectedFolderIds.size === 0) return
    try {
      await bulkMoveFolders.mutateAsync({
        folderIds: [...selectedFolderIds],
        parentFolderId: targetParentFolderId,
      })
      toast.success(`${selectedFolderIds.size} folder berhasil dipindahkan.`)
      setSelectedFolderIds(new Set())
      setFolderSelectionMode(false)
      setBulkFolderMoveOpen(false)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Gagal memindahkan folder.')
    }
  }

  const folders = foldersQuery.data ?? []
  const photos = photosQuery.data?.pages.flatMap((page) => page.data) ?? []
  const hasMore = Boolean(photosQuery.hasNextPage)
  const allFoldersSelected = folders.length > 0 && selectedFolderIds.size === folders.length

  // ===== Print Handlers =====
  const handlePrintBatchSelected = () => {
    const selected = photos.filter((p) => selectedIds.has(p.id))
    if (selected.length === 0) return
    setPrintModalState({
      isOpen: true,
      photos: selected.map((p) => ({
        id: p.id,
        url: p.url,
        title: p.filename || `Foto-${p.id}`,
      })),
      title: `Cetak ${selected.length} Foto Terpilih`,
    })
  }

  const handlePrintAllInFolder = () => {
    if (photos.length === 0) {
      toast.info('Belum ada foto untuk dicetak.')
      return
    }
    const currentName = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].name : 'Galeri'
    setPrintModalState({
      isOpen: true,
      photos: photos.map((p) => ({
        id: p.id,
        url: p.url,
        title: p.filename || `Foto-${p.id}`,
      })),
      title: `Cetak Semua Foto (${photos.length}) — ${currentName}`,
    })
  }

  const handlePrintFolderCard = async (folder: Folder) => {
    try {
      toast.info(`Memuat foto folder "${folder.name}"...`)
      const res = await photoApi.list({ folder_id: folder.id })
      const folderPhotos = res.data ?? []
      if (folderPhotos.length === 0) {
        toast.info(`Folder "${folder.name}" belum memiliki foto untuk dicetak.`)
        return
      }
      setPrintModalState({
        isOpen: true,
        photos: folderPhotos.map((p) => ({
          id: p.id,
          url: p.url,
          title: p.filename || `Foto-${p.id}`,
        })),
        title: `Cetak Foto Folder: ${folder.name} (${folderPhotos.length} Foto)`,
      })
    } catch {
      toast.error(`Gagal memuat foto folder "${folder.name}".`)
    }
  }

  return (
    <div className="flex flex-col w-full pb-12">
      {/* ===== Header ===== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
        <div className="min-w-0 flex-1">
          {/* Breadcrumb — pixel > style */}
          <div className="flex items-center gap-2 font-retro text-sm sm:text-base text-[var(--pb-text-muted)] mb-1 tracking-wide flex-wrap">
            <button
              type="button"
              onClick={goToRoot}
              className="flex items-center gap-1 hover:text-[#FF5A36] transition-colors uppercase font-bold"
            >
              <Home size={15} className="text-[#FF5A36]" />
              <span>Galeri</span>
            </button>
            {breadcrumb.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <span className="text-[#FF5A36] font-pixel text-[9px]">&gt;</span>
                <button
                  type="button"
                  onClick={() => goToCrumb(index)}
                  className={`truncate max-w-[120px] sm:max-w-[180px] hover:text-[#FFB800] transition-colors uppercase font-bold ${
                    index === breadcrumb.length - 1 ? 'text-[var(--pb-text)]' : ''
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          <h1 className="font-pixel text-[var(--pb-text)] text-base sm:text-lg lg:text-xl leading-relaxed truncate">
            {breadcrumb.length > 0
              ? breadcrumb[breadcrumb.length - 1].name
              : 'Galeri'}
          </h1>
          <p className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg lg:text-xl mt-0.5 tracking-wide">
            {activeFolderId
              ? 'Folder dan foto dalam folder ini'
              : 'Kelola folder dan foto hasil photobooth'}
          </p>
        </div>

        {/* Action Buttons: Responsive Grid di HP (2 kolom) & Flex di Tablet/iPad & Laptop */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-2.5 shrink-0 w-full sm:w-auto">
          {photos.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrintAllInFolder}
              leftIcon={<Printer size={15} className="text-[#FFB800] stroke-[2.5] shrink-0" />}
              className="hover:!border-[#FFB800] col-span-2 sm:col-span-1 justify-center !px-3 !py-2 !text-sm sm:!text-base font-bold"
              title="Print Semua Foto"
            >
              Print Semua ({photos.length})
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => foldersQuery.refetch()}
            disabled={foldersQuery.isFetching}
            leftIcon={<RefreshCw size={15} className="shrink-0" />}
            className="justify-center !px-3 !py-2 !text-sm sm:!text-base font-bold"
            title="Segarkan Galeri"
          >
            Segarkan
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<Plus size={15} className="shrink-0" />}
            className="justify-center !px-3 !py-2 !text-sm sm:!text-base font-bold"
            title="Buat Folder Baru"
          >
            Buat Folder
          </Button>
        </div>
      </div>

      {/* ===== Konten (Full Page Scroll) ===== */}
      <div className="w-full">
      {/* ===== Sub-folders ===== */}
      {foldersQuery.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" className="text-pb-text" />
        </div>
      ) : folders.length > 0 ? (
        <div className="mb-10">
          {/* Toolbar Sub-folder */}
          <div className="mb-3.5">
            {folderSelectionMode ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-[4px] bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] shadow-[3px_3px_0px_var(--pb-shadow-solid)] w-full">
                {/* Status & Select All */}
                <div className="flex items-center justify-between sm:justify-start gap-2.5">
                  <button
                    type="button"
                    onClick={handleSelectAllFolders}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)]
                      font-retro text-[var(--pb-text)] text-sm uppercase tracking-wide hover:border-[#FFB800] transition-colors shadow-[2px_2px_0px_var(--pb-shadow-solid)]"
                  >
                    {allFoldersSelected ? <CheckSquare size={14} className="text-[#FF5A36]" /> : <Square size={14} />}
                    <span>{allFoldersSelected ? 'Batal Semua' : 'Pilih Semua'}</span>
                  </button>
                  <span className="font-retro text-sm px-2.5 py-1 rounded-[3px] bg-[#FF5A36]/15 text-[#FF5A36] border-[2px] border-[#FF5A36]/40">
                    {selectedFolderIds.size} dipilih
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFolderSelectionMode(false)
                      setSelectedFolderIds(new Set())
                    }}
                    className="sm:hidden text-xs text-pb-text-muted hover:text-pb-text px-2 py-1 font-medium ml-auto"
                  >
                    Batal
                  </button>
                </div>

                {/* Baris 2: Tombol Aksi Massal Folder */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 sm:flex-initial text-xs"
                    onClick={() => setBulkFolderMoveOpen(true)}
                    disabled={selectedFolderIds.size === 0 || bulkMoveFolders.isPending}
                    leftIcon={<FolderInput size={14} className="text-[var(--pb-yellow)] stroke-[2.5]" />}
                  >
                    Pindahkan
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="flex-1 sm:flex-initial text-xs"
                    onClick={() => setBulkFolderDeleteOpen(true)}
                    disabled={selectedFolderIds.size === 0 || bulkDeleteFolders.isPending}
                    leftIcon={<Trash2 size={14} />}
                  >
                    Hapus {selectedFolderIds.size > 0 ? `(${selectedFolderIds.size})` : ''}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setFolderSelectionMode(false)
                      setSelectedFolderIds(new Set())
                    }}
                    className="hidden sm:flex w-8 h-8 rounded-xl bg-pb-elevated border border-pb-border
                      text-pb-text-muted hover:text-pb-text hover:bg-pb-border-light transition-colors items-center justify-center shrink-0"
                    title="Keluar dari mode pilih"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h2 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm flex items-center gap-2">
                  <FolderOpen size={18} className="text-[#FFB800]" />
                  <span>SUB-FOLDER</span>
                  <span className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg font-normal">({folders.length})</span>
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFolderSelectionMode(true)}
                  leftIcon={<CheckSquare size={16} />}
                >
                  Pilih Folder
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5 sm:gap-4 mb-6">
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onOpen={openFolder}
                onRename={setRenameTarget}
                onDelete={setDeleteTarget}
                onShowQr={setQrTarget}
                onPrint={handlePrintFolderCard}
                selectionMode={folderSelectionMode}
                isSelected={selectedFolderIds.has(folder.id)}
                onToggleSelect={handleToggleSelectFolder}
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
          <div className="bg-pb-surface border border-pb-border rounded-2xl">
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

      {/* ===== Photo grid — semua foto di root, atau foto dalam folder ===== */}
      <div className={activeFolderId ? '' : 'mt-8'}>
        <h2 className="font-pixel text-[var(--pb-text)] text-xs sm:text-sm mb-4 flex items-center gap-2">
          <ImageIcon size={18} className="text-[#00FFCC]" />
          <span>{activeFolderId ? 'FOTO' : 'TANPA FOLDER'}</span>
          <span className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg font-normal">
            {photosQuery.isLoading ? '' : `(${photos.length})`}
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
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onBulkMove={() => setBulkMoveOpen(true)}
          onBulkDelete={() => setBulkDeleteOpen(true)}
          onBulkPrint={handlePrintBatchSelected}
          isBulkActionPending={bulkDeletePhotos.isPending || bulkMovePhotos.isPending}
        />
      </div>
      </div>

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
        photos={photos}
        onSelectPhoto={setPreviewTarget}
        onClose={() => setPreviewTarget(null)}
        onMove={setMoveTarget}
        onDelete={setDeletePhotoTarget}
        onShowQr={setPhotoQrTarget}
      />

      <PhotoQrModal
        isOpen={Boolean(photoQrTarget)}
        onClose={() => setPhotoQrTarget(null)}
        photo={photoQrTarget}
      />

      <MovePhotoModal
        isOpen={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        onConfirm={handleMovePhoto}
        folders={allFoldersQuery.data ?? []}
        isLoadingFolders={allFoldersQuery.isLoading}
        isMoving={movePhoto.isPending}
        excludeFolderIds={moveTarget?.folder_id != null ? [moveTarget.folder_id] : []}
      />

      <MovePhotoModal
        isOpen={bulkMoveOpen}
        onClose={() => setBulkMoveOpen(false)}
        onConfirm={handleBulkMove}
        folders={allFoldersQuery.data ?? []}
        isLoadingFolders={allFoldersQuery.isLoading}
        isMoving={bulkMovePhotos.isPending}
        count={selectedIds.size}
        excludeFolderIds={
          (() => {
            const sel = photos.filter((p) => selectedIds.has(p.id))
            if (sel.length === 0) return []
            const first = sel[0].folder_id
            return first != null && sel.every((p) => p.folder_id === first) ? [first] : []
          })()
        }
      />

      <ConfirmModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Hapus Foto"
        message={`${selectedIds.size} foto akan dihapus permanen dari galeri. Lanjutkan?`}
        confirmLabel="Ya, Hapus"
        loading={bulkDeletePhotos.isPending}
        danger
      />

      {/* ===== Modals Seleksi Folder Massal ===== */}
      <MoveFolderModal
        isOpen={bulkFolderMoveOpen}
        onClose={() => setBulkFolderMoveOpen(false)}
        onConfirm={handleBulkMoveFolders}
        folders={allFoldersQuery.data ?? []}
        isLoadingFolders={allFoldersQuery.isLoading}
        isMoving={bulkMoveFolders.isPending}
        count={selectedFolderIds.size}
        excludeFolderIds={[...selectedFolderIds]}
      />

      <ConfirmModal
        isOpen={bulkFolderDeleteOpen}
        onClose={() => setBulkFolderDeleteOpen(false)}
        onConfirm={handleBulkDeleteFolders}
        title="Hapus Folder Terpilih"
        message={`${selectedFolderIds.size} folder beserta seluruh isinya akan dihapus permanen dari galeri. Lanjutkan?`}
        confirmLabel="Ya, Hapus Semua"
        loading={bulkDeleteFolders.isPending}
        danger
      />

      {/* ===== Print Modal ===== */}
      {printModalState.isOpen && printModalState.photos.length > 0 && (
        <PrintModal
          isOpen={printModalState.isOpen}
          onClose={() => setPrintModalState((prev) => ({ ...prev, isOpen: false }))}
          photos={printModalState.photos}
          title={printModalState.title}
        />
      )}
    </div>
  )
}

export default GalleryPage