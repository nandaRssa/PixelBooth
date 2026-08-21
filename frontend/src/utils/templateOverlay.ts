// ==========================================
// PIXELBOOTH — Template Overlay Builder
// Membuat versi template yang area placeholder fotonya (putih) dibuat
// transparan, sehingga saat ditaruh DI ATAS video kamera, desain template
// (termasuk elemen yang menimpa bingkai) tetap terlihat di atas foto/kamera —
// persis seperti hasil render final PhotoRenderService.
// ==========================================

import type { PreviewSlot } from './previewSlots'

const PLACEHOLDER_MIN = 218
const PLACEHOLDER_SATURATION = 40

export async function buildTemplateOverlay(
  templateUrl: string,
  slots: PreviewSlot[],
  canvasWidth: number,
  canvasHeight: number
): Promise<string> {
  const img = new Image()
  img.src = templateUrl
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Gagal memuat gambar template'))
  })

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas tidak tersedia')

  // Regangkan template ke ukuran canvas, sama seperti PhotoRenderService::drawBase
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight)

  for (const slot of slots) {
    const x = Math.max(0, Math.round(slot.x))
    const y = Math.max(0, Math.round(slot.y))
    const w = Math.min(canvasWidth - x, Math.round(slot.width))
    const h = Math.min(canvasHeight - y, Math.round(slot.height))
    if (w <= 0 || h <= 0) continue

    const imageData = ctx.getImageData(x, y, w, h)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const min = Math.min(r, g, b)
      const max = Math.max(r, g, b)
      if (min > PLACEHOLDER_MIN && max - min < PLACEHOLDER_SATURATION) {
        data[i + 3] = 0
      }
    }
    ctx.putImageData(imageData, x, y)
  }

  return canvas.toDataURL('image/png')
}