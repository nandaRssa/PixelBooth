import React from 'react'
import { Download, ExternalLink, FolderInput, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import type { Photo } from '@/types'

// ==========================================
// Photo Preview Modal — preview foto fullscreen
// ==========================================

interface PhotoPreviewModalProps {
  photo: Photo | null
  onClose: () => void
  onMove: (photo: Photo) => void
  onDelete: (photo: Photo) => void
}

const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({
  photo,
  onClose,
  onMove,
  onDelete,
}) => {
  return (
    <AnimatePresence>
      {photo && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
              w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] flex flex-col"
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-white text-sm font-medium truncate">{photo.filename}</p>
              <button
                onClick={onClose}
                className="touch-target w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Image */}
            <div className="flex-1 min-h-0 bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl overflow-hidden flex items-center justify-center">
              {photo.url ? (
                <img
                  src={photo.url}
                  alt={photo.filename}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : (
                <p className="text-[#606060] text-sm">Gambar tidak tersedia</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => window.open(photo.url, '_blank')}
                leftIcon={<ExternalLink size={16} />}
              >
                Buka
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = photo.url
                  a.download = photo.filename
                  a.click()
                }}
                leftIcon={<Download size={16} />}
              >
                Unduh
              </Button>
              <div className="flex-1" />
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  onMove(photo)
                  onClose()
                }}
                leftIcon={<FolderInput size={16} />}
              >
                Pindah
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={() => {
                  onDelete(photo)
                  onClose()
                }}
                leftIcon={<Trash2 size={16} />}
              >
                Hapus
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default PhotoPreviewModal