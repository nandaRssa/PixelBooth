import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Printer,
  X,
  Sliders,
  HelpCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Copy,
  Sparkles,
  Info,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/StatusBadge'
import { toast } from '@/components/ui/Toast'
import { getStorageUrl } from '@/api/client'
import {
  printPhotos,
  type PrintPaperSize,
  type PrintFitMode,
  type PrintPhotoItem,
} from '@/utils/printPhoto'

// ==========================================
// PIXELBOOTH — Print Modal (Retro Arcade Style)
// Modal pengaturan & eksekusi cetak foto resolusi tinggi
// Dioptimalkan khusus untuk Epson L3251
// ==========================================

export interface PrintModalProps {
  isOpen: boolean
  onClose: () => void
  photos: PrintPhotoItem | PrintPhotoItem[]
  title?: string
}

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  onClose,
  photos,
  title = 'Cetak Foto',
}) => {
  const photoList = useMemo(() => {
    return Array.isArray(photos) ? photos : photos ? [photos] : []
  }, [photos])

  const [activeTab, setActiveTab] = useState<'settings' | 'guide'>('settings')
  const [paperSize, setPaperSize] = useState<PrintPaperSize>('4R')
  const [fitMode, setFitMode] = useState<PrintFitMode>('cover')
  const [copies, setCopies] = useState<number>(1)
  const [twoUpStrip, setTwoUpStrip] = useState<boolean>(false)
  const [isPrinting, setIsPrinting] = useState<boolean>(false)
  const [previewIndex, setPreviewIndex] = useState<number>(0)

  if (!isOpen || photoList.length === 0 || typeof document === 'undefined') {
    return null
  }

  const currentPhoto = photoList[previewIndex] || photoList[0]
  const totalSheets = photoList.length * copies

  const handlePrint = async () => {
    setIsPrinting(true)
    try {
      await printPhotos(photoList, {
        paperSize,
        fitMode,
        copies,
        twoUpStrip,
        onComplete: () => {
          setIsPrinting(false)
          toast.success('Dialog cetak printer dibuka!')
        },
        onError: (err) => {
          setIsPrinting(false)
          toast.error(`Gagal mencetak: ${err.message}`)
        },
      })
    } catch (err: any) {
      setIsPrinting(false)
      toast.error('Terjadi kesalahan saat memproses cetakan.')
    }
  }

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          transition={{ type: 'spring', duration: 0.25 }}
          className="relative w-full max-w-3xl bg-[var(--pb-surface)] border-[3px] border-[var(--pb-border-strong)] rounded-[6px] shadow-[6px_6px_0px_#000,10px_10px_0px_var(--pb-shadow-solid)] overflow-hidden z-10 flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 bg-[var(--pb-elevated)] border-b-[2px] border-[var(--pb-border)]">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              {/* Icon Printer: Sembunyi pada tampilan handphone (hidden sm:flex) */}
              <div className="hidden sm:flex w-10 h-10 rounded-[4px] bg-[#FF5A36] border-[2px] border-black items-center justify-center text-white shadow-[2px_2px_0px_#000] shrink-0">
                <Printer size={20} className="stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-pixel text-[var(--pb-text)] text-sm sm:text-base lg:text-lg font-bold leading-tight truncate">
                  {title}
                </h3>
                <p className="font-retro text-[var(--pb-text-muted)] text-xs sm:text-sm font-bold mt-0.5 truncate">
                  Dioptimalkan untuk Epson L3251 / Photo Inkjet
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-[4px] bg-[var(--pb-surface)] border-[2px] border-[var(--pb-border-strong)] text-[var(--pb-text)] hover:text-white hover:bg-[#FF5A36] flex items-center justify-center transition-colors shadow-[2px_2px_0px_var(--pb-shadow-solid)] cursor-pointer shrink-0 ml-2"
              title="Tutup Modal (Esc)"
              aria-label="Tutup Modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b-[2px] border-[var(--pb-border)] bg-[var(--pb-bg)] px-5 pt-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-[4px] border-t-[2px] border-x-[2px] font-retro text-base font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-[var(--pb-surface)] border-[var(--pb-border-strong)] text-[#FFB800] translate-y-[2px]'
                  : 'bg-[var(--pb-elevated)] border-transparent text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]'
              }`}
            >
              <Sliders size={16} />
              <span>Opsi Cetak</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guide')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-[4px] border-t-[2px] border-x-[2px] font-retro text-base font-bold transition-all cursor-pointer ${
                activeTab === 'guide'
                  ? 'bg-[var(--pb-surface)] border-[var(--pb-border-strong)] text-[#00FFCC] translate-y-[2px]'
                  : 'bg-[var(--pb-elevated)] border-transparent text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]'
              }`}
            >
              <HelpCircle size={16} />
              <span>Panduan Epson L3251</span>
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {activeTab === 'settings' ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Left Column: Photo Preview */}
                <div className="md:col-span-5 flex flex-col items-center">
                  <div className="w-full relative aspect-[3/4] bg-black/60 border-[3px] border-black rounded-[4px] shadow-[4px_4px_0px_var(--pb-shadow-solid)] overflow-hidden flex items-center justify-center">
                    {twoUpStrip ? (
                      <div className="w-full h-full flex flex-row p-1 gap-1">
                        <div className="flex-1 h-full overflow-hidden flex items-center justify-center bg-zinc-900 border-r border-dashed border-zinc-700">
                          <img
                            src={getStorageUrl(currentPhoto.url)}
                            alt="Strip 1"
                            className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
                          />
                        </div>
                        <div className="flex-1 h-full overflow-hidden flex items-center justify-center bg-zinc-900">
                          <img
                            src={getStorageUrl(currentPhoto.url)}
                            alt="Strip 2"
                            className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
                          />
                        </div>
                      </div>
                    ) : (
                      <img
                        src={getStorageUrl(currentPhoto.url)}
                        alt={currentPhoto.title || 'Preview Foto'}
                        className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
                      />
                    )}

                    {/* Paper format badge */}
                    <div className="absolute top-2 right-2 px-2 py-1 bg-black/80 border border-[#00FFCC] rounded-[2px] font-pixel text-[10px] text-[#00FFCC] font-bold">
                      {twoUpStrip
                        ? '2-UP STRIP (4R)'
                        : paperSize === '4R'
                        ? '4R (10x15 CM)'
                        : paperSize === 'A4'
                        ? 'A4'
                        : 'AUTO'}
                    </div>
                  </div>

                  {/* Multi-photo carousel navigator */}
                  {photoList.length > 1 && (
                    <div className="flex items-center justify-between w-full mt-3 px-1">
                      <button
                        type="button"
                        onClick={() => setPreviewIndex((prev) => (prev > 0 ? prev - 1 : photoList.length - 1))}
                        className="w-8 h-8 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] text-[var(--pb-text)] hover:bg-[#FF5A36] hover:text-white flex items-center justify-center cursor-pointer shadow-[1px_1px_0px_#000]"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="font-retro text-sm font-bold text-[var(--pb-text)]">
                        Foto {previewIndex + 1} dari {photoList.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewIndex((prev) => (prev < photoList.length - 1 ? prev + 1 : 0))}
                        className="w-8 h-8 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border-strong)] text-[var(--pb-text)] hover:bg-[#FF5A36] hover:text-white flex items-center justify-center cursor-pointer shadow-[1px_1px_0px_#000]"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Column: Settings */}
                <div className="md:col-span-7 space-y-5">
                  {/* 1. Ukuran Kertas */}
                  <div>
                    <label className="block font-retro text-[var(--pb-text)] text-base font-bold mb-2 flex items-center gap-1.5">
                      <Layers size={16} className="text-[#FF5A36]" />
                      Format Kertas:
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPaperSize('4R')
                          setTwoUpStrip(false)
                        }}
                        className={`p-3 rounded-[4px] border-[2px] text-left transition-all cursor-pointer ${
                          paperSize === '4R' && !twoUpStrip
                            ? 'bg-[#FF5A36]/15 border-[#FF5A36] text-[var(--pb-text)] shadow-[2px_2px_0px_#000]'
                            : 'bg-[var(--pb-bg)] border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)]'
                        }`}
                      >
                        <p className="font-retro text-base font-bold text-[var(--pb-text)]">4R (10 x 15 cm)</p>
                        <p className="font-retro text-xs text-[var(--pb-text-muted)] mt-0.5">Standar Photobooth</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPaperSize('4R')
                          setTwoUpStrip(true)
                        }}
                        className={`p-3 rounded-[4px] border-[2px] text-left transition-all cursor-pointer ${
                          twoUpStrip
                            ? 'bg-[#FFB800]/15 border-[#FFB800] text-[var(--pb-text)] shadow-[2px_2px_0px_#000]'
                            : 'bg-[var(--pb-bg)] border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)]'
                        }`}
                      >
                        <p className="font-retro text-base font-bold text-[var(--pb-text)]">2-Up Strip di 4R</p>
                        <p className="font-retro text-xs text-[var(--pb-text-muted)] mt-0.5">2 strip 2x6" 1 lembar</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPaperSize('A4')
                          setTwoUpStrip(false)
                        }}
                        className={`p-3 rounded-[4px] border-[2px] text-left transition-all cursor-pointer ${
                          paperSize === 'A4' && !twoUpStrip
                            ? 'bg-[#00FFCC]/15 border-[#00FFCC] text-[var(--pb-text)] shadow-[2px_2px_0px_#000]'
                            : 'bg-[var(--pb-bg)] border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)]'
                        }`}
                      >
                        <p className="font-retro text-base font-bold text-[var(--pb-text)]">A4 (21 x 29.7 cm)</p>
                        <p className="font-retro text-xs text-[var(--pb-text-muted)] mt-0.5">Kertas Dokumen/Foto</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPaperSize('auto')
                          setTwoUpStrip(false)
                        }}
                        className={`p-3 rounded-[4px] border-[2px] text-left transition-all cursor-pointer ${
                          paperSize === 'auto' && !twoUpStrip
                            ? 'bg-[#FF5A36]/15 border-[#FF5A36] text-[var(--pb-text)] shadow-[2px_2px_0px_#000]'
                            : 'bg-[var(--pb-bg)] border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)]'
                        }`}
                      >
                        <p className="font-retro text-base font-bold text-[var(--pb-text)]">Auto / Default</p>
                        <p className="font-retro text-xs text-[var(--pb-text-muted)] mt-0.5">Ukuran Driver Printer</p>
                      </button>
                    </div>
                  </div>

                  {/* 2. Mode Pas Gambar (Fit / Borderless Fill) */}
                  <div>
                    <label className="block font-retro text-[var(--pb-text)] text-base font-bold mb-2 flex items-center gap-1.5">
                      <Maximize2 size={16} className="text-[#00FFCC]" />
                      Penyesuaian Gambar:
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setFitMode('cover')}
                        className={`p-2.5 rounded-[4px] border-[2px] text-left flex items-center justify-between transition-all cursor-pointer ${
                          fitMode === 'cover'
                            ? 'bg-[#FF5A36]/15 border-[#FF5A36] text-[var(--pb-text)] shadow-[2px_2px_0px_#000]'
                            : 'bg-[var(--pb-bg)] border-[var(--pb-border)] text-[var(--pb-text-muted)]'
                        }`}
                      >
                        <div>
                          <p className="font-retro text-base font-bold text-[var(--pb-text)]">Tanpa Tepi (Fill)</p>
                          <p className="font-retro text-xs text-[var(--pb-text-muted)]">Penuh satu halaman</p>
                        </div>
                        {fitMode === 'cover' && <Check size={16} className="text-[#FF5A36] stroke-[3]" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setFitMode('contain')}
                        className={`p-2.5 rounded-[4px] border-[2px] text-left flex items-center justify-between transition-all cursor-pointer ${
                          fitMode === 'contain'
                            ? 'bg-[#FF5A36]/15 border-[#FF5A36] text-[var(--pb-text)] shadow-[2px_2px_0px_#000]'
                            : 'bg-[var(--pb-bg)] border-[var(--pb-border)] text-[var(--pb-text-muted)]'
                        }`}
                      >
                        <div>
                          <p className="font-retro text-base font-bold text-[var(--pb-text)]">Pas Lembar (Fit)</p>
                          <p className="font-retro text-xs text-[var(--pb-text-muted)]">Tanpa pemotongan tepi</p>
                        </div>
                        {fitMode === 'contain' && <Check size={16} className="text-[#FF5A36] stroke-[3]" />}
                      </button>
                    </div>
                  </div>

                  {/* 3. Jumlah Rangkap (Copies) */}
                  <div>
                    <label className="block font-retro text-[var(--pb-text)] text-base font-bold mb-2 flex items-center gap-1.5">
                      <Copy size={16} className="text-[#FFB800]" />
                      Jumlah Rangkap Cetak (Copies):
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center border-[2px] border-[var(--pb-border-strong)] rounded-[4px] bg-[var(--pb-bg)] overflow-hidden shadow-[2px_2px_0px_#000]">
                        <button
                          type="button"
                          onClick={() => setCopies((c) => Math.max(1, c - 1))}
                          className="w-11 h-11 flex items-center justify-center font-retro text-xl font-bold text-[var(--pb-text)] hover:bg-[var(--pb-elevated)] active:bg-[#FF5A36] transition-colors cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-14 text-center font-pixel text-lg font-bold text-[var(--pb-text)] select-none">
                          {copies}x
                        </span>
                        <button
                          type="button"
                          onClick={() => setCopies((c) => Math.min(20, c + 1))}
                          className="w-11 h-11 flex items-center justify-center font-retro text-xl font-bold text-[var(--pb-text)] hover:bg-[var(--pb-elevated)] active:bg-[#FF5A36] transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <div className="font-retro text-sm text-[var(--pb-text-muted)]">
                        <p className="font-bold text-[var(--pb-text)]">Total: {totalSheets} Lembar</p>
                        <p className="text-xs">
                          {photoList.length} foto × {copies} rangkap
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Tab: Panduan Epson L3251 */
              <div className="space-y-4">
                <div className="p-4 rounded-[4px] bg-[var(--pb-bg)] border-[2px] border-[#00FFCC] shadow-[2px_2px_0px_#000]">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={18} className="text-[#00FFCC]" />
                    <h4 className="font-retro text-base sm:text-lg font-bold text-[#00FFCC]">
                      Rekomendasi Konfigurasi Driver Epson L3251
                    </h4>
                  </div>
                  <p className="font-retro text-sm sm:text-base text-[var(--pb-text-secondary)] leading-relaxed">
                    Untuk mendapatkan hasil cetak foto yang <b>tajam, warna cerah, dan tanpa garis putus-putus</b>,
                    pastikan mengatur dialog cetak Windows / Chrome sebagai berikut:
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-3.5 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border)]">
                    <p className="font-pixel text-xs text-[#FF5A36] uppercase font-bold">1. Jenis Kertas (Media Type)</p>
                    <p className="font-retro text-sm sm:text-base text-[var(--pb-text)] font-bold mt-1">
                      Epson Premium Glossy / Glossy Photo Paper
                    </p>
                    <p className="font-retro text-xs text-[var(--pb-text-muted)] mt-1">
                      Jangan pilih "Plain Paper" agar tinta diserap dengan kepadatan tinggi khusus kertas foto glossy/matte.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border)]">
                    <p className="font-pixel text-xs text-[#FFB800] uppercase font-bold">2. Kualitas Cetak (Quality)</p>
                    <p className="font-retro text-sm sm:text-base text-[var(--pb-text)] font-bold mt-1">
                      High (Tinggi) / 5760 x 1440 DPI
                    </p>
                    <p className="font-retro text-xs text-[var(--pb-text-muted)] mt-1">
                      Memberikan resolusi maksimum printer Epson EcoTank tanpa bintik atau garis nozzle.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border)]">
                    <p className="font-pixel text-xs text-[#00FFCC] uppercase font-bold">3. Margin & Borderless</p>
                    <p className="font-retro text-sm sm:text-base text-[var(--pb-text)] font-bold mt-1">
                      Tanpa Tepi (Borderless) / Margins: None (0 mm)
                    </p>
                    <p className="font-retro text-xs text-[var(--pb-text-muted)] mt-1">
                      Pada kertas 4R (10x15cm), aktifkan fitur Borderless agar foto tercetak penuh hingga ujung kertas.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-[4px] bg-[var(--pb-elevated)] border-[2px] border-[var(--pb-border)]">
                    <p className="font-pixel text-xs text-emerald-400 uppercase font-bold">4. Skala (Scale)</p>
                    <p className="font-retro text-sm sm:text-base text-[var(--pb-text)] font-bold mt-1">
                      100% (Default) / Fit to Printable Area
                    </p>
                    <p className="font-retro text-xs text-[var(--pb-text-muted)] mt-1">
                      Hilangkan centang "Header and Footers" di opsi cetak Chrome agar tanggal/URL tidak ikut tercetak.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-[var(--pb-elevated)] border-[2px] border-[#FFB800] rounded-[4px] flex items-start gap-2.5 shadow-[2px_2px_0px_#000]">
                  <Info size={18} className="text-[#FFB800] shrink-0 mt-0.5" />
                  <p className="font-retro text-xs sm:text-sm text-[var(--pb-text)] font-bold leading-relaxed">
                    Tips Photobooth Strip: Jika template berupa strip 2x6 inch, pilih opsi format <b className="text-[#FF5A36]">"2-Up Strip di 4R"</b>. Sistem akan otomatis menyusun 2 strip berdampingan di 1 lembar kertas 4R sehingga siap dipotong menjadi 2 lembar!
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 bg-[var(--pb-elevated)] border-t-[2px] border-[var(--pb-border)] shrink-0">
            <Button
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={isPrinting}
              className="w-full sm:w-auto !min-h-[44px] sm:!min-h-[48px] !px-6 !text-base sm:!text-lg font-bold justify-center"
            >
              Batal
            </Button>

            <Button
              variant="primary"
              size="lg"
              onClick={handlePrint}
              disabled={isPrinting}
              leftIcon={
                isPrinting ? (
                  <Spinner size="sm" className="text-white shrink-0" />
                ) : (
                  <Printer size={18} className="stroke-[2.5] shrink-0" />
                )
              }
              className="w-full sm:w-auto !bg-[#FF5A36] hover:!bg-[#FF7040] shadow-[3px_3px_0px_#000] !min-h-[46px] sm:!min-h-[48px] !px-6 !text-base sm:!text-lg font-bold justify-center"
            >
              {isPrinting
                ? 'Menyiapkan Cetakan...'
                : `Cetak Sekarang (${totalSheets} Lembar)`}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  )
}

export default PrintModal
