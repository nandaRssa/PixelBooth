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
        <Spinner size="lg" className="text-white" />
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl">
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
      <div className="flex items-center justify-between gap-2 mb-3">
        {selectionMode ? (
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={onSelectAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1E1E1E] border border-[#2A2A2A]
                text-white text-sm font-medium hover:bg-[#252525] transition-colors"
            >
              {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              {allSelected ? 'Batalkan Semua' : 'Pilih Semua'}
            </button>
            <span className="text-[#A0A0A0] text-sm">{selectedIds.size} dipilih</span>
            <div className="flex-1" />
            <Button
              variant="secondary"
              size="md"
              onClick={onBulkMove}
              disabled={selectedIds.size === 0 || isBulkActionPending}
              leftIcon={<FolderInput size={16} />}
            >
              Pindahkan
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={onBulkDelete}
              disabled={selectedIds.size === 0 || isBulkActionPending}
              leftIcon={<Trash2 size={16} />}
            >
              Hapus
            </Button>
            <button
              type="button"
              onClick={() => setSelectionMode(false)}
              className="touch-target w-9 h-9 rounded-lg bg-[#1E1E1E] border border-[#2A2A2A]
                text-[#A0A0A0] hover:text-white hover:bg-[#252525] transition-colors"
              title="Keluar dari mode pilih"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <p className="text-[#606060] text-sm">{photos.length} foto</p>
            <Button
              variant="ghost"
              size="md"
              onClick={() => setSelectionMode(true)}
              leftIcon={<CheckSquare size={16} />}
            >
              Pilih Foto
            </Button>
          </>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
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