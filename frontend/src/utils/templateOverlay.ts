// ==========================================
// PIXELBOOTH — Template Overlay Builder
// Membangun layer desain dengan LUBANG mask kamera hasil konfigurasi
// frame manual user (Hard Clear Zone + Connected Region Clearing).
// Desain ditaruh DI ATAS kamera; hanya area clear yang transparan —
// elemen desain di perifer otomatis dipertahankan.
// ==========================================

import type { CameraFrame } from '@/types'
import { computeHoleMask, downscaleTemplate, type WorkTemplate } from './frameMask'
import { getStorageUrl } from '@/api/client'

/** Muat gambar dan tunggu sampai siap dengan CORS & fallback Blob. */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const url = getStorageUrl(src)

  // 1. Fetch via Blob terlebih dahulu agar 100% bebas SecurityError di iOS Safari / WebKit
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) {
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Gagal memuat blob gambar template'))
        img.src = blobUrl
      })
    }
  } catch {
    // Fallback ke direct image load jika fetch diblokir
  }

  // 2. Direct image load dengan crossOrigin anonymous
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal memuat gambar template'))
    img.src = url
  })
}

/**
 * Bangun canvas desain (canvasW x canvasH) dengan lubang mask per frame.
 * Caller menggambar canvas ini DI ATAS video/foto kamera.
 */
export function buildOverlayCanvas(
  templateImg: HTMLImageElement,
  frames: CameraFrame[],
  canvasW: number,
  canvasH: number,
  work?: WorkTemplate
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas tidak tersedia')

  // Regangkan template ke ukuran canvas, sama seperti PhotoRenderService
  ctx.drawImage(templateImg, 0, 0, canvasW, canvasH)

  if (frames.length === 0) return canvas

  const wt = work ?? downscaleTemplate(templateImg, canvasW, canvasH)
  const tmp = document.createElement('canvas')
  const tmpCtx = tmp.getContext('2d')
  if (!tmpCtx) throw new Error('Canvas tidak tersedia')

  ctx.globalCompositeOperation = 'destination-out'
  for (const frame of frames) {
    const mask = computeHoleMask(wt, frame)
    if (!mask) continue

    tmp.width = mask.imageData.width
    tmp.height = mask.imageData.height
    tmpCtx.putImageData(mask.imageData, 0, 0)

    // bx/by/bw/bh sudah koordinat canvas — drawImage sekaligus meng-upscale
    // imageData ruang kerja ke ukuran canvas. Jangan konversi kedua kali.
    ctx.drawImage(tmp, mask.bx, mask.by, mask.bw, mask.bh)
  }
  ctx.globalCompositeOperation = 'source-over'

  return canvas
}

/** Versi dataURL (untuk <img> overlay di PhotoCapturePage). */
export async function buildTemplateOverlay(
  templateUrl: string,
  frames: CameraFrame[],
  canvasWidth: number,
  canvasHeight: number
): Promise<string> {
  const img = await loadImage(templateUrl)
  return buildOverlayCanvas(img, frames, canvasWidth, canvasHeight).toDataURL('image/png')
}

/**
 * Render komposit final foto: gabungkan background, foto-foto capture sesuai slot,
 * dan template design dengan mask lubang ke dalam satu Canvas beresolusi tinggi,
 * lalu kembalikan sebagai base64 JPEG data URL.
 */
export async function renderFinalComposite(
  templateUrl: string,
  frames: CameraFrame[],
  frameImages: (string | null | undefined)[],
  canvasWidth: number,
  canvasHeight: number
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia')

  // 1. Background gelap
  ctx.fillStyle = '#121212'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // 2. Gambar setiap foto capture ke posisinya masing-masing
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const imgSource = frameImages[i]
    if (!imgSource) continue

    try {
      const photoImg = await loadImage(imgSource)
      ctx.save()

      const cx = frame.x + frame.width / 2
      const cy = frame.y + frame.height / 2

      ctx.translate(cx, cy)
      if (frame.rotation) {
        ctx.rotate((frame.rotation * Math.PI) / 180)
      }
      ctx.scale(frame.flip_h ? -1 : 1, frame.flip_v ? -1 : 1)

      // Hitung cover crop
      const pw = photoImg.naturalWidth || photoImg.width
      const ph = photoImg.naturalHeight || photoImg.height
      const targetAspect = frame.width / frame.height
      const photoAspect = pw / ph

      let sx = 0, sy = 0, sw = pw, sh = ph
      if (photoAspect > targetAspect) {
        sw = ph * targetAspect
        sx = (pw - sw) / 2
      } else {
        sh = pw / targetAspect
        sy = (ph - sh) / 2
      }

      ctx.drawImage(
        photoImg,
        sx,
        sy,
        sw,
        sh,
        -frame.width / 2,
        -frame.height / 2,
        frame.width,
        frame.height
      )
      ctx.restore()
    } catch {
      // Lewati jika salah satu capture gagal dimuat
    }
  }

  // 3. Gambar template desain di atas foto
  if (templateUrl) {
    try {
      const templateImg = await loadImage(templateUrl)
      const overlayCanvas = buildOverlayCanvas(templateImg, frames, canvasWidth, canvasHeight)
      ctx.drawImage(overlayCanvas, 0, 0, canvasWidth, canvasHeight)
    } catch {
      // Fallback
    }
  }

  return canvas.toDataURL('image/jpeg', 0.95)
}
