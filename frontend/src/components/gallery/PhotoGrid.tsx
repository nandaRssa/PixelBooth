import React from 'react'
import { ImageIcon } from 'lucide-react'
import type { Photo } from '@/types'
import PhotoCard from './PhotoCard'
import { Button } from '@/components/ui/Button'
import { EmptyState, Spinner } from '@/components/ui/StatusBadge'

// ==========================================
// Photo Grid — grid foto dengan infinite scroll
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

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            onPreview={onPreview}
            onMove={onMove}
            onDelete={onDelete}
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