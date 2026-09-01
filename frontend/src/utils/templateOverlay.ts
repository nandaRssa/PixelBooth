// ==========================================
// PIXELBOOTH — Template Overlay & Fast Composite Builder
// Highly optimized with in-memory caching and parallel image loading.
// ==========================================

import type { CameraFrame } from '@/types'
import { computeHoleMask, downscaleTemplate, type WorkTemplate } from './frameMask'
import { getStorageUrl } from '@/api/client'

// In-memory image cache to avoid re-fetching the same image multiple times
const memoryImageCache = new Map<string, HTMLImageElement>()
const overlayCanvasCache = new Map<string, HTMLCanvasElement>()

/** Preload gambar template ke cache memori agar siap seketika saat render final */
export function preloadTemplateImage(src: string): void {
  if (!src || memoryImageCache.has(src)) return
  void loadImage(src).catch(() => {})
}

/** Muat gambar dengan in-memory cache, CORS & fallback cepat. */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  if (!src) throw new Error('Source gambar kosong')

  // Check in-memory cache
  if (memoryImageCache.has(src)) {
    const cached = memoryImageCache.get(src)!
    if (cached.complete && cached.naturalWidth > 0) {
      return cached
    }
  }

  // 1. Data URI atau Blob URL (Langsung decode tanpa network fetch)
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        memoryImageCache.set(src, img)
        resolve(img)
      }
      img.onerror = () => reject(new Error('Gagal memuat image data URI'))
      img.src = src
    })
  }

  const url = getStorageUrl(src)

  // 2. Direct Image Load dengan anonymous crossOrigin (paling cepat di browser modern)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        memoryImageCache.set(src, img)
        resolve(img)
      }
      img.onerror = () => reject(new Error('Gagal direct load'))
      img.src = url
    })
  } catch {
    // Fallback: Fetch via Blob jika direct load diblokir CORS
  }

  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) {
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          memoryImageCache.set(src, img)
          resolve(img)
        }
        img.onerror = () => reject(new Error('Gagal memuat blob template'))
        img.src = blobUrl
      })
    }
  } catch {
    // ignore
  }

  throw new Error('Gagal memuat gambar template')
}

/**
 * Bangun canvas desain (canvasW x canvasH) dengan lubang mask per frame.
 */
export function buildOverlayCanvas(
  templateImg: HTMLImageElement,
  frames: CameraFrame[],
  canvasW: number,
  canvasH: number,
  work?: WorkTemplate
): HTMLCanvasElement {
  const cacheKey = `${templateImg.src}_${canvasW}_${canvasH}_${frames.length}_${frames.map(f => `${f.x},${f.y},${f.width},${f.height}`).join(';')}`
  if (overlayCanvasCache.has(cacheKey)) {
    return overlayCanvasCache.get(cacheKey)!
  }

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas tidak tersedia')

  ctx.drawImage(templateImg, 0, 0, canvasW, canvasH)

  if (frames.length === 0) {
    overlayCanvasCache.set(cacheKey, canvas)
    return canvas
  }

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
    ctx.drawImage(tmp, mask.bx, mask.by, mask.bw, mask.bh)
  }
  ctx.globalCompositeOperation = 'source-over'

  overlayCanvasCache.set(cacheKey, canvas)
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
 * Render komposit final foto berkecepatan tinggi:
 * 1. Memuat seluruh foto & template secara PARALEL (bukan sekuensial)
 * 2. Menggunakan memory-cache jika gambar sudah pernah dimuat
 * 3. Menghasilkan output base64 JPEG yang ringan & tajam
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

  // Render bicubic anti-aliasing berkualitas tinggi untuk hasil cetak profesional
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 1. Muat template dan seluruh foto secara PARALEL
  const loadTasks: Promise<HTMLImageElement | null>[] = []
  
  // Task 0: Template
  loadTasks.push(templateUrl ? loadImage(templateUrl).catch(() => null) : Promise.resolve(null))

  // Tasks 1..N: Foto capture per frame
  for (let i = 0; i < frames.length; i++) {
    const src = frameImages[i]
    if (src) {
      loadTasks.push(loadImage(src).catch(() => null))
    } else {
      loadTasks.push(Promise.resolve(null))
    }
  }

  const [templateImg, ...photoImgs] = await Promise.all(loadTasks)

  // 2. Background gelap
  ctx.fillStyle = '#121212'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // 3. Render setiap foto capture ke dalam framenya
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const photoImg = photoImgs[i]
    if (!photoImg) continue

    try {
      ctx.save()

      const cx = frame.x + frame.width / 2
      const cy = frame.y + frame.height / 2

      ctx.translate(cx, cy)
      if (frame.rotation) {
        ctx.rotate((frame.rotation * Math.PI) / 180)
      }
      ctx.scale(frame.flip_h ? -1 : 1, frame.flip_v ? -1 : 1)

      // Cover crop calculation
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
      // Ignore individual frame rendering failure
    }
  }

  // 4. Render template overlay dengan mask lubang di atas foto
  if (templateImg) {
    try {
      const overlayCanvas = buildOverlayCanvas(templateImg, frames, canvasWidth, canvasHeight)
      ctx.drawImage(overlayCanvas, 0, 0, canvasWidth, canvasHeight)
    } catch {
      // Fallback
    }
  }

  // Gunakan quality 0.96 (standar cetak foto profesional, tajam, tanpa artefak)
  return canvas.toDataURL('image/jpeg', 0.96)
}
