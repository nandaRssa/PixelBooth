// ==========================================
// PIXELBOOTH — Preview Slot Resolver
// Mencerminkan PhotoRenderService::resolveSlots.
// Frame manual user = sumber kebenaran; auto layout hanya
// fallback untuk template legacy tanpa konfigurasi.
// ==========================================

import type { CameraFrame, Template } from '@/types'
import { normalizeFrame } from './frameMask'

export type PreviewSlot = CameraFrame

export function resolvePreviewSlots(template: Template, count: number): PreviewSlot[] {
  if (count <= 0) return []

  const config = template.frame_configuration
  if (Array.isArray(config) && config.length > 0) {
    const slots = config
      .filter((s) => s && typeof s.x === 'number' && typeof s.y === 'number' && s.width > 0 && s.height > 0)
      .map((s, i) => ({ ...normalizeFrame(s), order: s.order ?? i }))
      .sort((a, b) => a.order - b.order)

    if (slots.length >= count) return slots.slice(0, count)
  }

  return autoLayout(template.canvas_width, template.canvas_height, count).map(normalizeFrame)
}

function autoLayout(canvasW: number, canvasH: number, count: number): Partial<CameraFrame>[] {
  const margin = Math.round(Math.min(canvasW, canvasH) * 0.04)

  if (count === 1) {
    return [
      {
        x: margin,
        y: margin,
        width: canvasW - margin * 2,
        height: canvasH - margin * 2,
      },
    ]
  }

  // Strip vertikal untuk 2-3 frame
  if (count <= 3) {
    const slotH = Math.floor((canvasH - margin * (count + 1)) / count)
    return Array.from({ length: count }, (_, i) => ({
      x: margin,
      y: margin + i * (slotH + margin),
      width: canvasW - margin * 2,
      height: slotH,
    }))
  }

  // Grid untuk 4+ frame
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const slotW = Math.floor((canvasW - margin * (cols + 1)) / cols)
  const slotH = Math.floor((canvasH - margin * (rows + 1)) / rows)

  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    return {
      x: margin + c * (slotW + margin),
      y: margin + r * (slotH + margin),
      width: slotW,
      height: slotH,
    }
  })
}
