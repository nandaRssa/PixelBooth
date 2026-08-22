import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import {
  Download,
  Share2,
  FolderOpen,
  X,
  Image as ImageIcon,
  CheckSquare,
  Square,
  Trash2,
  Check,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { customerApi } from '@/api/customer'
import { getStorageUrl } from '@/api/client'
import { downloadFile } from '@/utils/download'
import type { CustomerFolder, CustomerFolderPhoto } from '@/types'

// ==========================================
// Customer Folder Page — Galeri Folder via Scan QR
// Fitur: Pilih, Pilih Semua, Batalkan, Unduh, Hapus, Bagikan
// ==========================================

const CustomerFolderPage: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [folder, setFolder] = useState<CustomerFolder | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [preview, setPreview] = useState<CustomerFolderPhoto | null>(null)

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<CustomerFolderPhoto | null>(null)

  const loadFolderData = (currentToken: string) => {
    customerApi
      .getFolder(currentToken)
      .then((data) => {
        setFolder(data)
        setStatus('ready')
      })
      .catch(() => {
        setStatus('error')
      })
  }

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }
    loadFolderData(token)
  }, [token])

  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

  // ===== Handlers Seleksi =====
  const handleToggleSelect = (photoToken: string) => {
    setSelectedTokens((prev) => {
      const next = new Set(prev)
      if (next.has(photoToken)) {
        next.delete(photoToken)
      } else {
        next.add(photoToken)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (!folder) return
    if (selectedTokens.size === folder.photos.length) {
      setSelectedTokens(new Set())
    } else {
      setSelectedTokens(new Set(folder.photos.map((p) => p.token)))
    }
  }

  const handleCancelSelection = () => {
    setSelectedTokens(new Set())
    setSelectionMode(false)
  }

  // ===== Handlers Bagikan =====
  const handleShare = async () => {
    if (!folder) return
    const shareTitle = `Galeri Foto ${folder.name}`
    const shareText = `Lihat ${folder.photos.length} foto dari sesi ${folder.name} di PixelBooth!`

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: pageUrl,
        })
      } catch {
        // User membatalkan dialog share
      }
    } else {
      try {
        await navigator.clipboard.writeText(pageUrl)
        toast.success('Link galeri berhasil disalin ke clipboard!')
      } catch {
        toast.error('Gagal menyalin link.')
      }
    }
  }

  // ===== Handlers Unduh =====
  const handleDownloadSingle = async (photo: CustomerFolderPhoto) => {
    if (!photo?.url || !folder) return
    const scopeName = folder.name ? folder.name.replace(/[^A-Za-z0-9]/g, '_') : 'Photo'
    const index = folder.photos.findIndex((p) => p.token === photo.token) + 1
    const filename = `PixelBooth-${scopeName}-${index || 1}.jpg`
    await downloadFile(photo.url, filename)
  }

  const handleDownloadSelected = async () => {
    if (!folder || selectedTokens.size === 0) return
    setIsDownloading(true)
    const targets = folder.photos.filter((p) => selectedTokens.has(p.token))
    try {
      for (let i = 0; i < targets.length; i++) {
        const photo = targets[i]
        const scopeName = folder.name ? folder.name.replace(/[^A-Za-z0-9]/g, '_') : 'Photo'
        const index = folder.photos.findIndex((p) => p.token === photo.token) + 1
        const filename = `PixelBooth-${scopeName}-${index || i + 1}.jpg`
        await downloadFile(photo.url, filename)
        // Jeda 250ms agar browser memproses download multi-file tanpa diblokir
        if (i < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 250))
        }
      }
      toast.success(`${targets.length} foto berhasil diunduh.`)
    } catch {
      toast.error('Gagal mengunduh beberapa foto.')
    } finally {
      setIsDownloading(false)
    }
  }

  // ===== Handlers Hapus =====
  const handleConfirmDelete = async () => {
    if (!folder) return
    setIsDeleting(true)
    try {
      if (singleDeleteTarget) {
        // Hapus foto tunggal dari modal preview
        await customerApi.deletePhoto(singleDeleteTarget.token)
        setFolder((prev) =>
          prev
            ? {
                ...prev,
                photo_count: prev.photos.length - 1,
                photos: prev.photos.filter((p) => p.token !== singleDeleteTarget.token),
              }
            : null,
        )
        setPreview(null)
        setSingleDeleteTarget(null)
        toast.success('Foto berhasil dihapus.')
      } else if (selectedTokens.size > 0) {
        // Hapus foto terpilih secara massal
        const tokensArray = Array.from(selectedTokens)
        await customerApi.bulkDeletePhotos(tokensArray)
        setFolder((prev) =>
          prev
            ? {
                ...prev,
                photo_count: prev.photos.length - tokensArray.length,
                photos: prev.photos.filter((p) => !selectedTokens.has(p.token)),
              }
            : null,
        )
        toast.success(`${tokensArray.length} foto berhasil dihapus.`)
        setSelectedTokens(new Set())
        setSelectionMode(false)
      }
    } catch {
      toast.error('Gagal menghapus foto.')
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  // ===== Loading View =====
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-pb-bg flex items-center justify-center p-4">
        <div className="text-center">
          <Spinner size="lg" className="text-[#FF5A36] mx-auto mb-3" />
          <p className="text-pb-text-muted text-sm font-medium">Memuat galeri foto...</p>
        </div>
      </div>
    )
  }

  // ===== Error / Not Found View =====
  if (status === 'error' || !folder) {
    return (
      <div className="min-h-screen bg-pb-bg flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-pb-surface border border-pb-border rounded-2xl p-6 sm:p-8 shadow-xl">
          <FolderOpen size={48} className="text-pb-faint mx-auto mb-4" />
          <h1 className="text-pb-text font-bold text-lg mb-2">Galeri Tidak Ditemukan</h1>
          <p className="text-pb-text-muted text-xs sm:text-sm leading-relaxed mb-6">
            Link QR mungkin sudah tidak berlaku atau foto dalam folder telah dihapus.
          </p>
          <Button variant="primary" size="md" fullWidth onClick={() => window.location.reload()}>
            Muat Ulang
          </Button>
        </div>
      </div>
    )
  }

  const allSelected = folder.photos.length > 0 && selectedTokens.size === folder.photos.length

  return (
    <div className="min-h-screen bg-pb-bg p-3 sm:p-6 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        {/* ===== Header Galeri Folder ===== */}
        <div className="text-center mb-5 pt-2 sm:pt-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-[#FF5A36] text-[11px] font-semibold tracking-wider uppercase mb-2 shadow-xs">
            <Sparkles size={12} />
            <span>PIXELBOOTH GALLERY</span>
          </div>
          <h1 className="text-pb-text font-bold text-xl sm:text-2xl truncate">{folder.name}</h1>
          <p className="text-pb-text-muted text-xs sm:text-sm mt-1">
            {folder.photos.length} foto tersimpan
          </p>
        </div>

        {/* ===== Card Info & Bagikan Galeri ===== */}
        <div className="bg-pb-surface border border-pb-border rounded-2xl p-3.5 sm:p-4 mb-4 shadow-sm flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white p-1.5 rounded-xl shrink-0 shadow-xs border border-white/20">
              <QRCodeSVG value={pageUrl} size={52} fgColor="#0A0A0A" />
            </div>
            <div className="min-w-0">
              <p className="text-pb-text text-xs sm:text-sm font-semibold truncate">
                Bagikan Galeri Ini
              </p>
              <p className="text-pb-text-muted text-[11px] sm:text-xs leading-relaxed truncate">
                Scan QR atau salin link untuk berbagi folder
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleShare}
            leftIcon={<Share2 size={15} />}
            className="shrink-0 ml-auto sm:ml-0"
          >
            Bagikan
          </Button>
        </div>

        {/* ===== Toolbar Aksi: Pilih, Pilih Semua, Batalkan, Unduh, Hapus ===== */}
        {folder.photos.length > 0 && (
          <div className="bg-pb-surface border border-pb-border rounded-2xl p-2.5 sm:p-3 mb-4 shadow-sm sticky top-3 z-20 backdrop-blur-md bg-pb-surface/95">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {!selectionMode ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-pb-text font-semibold text-xs sm:text-sm">
                      Daftar Foto
                    </span>
                    <span className="text-pb-text-muted text-xs">
                      ({folder.photos.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectionMode(true)}
                      leftIcon={<CheckSquare size={15} />}
                    >
                      Pilih Foto
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Mode Seleksi Aktif */}
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      leftIcon={allSelected ? <Square size={14} /> : <CheckSquare size={14} />}
                    >
                      {allSelected ? 'Batal Semua' : 'Pilih Semua'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelSelection}
                    >
                      Batal
                    </Button>
                    <span className="text-[11px] sm:text-xs text-pb-text-secondary font-medium pl-1">
                      {selectedTokens.size} dipilih
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleDownloadSelected}
                      disabled={selectedTokens.size === 0 || isDownloading}
                      loading={isDownloading}
                      leftIcon={<Download size={14} />}
                    >
                      Unduh ({selectedTokens.size})
                    </Button>

                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setSingleDeleteTarget(null)
                        setDeleteConfirmOpen(true)
                      }}
                      disabled={selectedTokens.size === 0 || isDeleting}
                      leftIcon={<Trash2 size={14} />}
                    >
                      Hapus ({selectedTokens.size})
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== Photos Grid ===== */}
        {folder.photos.length === 0 ? (
          <div className="bg-pb-surface border border-pb-border rounded-2xl p-10 flex flex-col items-center justify-center text-center shadow-sm">
            <ImageIcon size={44} className="text-pb-faint mb-3" />
            <p className="text-pb-text font-semibold text-sm mb-1">Belum Ada Foto</p>
            <p className="text-pb-text-muted text-xs max-w-xs leading-relaxed">
              Semua foto dalam folder ini mungkin telah dihapus atau belum ada sesi yang tersimpan.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
            {folder.photos.map((photo, index) => {
              const isSelected = selectedTokens.has(photo.token)
              return (
                <div
                  key={photo.token}
                  className={`group relative aspect-[3/4] bg-pb-surface border rounded-2xl overflow-hidden shadow-xs transition-all duration-200 cursor-pointer select-none ${
                    isSelected
                      ? 'border-[#FF5A36] ring-2 ring-[#FF5A36]/40 scale-[0.98]'
                      : 'border-pb-border hover:border-pb-border-strong hover:shadow-md'
                  }`}
                  onClick={() => {
                    if (selectionMode) {
                      handleToggleSelect(photo.token)
                    } else {
                      setPreview(photo)
                    }
                  }}
                >
                  <img
                    src={getStorageUrl(photo.thumbnail_url ?? photo.url)}
                    alt={`Foto ${index + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* Badge Nomor Urut Foto */}
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-white text-[10px] font-medium border border-white/10 shadow-xs">
                    Foto #{index + 1}
                  </span>

                  {/* Overlay Seleksi / Checkbox Bulat */}
                  {selectionMode && (
                    <div
                      className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-[#FF5A36] border-white text-white shadow-md scale-105'
                          : 'bg-black/50 border-white/80 text-transparent backdrop-blur-xs'
                      }`}
                    >
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}

                  {/* Tombol Unduh Cepat di Hover Desktop (saat tidak mode seleksi) */}
                  {!selectionMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownloadSingle(photo)
                      }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/75 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-[#FF5A36] shadow-md"
                      title="Unduh Foto Ini"
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* ===== Preview Modal ===== */}
      <AnimatePresence>
        {preview && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50"
              onClick={() => setPreview(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg"
            >
              <div className="bg-pb-surface border border-pb-border rounded-2xl p-4 shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-pb-text text-sm font-semibold truncate">{folder.name}</p>
                    <p className="text-pb-text-muted text-xs">
                      Foto #{folder.photos.findIndex((p) => p.token === preview.token) + 1}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="w-8 h-8 rounded-lg bg-pb-elevated border border-pb-border hover:border-pb-border-strong text-pb-text-secondary hover:text-pb-text flex items-center justify-center transition-colors shrink-0 ml-auto"
                    title="Tutup"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="bg-black/50 border border-pb-border rounded-xl overflow-hidden flex items-center justify-center max-h-[65vh]">
                  <img
                    src={getStorageUrl(preview.url)}
                    alt="Foto galeri"
                    className="max-w-full max-h-[65vh] object-contain rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-pb-border">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => handleDownloadSingle(preview)}
                    leftIcon={<Download size={16} />}
                  >
                    Unduh Foto
                  </Button>

                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => {
                      setSingleDeleteTarget(preview)
                      setDeleteConfirmOpen(true)
                    }}
                    leftIcon={<Trash2 size={16} />}
                  >
                    Hapus Foto
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== Confirm Delete Modal ===== */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setSingleDeleteTarget(null)
        }}
        onConfirm={handleConfirmDelete}
        title={singleDeleteTarget ? 'Hapus Foto Ini' : 'Hapus Foto Terpilih'}
        message={
          singleDeleteTarget
            ? 'Foto ini akan dihapus permanen dari folder. Lanjutkan?'
            : `${selectedTokens.size} foto yang dipilih akan dihapus permanen dari folder. Lanjutkan?`
        }
        confirmLabel={
          singleDeleteTarget
            ? 'Ya, Hapus'
            : `Ya, Hapus (${selectedTokens.size})`
        }
        loading={isDeleting}
        danger
      />
    </div>
  )
}

export default CustomerFolderPage