// ==========================================
// PIXELBOOTH — Template Overlay Builder
// Membangun layer desain dengan LUBANG mask kamera hasil konfigurasi
// frame manual user (Hard Clear Zone + Connected Region Clearing).
// Desain ditaruh DI ATAS kamera; hanya area clear yang transparan —
// elemen desain di perifer otomatis dipertahankan.
// ==========================================

import type { CameraFrame } from '@/types'
import { computeHoleMask, downscaleTemplate, type WorkTemplate } from './frameMask'

/** Muat gambar dan tunggu sampai siap. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal memuat gambar template'))
    img.src = src
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
