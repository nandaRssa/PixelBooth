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
  Check,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
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
  const [isDownloading, setIsDownloading] = useState(false)

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
    const downloadUrl = photo?.photo_url || photo?.url
    if (!downloadUrl || !folder) return
    const scopeName = folder.name ? folder.name.replace(/[^A-Za-z0-9]/g, '_') : 'Photo'
    const index = folder.photos.findIndex((p) => p.token === photo.token) + 1
    const filename = `PixelBooth-${scopeName}-${index || 1}.jpg`
    await downloadFile(downloadUrl, filename)
  }

  const handleDownloadSelected = async () => {
    if (!folder || selectedTokens.size === 0) return
    setIsDownloading(true)
    const targets = folder.photos.filter((p) => selectedTokens.has(p.token))
    try {
      for (let i = 0; i < targets.length; i++) {
        const photo = targets[i]
        const downloadUrl = photo?.photo_url || photo?.url
        if (!downloadUrl) continue
        const scopeName = folder.name ? folder.name.replace(/[^A-Za-z0-9]/g, '_') : 'Photo'
        const index = folder.photos.findIndex((p) => p.token === photo.token) + 1
        const filename = `PixelBooth-${scopeName}-${index || i + 1}.jpg`
        await downloadFile(downloadUrl, filename)
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

  // ===== Loading View =====
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--pb-bg)] flex items-center justify-center p-4">
        <div className="text-center">
          <Spinner size="lg" className="text-[#FF5A36] mx-auto mb-3" />
          <p className="font-retro text-[var(--pb-text-muted)] text-lg tracking-wide">Memuat galeri foto...</p>
        </div>
      </div>
    )
  }

  // ===== Error / Not Found View =====
  if (status === 'error' || !folder) {
    return (
      <div className="min-h-screen bg-[var(--pb-bg)] flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-[var(--pb-surface)] border-[3px] border-[#FF5A36] rounded-[4px] p-6 sm:p-8 shadow-[6px_6px_0px_var(--pb-shadow-solid)]">
          <FolderOpen size={48} className="text-[var(--pb-faint)] mx-auto mb-4" />
          <h1 className="font-pixel text-[var(--pb-text)] text-sm leading-relaxed mb-3">Galeri Tidak Ditemukan</h1>
          <p className="font-retro text-[var(--pb-text-muted)] text-base leading-relaxed mb-6">
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
    <div className="min-h-screen bg-[var(--pb-bg)] p-4 sm:p-8 pb-20">
      <div className="max-w-4xl mx-auto animate-pixel-fade-in">
        {/* ===== Header ===== */}
        <div className="text-center mb-6 pt-2 sm:pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-none bg-[#FF5A36]/15 border-[2px] border-[#FF5A36] text-[#FF5A36] font-pixel text-[9px] sm:text-[10px] tracking-widest uppercase mb-4 shadow-[2px_2px_0px_var(--pb-shadow-solid)]">
            <Sparkles size={14} />
            <span>PIXELBOOTH GALLERY</span>
          </div>
          <h1 className="font-pixel text-[var(--pb-text)] text-lg sm:text-2xl lg:text-3xl leading-relaxed truncate">{folder.name}</h1>
          <p className="font-retro text-[var(--pb-text-muted)] text-xl sm:text-2xl mt-1.5 tracking-wide">
            {folder.photos.length} foto tersimpan
          </p>
        </div>

        {/* ===== QR Share Card ===== */}
        <div className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-4 sm:p-5 mb-6 shadow-[3px_3px_0px_#000,6px_6px_0px_var(--pb-shadow-solid)] flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="bg-white p-2 rounded-none shrink-0 shadow-[2px_2px_0px_#000] border-[2px] border-black">
              <QRCodeSVG value={pageUrl} size={60} fgColor="#0A0A0A" />
            </div>
            <div className="min-w-0">
              <p className="font-pixel text-[var(--pb-text)] text-[11px] sm:text-xs leading-relaxed truncate">
                Bagikan Galeri Ini
              </p>
              <p className="font-retro text-[var(--pb-text-muted)] text-base sm:text-lg leading-relaxed truncate">
                Scan QR atau salin link untuk berbagi folder
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={handleShare}
            leftIcon={<Share2 size={16} />}
            className="shrink-0 ml-auto sm:ml-0"
          >
            Bagikan
          </Button>
        </div>

        {/* ===== Toolbar Aksi ===== */}
        {folder.photos.length > 0 && (
          <div className="bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] rounded-[4px] p-3 sm:p-4 mb-6 shadow-[3px_3px_0px_#000,5px_5px_0px_var(--pb-shadow-solid)] sticky top-3 z-20">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {!selectionMode ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <span className="font-pixel text-[var(--pb-text)] text-[10px] sm:text-xs leading-relaxed">
                      DAFTAR FOTO
                    </span>
                    <span className="font-retro text-[var(--pb-text-muted)] text-lg sm:text-xl font-bold">
                      ({folder.photos.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectionMode(true)}
                      leftIcon={<CheckSquare size={16} />}
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
                    <span className="font-retro text-sm text-[var(--pb-text-secondary)] pl-1">
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
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== Photos Grid ===== */}
        {folder.photos.length === 0 ? (
          <div className="bg-[var(--pb-surface)] border-[2px] border-dashed border-[var(--pb-border-strong)] rounded-[4px] p-10 flex flex-col items-center justify-center text-center">
            <ImageIcon size={44} className="text-[var(--pb-faint)] mb-3" />
            <p className="font-pixel text-[var(--pb-text)] text-[10px] leading-relaxed mb-2">Belum Ada Foto</p>
            <p className="font-retro text-[var(--pb-text-muted)] text-base max-w-xs leading-relaxed">
              Semua foto dalam folder ini mungkin telah dihapus atau belum ada sesi yang tersimpan.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 sm:gap-2.5">
            {folder.photos.map((photo, index) => {
              const isSelected = selectedTokens.has(photo.token)
              return (
                <div
                  key={photo.token}
                  className={`group relative aspect-[3/4] bg-[var(--pb-surface)] overflow-hidden cursor-pointer select-none
                    transition-[transform,box-shadow,border-color] duration-[60ms] rounded-none
                    border-[3px]
                    ${
                      isSelected
                        ? 'border-[#FF5A36] shadow-[3px_3px_0px_#FF5A36]'
                        : 'border-white shadow-[3px_3px_0px_var(--pb-shadow-solid)] hover:border-[#FF5A36] hover:shadow-[5px_5px_0px_var(--pb-shadow-solid)]'
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
                    src={getStorageUrl(photo.thumbnail_url || photo.photo_url || photo.url || '')}
                    alt={`Foto ${index + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />

                  {/* Number badge */}
                  <span className="absolute bottom-1 left-1 font-pixel text-white text-[7px] px-1.5 py-0.5 bg-black/90 border border-[#FF5A36]/50">
                    #{index + 1}
                  </span>

                  {/* Selection checkbox */}
                  {selectionMode && (
                    <div
                      className={`absolute top-1.5 right-1.5 w-5 h-5 sm:w-6 sm:h-6 rounded-none border-[2px] flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-[#FF5A36] border-black text-white shadow-[2px_2px_0px_#000]'
                          : 'bg-black/60 border-white/70 text-transparent'
                      }`}
                    >
                      <Check size={13} strokeWidth={3} />
                    </div>
                  )}

                  {/* Quick download on hover (desktop, non-selection mode) */}
                  {!selectionMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownloadSingle(photo)
                      }}
                      className="absolute top-1.5 right-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-none bg-black/90 border-[2px] border-[#FF5A36]/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-100 hover:bg-[#FF5A36] shadow-[2px_2px_0px_#000]"
                      title="Unduh Foto Ini"
                    >
                      <Download size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== Preview Modal ===== */}
      <AnimatePresence>
        {preview && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/95 z-50"
              onClick={() => setPreview(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.15, ease: 'linear' }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg"
            >
              <div className="bg-[var(--pb-surface)] border-[3px] border-[#FF5A36] rounded-[4px] p-4 shadow-[6px_6px_0px_var(--pb-shadow-solid)]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-pixel text-[var(--pb-text)] text-[9px] leading-relaxed truncate">{folder.name}</p>
                    <p className="font-retro text-[var(--pb-text-muted)] text-base">
                      Foto #{folder.photos.findIndex((p) => p.token === preview.token) + 1}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="w-8 h-8 rounded-[3px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] hover:border-[#FF5A36] hover:text-[#FF5A36] text-[var(--pb-text-secondary)] flex items-center justify-center transition-colors shrink-0 ml-auto shadow-[2px_2px_0px_var(--pb-shadow-solid)] active:translate-x-[1px] active:translate-y-[1px]"
                    title="Tutup"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="bg-black border-[2px] border-[var(--pb-border-strong)] overflow-hidden flex items-center justify-center max-h-[65vh]">
                  <img
                    src={getStorageUrl(preview.photo_url || preview.url || '')}
                    alt="Foto galeri"
                    className="max-w-full max-h-[65vh] object-contain"
                  />
                </div>

                <div className="mt-3 pt-3 border-t-[2px] border-dashed border-[var(--pb-border-strong)]">
                  <Button
                    variant="primary"
                    size="md"
                    fullWidth
                    onClick={() => handleDownloadSingle(preview)}
                    leftIcon={<Download size={16} />}
                  >
                    Unduh Foto
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default CustomerFolderPage