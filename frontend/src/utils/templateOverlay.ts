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
export function loadImage(src: string): Promise<HTMLImageElement> {
  const url = getStorageUrl(src)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => {
      // Fallback: Fetch via Blob untuk melewati blokir CORS canvas
      fetch(url, { mode: 'cors' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error ${res.status}`)
          return res.blob()
        })
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob)
          const fallbackImg = new Image()
          fallbackImg.onload = () => resolve(fallbackImg)
          fallbackImg.onerror = () => reject(new Error('Gagal memuat gambar template'))
          fallbackImg.src = blobUrl
        })
        .catch(() => reject(new Error('Gagal memuat gambar template')))
    }
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
