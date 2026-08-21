// ==========================================
// PIXELBOOTH — Template Overlay Builder
// Membuat versi template yang area placeholder fotonya (putih) dibuat
// transparan, sehingga saat ditaruh DI ATAS video kamera, desain template
// (termasuk elemen yang menimpa bingkai) tetap terlihat di atas foto/kamera —
// persis seperti hasil render final PhotoRenderService.
// ==========================================

import type { PreviewSlot } from './previewSlots'

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

  // Regangkan template ke ukuran canvas, sama seperti PhotoRenderService
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight)

  // Gunakan destination-out untuk melubangi canvas mengikuti mask/shape slot secara presisi
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,1)'

  for (const slot of slots) {
    ctx.beginPath()
    const points = slot.mask
    if (Array.isArray(points) && points.length >= 3) {
      ctx.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1])
      }
      ctx.closePath()
      ctx.fill()
    } else if (slot.shape === 'circle' || slot.shape === 'oval') {
      const cx = slot.x + slot.width / 2
      const cy = slot.y + slot.height / 2
      const rx = slot.width / 2
      const ry = slot.height / 2
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI)
      ctx.fill()
    } else {
      // Fallback: rectangle
      ctx.rect(slot.x, slot.y, slot.width, slot.height)
      ctx.fill()
    }
  }

  // Kembalikan composite operation normal
  ctx.globalCompositeOperation = 'source-over'

  return canvas.toDataURL('image/png')
}