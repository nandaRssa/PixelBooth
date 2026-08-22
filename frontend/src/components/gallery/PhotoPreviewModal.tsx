import React from 'react'
import { Download, ExternalLink, FolderInput, QrCode, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { getStorageUrl } from '@/api/client'
import { downloadFile } from '@/utils/download'
import type { Photo } from '@/types'

// ==========================================
// Photo Preview Modal — preview foto fullscreen
// Selaras 100% dengan Design System (Light & Dark Theme)
// ==========================================

interface PhotoPreviewModalProps {
  photo: Photo | null
  onClose: () => void
  onMove: (photo: Photo) => void
  onDelete: (photo: Photo) => void
  onShowQr: (photo: Photo) => void
}

const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({
  photo,
  onClose,
  onMove,
  onDelete,
  onShowQr,
}) => {
  return (
    <AnimatePresence>
      {photo && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
              w-[calc(100vw-2rem)] max-w-3xl max-h-[92vh] bg-pb-surface border border-pb-border
              rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-pb-border">
              <div className="min-w-0 pr-3">
                <h3 className="text-pb-text font-semibold text-base truncate">{photo.filename}</h3>
                <p className="text-pb-text-muted text-xs mt-0.5">Preview Foto Photobooth</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-pb-elevated border border-pb-border hover:border-pb-border-strong text-pb-text-secondary hover:text-pb-text flex items-center justify-center transition-colors shrink-0 ml-auto"
                title="Tutup Preview"
                aria-label="Tutup Preview"
              >
                <X size={16} />
              </button>
            </div>

            {/* Image Preview Container */}
            <div className="flex-1 min-h-0 bg-pb-bg border border-pb-border rounded-xl overflow-hidden flex items-center justify-center p-2">
              {photo.url ? (
                <img
                  src={getStorageUrl(photo.url)}
                  alt={photo.filename}
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              ) : (
                <p className="text-pb-text-muted text-sm py-12">Gambar tidak tersedia</p>
              )}
            </div>

            {/* Actions Bar — Selaras dengan Theme System */}
            <div className="flex items-center gap-2 pt-1 flex-wrap sm:flex-nowrap">
              <Button
                variant="secondary"
                size="md"
                onClick={() => window.open(getStorageUrl(photo.url), '_blank')}
                leftIcon={<ExternalLink size={16} />}
              >
                Buka
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={async () => {
                  await downloadFile(photo.url, photo.filename || 'pixelbooth-photo.jpg')
                }}
                leftIcon={<Download size={16} />}
              >
                Unduh
              </Button>
              <div className="hidden sm:block flex-1" />
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  onShowQr(photo)
                  onClose()
                }}
                leftIcon={<QrCode size={16} />}
              >
                QR Code
              </Button>
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