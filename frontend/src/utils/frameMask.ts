// ==========================================
// PIXELBOOTH — Frame Mask Engine (frontend)
// Port 1:1 dari backend FrameMaskService.
//
// Prinsip:
// - Frame manual user adalah sumber kebenaran (tanpa deteksi warna global).
// - Hard Clear Zone (tengah frame) = seed yang WAJIB di-clear.
// - Clear meluas ke Connected Region yang kontinu dengan seed,
//   dibatasi Clear Expansion, Region Sensitivity & Edge Protection.
// - Elemen desain di perifer dipertahankan (kamera di-mask di bawahnya).
// ==========================================

import type { CameraFrame, ClearArea } from '@/types'

export const WORK_MAX = 480

/** Normalisasi frame parsial menjadi konfigurasi lengkap ber-default. */
export function normalizeFrame(frame: Partial<CameraFrame>): CameraFrame {
  const areas = (v: unknown): ClearArea[] => {
    if (!Array.isArray(v)) return []
    const out: ClearArea[] = []
    for (const a of v as Record<string, unknown>[]) {
      if (!a || typeof a !== 'object') continue
      const w = Number(a.w ?? a.width ?? 0)
      const h = Number(a.h ?? a.height ?? 0)
      if (w <= 0 || h <= 0) continue
      out.push({ x: Number(a.x ?? 0), y: Number(a.y ?? 0), w, h })
    }
    return out
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

  return {
    id: Number(frame.id ?? 0),
    order: Number(frame.order ?? 0),
    x: Number(frame.x ?? 0),
    y: Number(frame.y ?? 0),
    width: Math.max(1, Number(frame.width ?? 1)),
    height: Math.max(1, Number(frame.height ?? 1)),
    rotation: Number(frame.rotation ?? 0),
    flip_h: Boolean(frame.flip_h ?? false),
    flip_v: Boolean(frame.flip_v ?? false),
    clear_zone: clamp(Number(frame.clear_zone ?? 60), 5, 100),
    clear_expansion: clamp(Number(frame.clear_expansion ?? 25), 0, 200),
    region_sensitivity: clamp(Number(frame.region_sensitivity ?? 50), 0, 100),
    min_region_size: clamp(Number(frame.min_region_size ?? 1), 0, 50),
    edge_protection: clamp(Number(frame.edge_protection ?? 60), 0, 100),
    feather: clamp(Number(frame.feather ?? 2), 0, 20),
    protected_areas: areas(frame.protected_areas),
    remove_areas: areas(frame.remove_areas),
  }
}

export interface WorkTemplate {
  data: ImageData
  width: number
  height: number
  scale: number
}

/** Turunkan resolusi template ke resolusi kerja untuk analisis cepat. */
export function downscaleTemplate(
  source: HTMLImageElement | HTMLCanvasElement,
  canvasW: number,
  canvasH: number
): WorkTemplate {
  const scale = Math.min(1, WORK_MAX / Math.max(canvasW, canvasH))
  const gw = Math.max(1, Math.round(canvasW * scale))
  const gh = Math.max(1, Math.round(canvasH * scale))

  const cv = document.createElement('canvas')
  cv.width = gw
  cv.height = gh
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas tidak tersedia')
  ctx.drawImage(source, 0, 0, gw, gh)

  return { data: ctx.getImageData(0, 0, gw, gh), width: gw, height: gh, scale }
}

export interface HoleMask {
  /** bbox pada koordinat CANVAS (sudah dikonversi dari ruang kerja) */
  bx: number
  by: number
  bw: number
  bh: number
  /** RGBA bbox-size; alpha = jumlah lubang (0..255) */
  imageData: ImageData
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

/**
 * Hitung mask lubang kamera untuk satu frame.
 * Alpha hasil: 255 = lubang penuh (kamera terlihat), 0 = desain dipertahankan.
 */
export function computeHoleMask(
  wt: WorkTemplate,
  frame: CameraFrame
): HoleMask | null {
  const f = normalizeFrame(frame)
  const { data: wd, width: gw, height: gh, scale } = wt

  // Geometri frame pada ruang kerja
  const fw = Math.max(2, f.width * scale)
  const fh = Math.max(2, f.height * scale)
  const rot = (f.rotation * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const cx = f.x * scale + fw / 2
  const cy = f.y * scale + fh / 2
  const hw = fw / 2
  const hh = fh / 2

  // Hard Clear Zone (setengah-ukuran pada ruang lokal frame)
  const hzW = (fw * f.clear_zone) / 200
  const hzH = (fh * f.clear_zone) / 200
  const dHard = Math.sqrt(hzW * hzW + hzH * hzH)
  const expPx = ((f.clear_expansion / 100) * Math.min(fw, fh))
  const dMax = dHard + expPx

  const tol = 6 + f.region_sensitivity * 1.14
  const ep = f.edge_protection / 100

  // Area manual disimpan dari sudut kiri-atas frame; konversi ke basis pusat.
  // Area adalah KONTEN frame → posisinya ikut dicerminkan flip.
  const fxs = f.flip_h ? -1 : 1
  const fys = f.flip_v ? -1 : 1
  const protLocal = f.protected_areas.map((a) => [a.x * scale - hw, a.y * scale - hh, a.w * scale, a.h * scale])
  const remLocal = f.remove_areas.map((a) => [a.x * scale - hw, a.y * scale - hh, a.w * scale, a.h * scale])

  // Bounding box axis-aligned frame yang dirotasi (clamp ke canvas kerja)
  const corners: Array<[number, number]> = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lx, ly] of corners) {
    const px = cx + lx * cos - ly * sin
    const py = cy + lx * sin + ly * cos
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  const bx0 = Math.max(0, Math.floor(minX) - 1)
  const by0 = Math.max(0, Math.floor(minY) - 1)
  const bx1 = Math.min(gw - 1, Math.ceil(maxX) + 1)
  const by1 = Math.min(gh - 1, Math.ceil(maxY) + 1)
  const bw = bx1 - bx0 + 1
  const bh = by1 - by0 + 1
  if (bw <= 0 || bh <= 0) return null

  // Klasifikasi sel grid
  const inside = new Uint8Array(bw * bh)
  const seed = new Uint8Array(bw * bh)
  const prot = new Uint8Array(bw * bh)
  const rem = new Uint8Array(bw * bh)

  for (let gy = by0; gy <= by1; gy++) {
    for (let gx = bx0; gx <= bx1; gx++) {
      const dx = gx + 0.5 - cx
      const dy = gy + 0.5 - cy
      const lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos
      if (Math.abs(lx) > hw || Math.abs(ly) > hh) continue
      const idx = (gy - by0) * bw + (gx - bx0)
      inside[idx] = 1
      if (Math.abs(lx) <= hzW && Math.abs(ly) <= hzH) seed[idx] = 1
      // Uji area pada koordinat lokal yang sudah dicerminkan flip
      const alx = lx * fxs
      const aly = ly * fys
      for (const [ax, ay, aw, ah] of protLocal) {
        if (alx >= ax && alx <= ax + aw && aly >= ay && aly <= ay + ah) {
          prot[idx] = 1
          break
        }
      }
      for (const [ax, ay, aw, ah] of remLocal) {
        if (alx >= ax && alx <= ax + aw && aly >= ay && aly <= ay + ah) {
          rem[idx] = 1
          break
        }
      }
    }
  }

  // Warna rata-rata seed = referensi kontinuitas connected region
  let rs = 0
  let gs = 0
  let bs = 0
  let n = 0
  for (let i = 0; i < seed.length; i++) {
    if (!seed[i]) continue
    const o = ((by0 + Math.floor(i / bw)) * gw + (bx0 + (i % bw))) * 4
    rs += wd.data[o]
    gs += wd.data[o + 1]
    bs += wd.data[o + 2]
    n++
  }
  if (n === 0) return null
  const avgR = rs / n
  const avgG = gs / n
  const avgB = bs / n

  // PRIORITAS 1: hard zone clear. PRIORITAS 2: connected region clearing.
  const cleared = new Uint8Array(seed)
  const queue: number[] = []
  for (let i = 0; i < seed.length; i++) if (seed[i]) queue.push(i)

  for (let qi = 0; qi < queue.length; qi++) {
    const idx = queue[qi]
    const gx = bx0 + (idx % bw)
    const gy = by0 + Math.floor(idx / bw)
    for (const [ox, oy] of NEIGHBORS) {
      const nx = gx + ox
      const ny = gy + oy
      if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
      const nidx = (ny - by0) * bw + (nx - bx0)
      if (cleared[nidx] || !inside[nidx]) continue
      if (prot[nidx]) continue // Protect Area menahan automatic clearing
      const ndx = nx + 0.5 - cx
      const ndy = ny + 0.5 - cy
      const dist = Math.sqrt(ndx * ndx + ndy * ndy)
      if (dist > dMax) continue // Clear Expansion habis
      // Edge Protection: makin jauh dari pusat, toleransi makin ketat
      const r = dMax > dHard ? (dist - dHard) / (dMax - dHard) : 0
      const effTol = tol * (1 - 0.85 * ep * r)
      const o = (ny * gw + nx) * 4
      const diff = Math.max(
        Math.abs(wd.data[o] - avgR),
        Math.abs(wd.data[o + 1] - avgG),
        Math.abs(wd.data[o + 2] - avgB)
      )
      if (diff > effTol) continue // elemen desain perifer — pertahankan
      cleared[nidx] = 1
      queue.push(nidx)
    }
  }

  // Manual Remove Area: paksa clear (Protect tetap menang bila bentrok)
  for (let i = 0; i < rem.length; i++) {
    if (rem[i] && !prot[i] && inside[i]) cleared[i] = 1
  }

  // Minimum Region Size: buang pulau kecil tanpa seed
  const minArea = (f.min_region_size / 100) * fw * fh
  if (minArea > 1) {
    dropSmallIslands(cleared, seed, bw, bx0, by0, bx1, by1, minArea)
  }

  // Feather: box blur peta hole agar tepi halus
  let holeGrid = new Float32Array(bw * bh)
  for (let i = 0; i < cleared.length; i++) {
    if (cleared[i]) holeGrid[i] = 1
  }
  const fr = Math.round(f.feather * scale)
  if (fr > 0) {
    holeGrid = boxBlur(holeGrid, bw, bh, fr)
  }

  // Rasterisasi ke ImageData bbox (ruang kerja)
  const imgData = new ImageData(bw, bh)
  for (let i = 0; i < holeGrid.length; i++) {
    const a = Math.round(255 * Math.min(1, Math.max(0, holeGrid[i])))
    if (a > 0) {
      imgData.data[i * 4 + 3] = a
    }
  }

  const inv = 1 / scale
  return {
    bx: Math.floor(bx0 * inv),
    by: Math.floor(by0 * inv),
    bw: Math.max(1, Math.ceil(bw * inv)),
    bh: Math.max(1, Math.ceil(bh * inv)),
    imageData: imgData,
  }
}

function dropSmallIslands(
  cleared: Uint8Array,
  seed: Uint8Array,
  bw: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
  minArea: number
): void {
  const comp = new Int32Array(cleared.length)
  const stack: number[] = []

  for (let start = 0; start < cleared.length; start++) {
    if (!cleared[start] || comp[start]) continue
    const cid = start + 1
    const members: number[] = [start]
    comp[start] = cid
    stack.push(start)

    while (stack.length > 0) {
      const idx = stack.pop() as number
      const gx = bx0 + (idx % bw)
      const gy = by0 + Math.floor(idx / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (cleared[nidx] && !comp[nidx]) {
          comp[nidx] = cid
          members.push(nidx)
          stack.push(nidx)
        }
      }
    }

    if (members.length >= minArea) continue
    let hasSeed = false
    for (const m of members) {
      if (seed[m]) {
        hasSeed = true
        break
      }
    }
    if (!hasSeed) {
      for (const m of members) cleared[m] = 0
    }
  }
}

/** Box blur separable dua-pass (sliding window). */
function boxBlur(grid: Float32Array<ArrayBuffer>, w: number, h: number, r: number): Float32Array<ArrayBuffer> {
  const div = 2 * r + 1
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)

  for (let y = 0; y < h; y++) {
    const base = y * w
    let sum = 0
    for (let k = -r; k <= r; k++) sum += grid[base + Math.min(w - 1, Math.max(0, k))]
    for (let x = 0; x < w; x++) {
      tmp[base + x] = sum / div
      sum +=
        grid[base + Math.min(w - 1, x + r + 1)] - grid[base + Math.max(0, x - r)]
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / div
      sum +=
        tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}
