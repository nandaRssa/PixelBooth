import React from 'react'
import { CheckSquare, FolderInput, ImageIcon, Square, Trash2, X } from 'lucide-react'
import type { Photo } from '@/types'
import PhotoCard from './PhotoCard'
import { Button } from '@/components/ui/Button'
import { EmptyState, Spinner } from '@/components/ui/StatusBadge'

// ==========================================
// Photo Grid — grid foto dengan infinite scroll
// dan mode seleksi untuk aksi massal
// ==========================================

interface PhotoGridProps {
  photos: Photo[]
  isLoading: boolean
  isFetchingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  onPreview: (photo: Photo) => void
  onMove: (photo: Photo) => void
  onDelete: (photo: Photo) => void
  selectionMode: boolean
  setSelectionMode: (value: boolean) => void
  selectedIds: Set<number>
  onToggleSelect: (photo: Photo) => void
  onSelectAll: () => void
  onBulkMove: () => void
  onBulkDelete: () => void
  isBulkActionPending: boolean
}

const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos,
  isLoading,
  isFetchingMore,
  hasMore,
  onLoadMore,
  onPreview,
  onMove,
  onDelete,
  selectionMode,
  setSelectionMode,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onBulkMove,
  onBulkDelete,
  isBulkActionPending,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" className="text-pb-text" />
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="bg-pb-surface border border-pb-border rounded-2xl">
        <EmptyState
          icon={<ImageIcon size={48} />}
          title="Belum ada foto"
          description="Foto dari sesi pemotretan akan muncul di sini."
        />
      </div>
    )
  }

  const allSelected = selectedIds.size === photos.length

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4">
        {selectionMode ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-pb-surface border border-pb-border shadow-xs w-full">
            {/* Baris 1: Status & Pilih Semua */}
            <div className="flex items-center justify-between sm:justify-start gap-2.5">
              <button
                type="button"
                onClick={onSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pb-elevated border border-pb-border
                  text-pb-text text-xs font-semibold hover:bg-pb-border-light transition-colors"
              >
                {allSelected ? <CheckSquare size={14} className="text-[#FF5A36]" /> : <Square size={14} />}
                <span>{allSelected ? 'Batal Semua' : 'Pilih Semua'}</span>
              </button>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/15 text-[#FF5A36] border border-orange-500/30">
                {selectedIds.size} dipilih
              </span>
              <button
                type="button"
                onClick={() => setSelectionMode(false)}
                className="sm:hidden text-xs text-pb-text-muted hover:text-pb-text px-2 py-1 font-medium ml-auto"
              >
                Batal
              </button>
            </div>

            {/* Baris 2: Tombol Aksi Massal */}
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 sm:flex-initial text-xs"
                onClick={onBulkMove}
                disabled={selectedIds.size === 0 || isBulkActionPending}
                leftIcon={<FolderInput size={14} />}
              >
                Pindahkan
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1 sm:flex-initial text-xs"
                onClick={onBulkDelete}
                disabled={selectedIds.size === 0 || isBulkActionPending}
                leftIcon={<Trash2 size={14} />}
              >
                Hapus {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </Button>
              <button
                type="button"
                onClick={() => setSelectionMode(false)}
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
            <p className="text-pb-text-muted text-xs sm:text-sm font-medium">{photos.length} foto tersedia</p>
            <Button
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => setSelectionMode(true)}
              leftIcon={<CheckSquare size={14} />}
            >
              Pilih Foto
            </Button>
          </div>
        )}
      </div>

      {/* Grid: 3 kolom di mobile (iPhone 14 dsb), 3-5 kolom di tablet & desktop */}
      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-4 lg:gap-5">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            onPreview={onPreview}
            onMove={onMove}
            onDelete={onDelete}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(photo.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-6">
          <Button
            variant="secondary"
            size="md"
            onClick={onLoadMore}
            loading={isFetchingMore}
          >
            {isFetchingMore ? 'Memuat...' : 'Muat Foto Lainnya'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default PhotoGrid