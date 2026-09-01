// ==========================================
// PIXELBOOTH — Engine Cetak Foto Kualitas Maksimal (High-DPI)
// Dioptimalkan khusus untuk printer foto (Epson L3251 / EcoTank series)
// Menggunakan iframe terisolasi agar render tajam, tanpa header/footer URL browser,
// dan mendukung cetak 1 foto, batch multi-foto, 2-Up photostrip di kertas 4R, dan A4.
// ==========================================

import { getStorageUrl } from '@/api/client'

export type PrintPaperSize = '4R' | '2x6_strip_on_4R' | 'A4' | 'auto'
export type PrintFitMode = 'cover' | 'contain'

export interface PrintPhotoItem {
  id?: number | string
  url: string
  title?: string
}

export interface PrintOptions {
  paperSize?: PrintPaperSize
  fitMode?: PrintFitMode
  copies?: number
  twoUpStrip?: boolean
  onStart?: () => void
  onComplete?: () => void
  onError?: (err: Error) => void
}

/**
 * Preload gambar untuk memastikan resolusi penuh siap di-decode sebelum print dialog terbuka
 */
async function preloadImageBlobUrl(url: string): Promise<string> {
  const fullUrl = getStorageUrl(url)
  try {
    const res = await fetch(fullUrl, { mode: 'cors' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    // Fallback jika CORS fetch gagal, gunakan URL langsung
    return fullUrl
  }
}

/**
 * Eksekusi cetak foto resolusi tinggi melalui iframe terisolasi
 */
export async function printPhotos(
  photos: PrintPhotoItem | PrintPhotoItem[],
  options: PrintOptions = {}
): Promise<void> {
  const photoList = Array.isArray(photos) ? photos : [photos]
  if (photoList.length === 0) return

  const {
    paperSize = '4R',
    fitMode = 'cover',
    copies = 1,
    twoUpStrip = false,
    onStart,
    onComplete,
    onError,
  } = options

  onStart?.()

  try {
    // 1. Preload semua gambar menjadi Blob URLs agar instan dan tajam
    const blobUrls = await Promise.all(
      photoList.map((p) => preloadImageBlobUrl(p.url))
    )

    // 2. Buat iframe tersembunyi (kompatibel penuh dengan iPadOS Safari / iOS WebKit & Desktop)
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.left = '-9999px'
    iframe.style.top = '0'
    iframe.style.width = '1024px'
    iframe.style.height = '1024px'
    iframe.style.border = '0'
    iframe.style.opacity = '0.01'
    iframe.style.pointerEvents = 'none'
    iframe.setAttribute('aria-hidden', 'true')

    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      throw new Error('Gagal mengakses dokumen cetak iframe.')
    }

    // 3. Konfigurasi CSS ukuran halaman & layout
    let pageCssSize = 'auto'
    if (paperSize === '4R' || paperSize === '2x6_strip_on_4R') {
      pageCssSize = '102mm 152mm' // Standar 4R (4x6 inch)
    } else if (paperSize === 'A4') {
      pageCssSize = '210mm 297mm' // Standar A4
    }

    // Bangun elemen HTML per lembar (dikali jumlah copies)
    let pagesHtml = ''

    for (let c = 0; c < copies; c++) {
      for (let i = 0; i < photoList.length; i++) {
        const src = blobUrls[i]

        if (twoUpStrip || paperSize === '2x6_strip_on_4R') {
          // Layout 2-Up: 2 buah strip foto 2x6" berjajar di satu lembar kertas 4R (102x152mm)
          pagesHtml += `
            <div class="print-page two-up-page">
              <div class="strip-item">
                <img src="${src}" class="print-img ${fitMode}" alt="Strip 1" />
              </div>
              <div class="strip-divider"></div>
              <div class="strip-item">
                <img src="${src}" class="print-img ${fitMode}" alt="Strip 2" />
              </div>
            </div>
          `
        } else {
          // Layout 1 Foto per Halaman
          pagesHtml += `
            <div class="print-page">
              <img src="${src}" class="print-img ${fitMode}" alt="Foto ${i + 1}" />
            </div>
          `
        }
      }
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <title>PixelBooth Print</title>
          <style>
            @page {
              size: ${pageCssSize};
              margin: 0mm;
            }
            *, *::before, *::after {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 100%;
              height: 100%;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .print-page {
              width: 100vw;
              height: 100vh;
              page-break-inside: avoid;
              break-inside: avoid;
              page-break-after: always;
              break-after: page;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              background: #ffffff;
            }
            .print-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .print-img {
              display: block;
              image-rendering: -webkit-optimize-contrast;
              image-rendering: high-quality;
            }
            .print-img.cover {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            .print-img.contain {
              max-width: 100%;
              max-height: 100%;
              width: auto;
              height: auto;
              object-fit: contain;
            }
            /* Layout 2-Up Side by Side untuk Strip 2x6 di Kertas 4R */
            .two-up-page {
              display: flex;
              flex-direction: row;
              width: 100vw;
              height: 100vh;
              padding: 0;
            }
            .strip-item {
              flex: 1;
              height: 100%;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .strip-item .print-img {
              width: 100%;
              height: 100%;
              object-fit: ${fitMode === 'contain' ? 'contain' : 'cover'};
            }
            .strip-divider {
              width: 1px;
              height: 100%;
              background: transparent;
              border-right: 1px dashed rgba(0, 0, 0, 0.15);
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
        </body>
      </html>
    `

    doc.open()
    doc.write(htmlContent)
    doc.close()

    // 4. Tunggu seluruh gambar selesai di-load & di-decode oleh iframe
    const imgs = doc.querySelectorAll('img')
    const imgPromises = Array.from(imgs).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      return new Promise<void>((resolve) => {
        img.onload = () => resolve()
        img.onerror = () => resolve()
      })
    })

    await Promise.all(imgPromises)

    // Beri sedikit jeda mikro (100ms) agar paint layout rendering komplit
    await new Promise((r) => setTimeout(r, 100))

    // 5. Panggil dialog cetak browser / iPadOS AirPrint
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (printErr) {
      // Fallback jika browser mobile membatasi cross-frame printing
      const printWin = window.open('', '_blank')
      if (printWin) {
        printWin.document.write(htmlContent)
        printWin.document.close()
        printWin.focus()
        printWin.print()
      } else {
        throw printErr
      }
    }

    onComplete?.()

    // 6. Cleanup iframe & blob URLs
    setTimeout(() => {
      blobUrls.forEach((b) => {
        if (b.startsWith('blob:')) URL.revokeObjectURL(b)
      })
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe)
      }
    }, 60_000)
  } catch (err: any) {
    console.error('Gagal memproses cetak:', err)
    onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}

/**
 * Cetak halaman tes kualitas untuk Epson L3251
 */
export async function printQualityTestPage(): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1800
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 1200, 1800)
  grad.addColorStop(0, '#0a0500')
  grad.addColorStop(0.5, '#1e0c00')
  grad.addColorStop(1, '#001a14')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1200, 1800)

  // Border frame
  ctx.lineWidth = 16
  ctx.strokeStyle = '#FF5A36'
  ctx.strokeRect(40, 40, 1120, 1720)

  ctx.lineWidth = 4
  ctx.strokeStyle = '#FFB800'
  ctx.strokeRect(60, 60, 1080, 1680)

  // Header Title
  ctx.fillStyle = '#FF5A36'
  ctx.font = 'bold 54px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('PIXELBOOTH TEST PRINT', 600, 180)

  ctx.fillStyle = '#00FFCC'
  ctx.font = 'bold 36px sans-serif'
  ctx.fillText('EPSON L3251 CALIBRATION & QUALITY CHECK', 600, 240)

  // Color Bars Check
  const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF', '#000000', '#FFFFFF']
  const barWidth = 1000 / colors.length
  colors.forEach((c, idx) => {
    ctx.fillStyle = c
    ctx.fillRect(100 + idx * barWidth, 310, barWidth, 120)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.strokeRect(100 + idx * barWidth, 310, barWidth, 120)
  })

  // Grayscale Gradient Bar
  const grayGrad = ctx.createLinearGradient(100, 0, 1100, 0)
  grayGrad.addColorStop(0, '#000000')
  grayGrad.addColorStop(0.25, '#444444')
  grayGrad.addColorStop(0.5, '#888888')
  grayGrad.addColorStop(0.75, '#CCCCCC')
  grayGrad.addColorStop(1, '#FFFFFF')
  ctx.fillStyle = grayGrad
  ctx.fillRect(100, 460, 1000, 60)

  // Info Box
  ctx.fillStyle = '#FFF8E7'
  ctx.font = '28px sans-serif'
  ctx.textAlign = 'left'
  const instructions = [
    '• Ukuran Kertas Uji: 4R (102 x 152 mm / 4x6 inch) atau A4',
    '• Jenis Kertas: Epson Premium Glossy Photo Paper / Glossy',
    '• Kualitas Cetak: High / Tinggi (5760 x 1440 DPI)',
    '• Tanpa Tepi (Borderless): ON (Aktifkan di dialog cetak)',
    '• Tanggal Uji: ' + new Date().toLocaleString('id-ID'),
  ]
  instructions.forEach((text, i) => {
    ctx.fillText(text, 120, 600 + i * 50)
  })

  // Sharpness line test
  ctx.lineWidth = 1
  ctx.strokeStyle = '#00FFCC'
  for (let y = 900; y <= 1100; y += 10) {
    ctx.beginPath()
    ctx.moveTo(120, y)
    ctx.lineTo(1080, y)
    ctx.stroke()
  }

  // Footer text
  ctx.fillStyle = '#FFB800'
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('SIAP DIGUNAKAN UNTUK SESI PHOTOBOOTH', 600, 1680)

  const testDataUrl = canvas.toDataURL('image/jpeg', 0.98)
  await printPhotos({ url: testDataUrl, title: 'Halaman Tes Epson L3251' }, { paperSize: '4R', fitMode: 'contain' })
}
