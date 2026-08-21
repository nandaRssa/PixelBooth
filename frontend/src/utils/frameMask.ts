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

import type { CameraFrame, BrushPoint, ClearArea } from '@/types'

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

  const points = (v: unknown): BrushPoint[] => {
    if (!Array.isArray(v)) return []
    const out: BrushPoint[] = []
    for (const p of v as Record<string, unknown>[]) {
      if (!p || typeof p !== 'object') continue
      const pt: BrushPoint = { x: Number(p.x ?? 0), y: Number(p.y ?? 0) }
      // Urutan strok untuk resolusi Remove vs Keep (strok terakhir menang)
      if (typeof p.s === 'number' && Number.isFinite(p.s)) pt.s = Math.round(p.s)
      out.push(pt)
      if (out.length >= 48) break
    }
    return out
  }

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
    edge_cleanup: clamp(Math.round(Number(frame.edge_cleanup ?? 0) * 10) / 10, 0, 5),
    protected_areas: areas(frame.protected_areas),
    remove_areas: areas(frame.remove_areas),
    remove_seeds: points(frame.remove_seeds),
    protect_seeds: points(frame.protect_seeds),
    keep_seeds: points(frame.keep_seeds),
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
  /** Overlay tint region brush (remove=merah, protect=kuning, keep=hijau) */
  overlay: ImageData
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

  // Sangat peka warna: perubahan warna sekecil apa pun dipertahankan.
  // Default sens 50 -> tol 10. Harus identik dengan backend.
  const tol = 1 + f.region_sensitivity * 0.18
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

  // ===== REGION BRUSH (Remove / Protect / Keep-Restore) =====
  // Sapuan kuas disimpan sebagai SEED POINT. Seluruh region terhubung
  // (4-arah, mirip warna seed-nya sendiri) ikut diproses sampai bertemu
  // boundary warna berbeda / area lindungan / batas frame. Ukuran brush
  // TIDAK membatasi ukuran region. Harus identik dengan FrameMaskService.
  const tolR = Math.max(tol * 2, 12)
  const EMPTY: Uint8Array = new Uint8Array(inside.length)
  const seedToWork = (ax: number, ay: number): [number, number] | null => {
    // Seed disimpan dari sudut kiri-atas frame pada ruang KONTEN (ikut flip)
    const alx = ax * scale - hw
    const aly = ay * scale - hh
    const lx = alx * fxs
    const ly = aly * fys
    const dx = lx * cos - ly * sin
    const dy = lx * sin + ly * cos
    const gx = Math.round(cx + dx)
    const gy = Math.round(cy + dy)
    if (gx < bx0 || gy < by0 || gx > bx1 || gy > by1) return null
    const idx = (gy - by0) * bw + (gx - bx0)
    if (!inside[idx]) return null
    return [gx, gy]
  }
  const floodRegion = (out: Uint8Array, walls: Uint8Array, sx: number, sy: number) => {
    const startIdx = (sy - by0) * bw + (sx - bx0)
    if (out[startIdx] || walls[startIdx] || !inside[startIdx]) return
    const o0 = (sy * gw + sx) * 4
    const r0 = wd.data[o0]
    const g0 = wd.data[o0 + 1]
    const b0 = wd.data[o0 + 2]
    out[startIdx] = 1
    const stack: number[] = [startIdx]
    while (stack.length > 0) {
      const idx = stack.pop() as number
      const gx = bx0 + (idx % bw)
      const gy = by0 + Math.floor(idx / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (out[nidx] || walls[nidx] || !inside[nidx]) continue
        const o = (ny * gw + nx) * 4
        const diff = Math.max(
          Math.abs(wd.data[o] - r0),
          Math.abs(wd.data[o + 1] - g0),
          Math.abs(wd.data[o + 2] - b0)
        )
        if (diff > tolR) continue
        out[nidx] = 1
        stack.push(nidx)
      }
    }
  }

  /**
   * Flood per-seed dengan klaim urutan strok: mencatat cakupan region DAN
   * nomor strok terbesar yang mengklaim tiap piksel. Dinding = protect saja
   * agar Remove/Keep saling menimpa (strok terakhir menang), bukan saling
   * memblokir permanen.
   */
  const floodClaim = (
    cov: Uint8Array,
    seqArr: Int32Array,
    walls: Uint8Array,
    sx: number,
    sy: number,
    seq: number
  ) => {
    const startIdx = (sy - by0) * bw + (sx - bx0)
    if (walls[startIdx] || !inside[startIdx]) return
    const o0 = (sy * gw + sx) * 4
    const r0 = wd.data[o0]
    const g0 = wd.data[o0 + 1]
    const b0 = wd.data[o0 + 2]
    const visited = new Uint8Array(inside.length)
    visited[startIdx] = 1
    cov[startIdx] = 1
    if (seq > seqArr[startIdx]) seqArr[startIdx] = seq
    const stack: number[] = [startIdx]
    while (stack.length > 0) {
      const idx = stack.pop() as number
      const gx = bx0 + (idx % bw)
      const gy = by0 + Math.floor(idx / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (visited[nidx] || walls[nidx] || !inside[nidx]) continue
        const o = (ny * gw + nx) * 4
        const diff = Math.max(
          Math.abs(wd.data[o] - r0),
          Math.abs(wd.data[o + 1] - g0),
          Math.abs(wd.data[o + 2] - b0)
        )
        if (diff > tolR) continue
        visited[nidx] = 1
        cov[nidx] = 1
        if (seq > seqArr[nidx]) seqArr[nidx] = seq
        stack.push(nidx)
      }
    }
  }

  // Urutan prioritas: Protect > (Remove vs Keep: STROK TERAKHIR menang,
  // seri → Keep) > Smart Clear. Remove dan Keep bebas diulang bergantian.
  const seedProt = new Uint8Array(inside.length)
  for (const s of f.protect_seeds) {
    const pt = seedToWork(s.x, s.y)
    if (pt) floodRegion(seedProt, EMPTY, pt[0], pt[1])
  }
  const protGrid = new Uint8Array(inside.length)
  for (let i = 0; i < protGrid.length; i++) {
    protGrid[i] = prot[i] | seedProt[i] ? 1 : 0
  }

  const remCov = new Uint8Array(inside.length)
  const remSeq = new Int32Array(inside.length)
  for (const s of f.remove_seeds) {
    const pt = seedToWork(s.x, s.y)
    if (pt) floodClaim(remCov, remSeq, protGrid, pt[0], pt[1], s.s ?? 0)
  }
  const keepCov = new Uint8Array(inside.length)
  const keepSeq = new Int32Array(inside.length)
  for (const s of f.keep_seeds) {
    const pt = seedToWork(s.x, s.y)
    if (pt) floodClaim(keepCov, keepSeq, protGrid, pt[0], pt[1], s.s ?? 0)
  }

  // Resolusi konflik per piksel antara region Remove dan Keep.
  const keepGrid = new Uint8Array(inside.length)
  const remWon = new Uint8Array(inside.length)
  for (let i = 0; i < inside.length; i++) {
    const r = remCov[i]
    const k = keepCov[i]
    if (r && k) {
      if (remSeq[i] > keepSeq[i]) remWon[i] = 1
      else keepGrid[i] = 1
    } else if (r) {
      remWon[i] = 1
    } else if (k) {
      keepGrid[i] = 1
    }
  }

  // Guard gabungan: rect protect + region protect + region keep (hasil
  // resolusi) — menghalangi smart clear, absorpsi tepi, Edge Cleanup &
  // Full Clear. TIDAK menghalangi kuas Remove (strok terakhir menang).
  const guard = new Uint8Array(inside.length)
  for (let i = 0; i < guard.length; i++) {
    guard[i] = prot[i] | seedProt[i] | keepGrid[i] ? 1 : 0
  }
  const remAll = Uint8Array.from(rem)
  for (let i = 0; i < remWon.length; i++) {
    if (remWon[i]) remAll[i] = 1
  }

  // Tiga strategi clear:
  // 1. Full Clear (clear_zone >= 100): bolong seluruh frame tanpa syarat.
  // 2. MODE ISI PENUH: bila MAYORITAS area frame satu warna (rasio piksel
  //    mirip warna seed >= FILL_RATIO), bolong seluruh frame sekaligus —
  //    tanpa syarat konektivitas agar noise/gradasi halus tidak memecah
  //    lubang — kecuali piksel yang benar-benar beda warna (elemen) & protect.
  // 3. FRAME RAMAI: hard zone ternoda warna + flood fill ketat.
  const fullClear = f.clear_zone >= 100
  const tolHard = Math.max(tol * 2, 12)
  const tolFill = Math.max(tol * 4, 28)
  const FILL_RATIO = 0.55

  // Diff seluruh piksel inside terhadap warna rata-rata seed
  const diffs = new Uint8Array(inside.length)
  let insideCount = 0
  let sameCount = 0
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue
    const o = ((by0 + Math.floor(i / bw)) * gw + (bx0 + (i % bw))) * 4
    const diff = Math.min(
      255,
      Math.max(
        Math.abs(wd.data[o] - avgR),
        Math.abs(wd.data[o + 1] - avgG),
        Math.abs(wd.data[o + 2] - avgB)
      )
    )
    diffs[i] = diff
    insideCount++
    if (diff <= tolFill) sameCount++
  }

  const cleared = new Uint8Array(seed.length)
  const queue: number[] = []
  let fillMode = false

  if (fullClear) {
    for (let i = 0; i < inside.length; i++) if (inside[i] && !guard[i]) cleared[i] = 1
  } else if (insideCount > 0 && sameCount / insideCount >= FILL_RATIO) {
    fillMode = true
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i] || guard[i]) continue
      if (diffs[i] <= tolFill) cleared[i] = 1
    }
  } else {
    for (let i = 0; i < seed.length; i++) {
      if (!seed[i] || guard[i]) continue
      if (diffs[i] <= tolHard) {
        cleared[i] = 1
        queue.push(i)
      }
    }
  }

  if (!fillMode) {
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
        if (guard[nidx]) continue // Protect/Keep menahan automatic clearing
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
  }

  // PEMBERSIHAN TEPI (anti-fringe): serap pita transisi anti-alias di batas
  // antara area clear dan warna kuat di seberangnya, sehingga tidak ada sisa
  // tipis warna slot yang menempel di pinggiran elemen/border. Kandidat =
  // piksel dengan diff MENENGAH (di atas ambang clear, di bawah STRONG) yang
  // bersinggungan dengan area clear dan berbatasan langsung dengan warna kuat
  // dua langkah lebih jauh. Inti warna kuat (hitam pekal dsb.) tidak disentuh.
  const STRONG = 150
  for (let pass = 0; pass < 2; pass++) {
    const snap = Uint8Array.from(cleared)
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i] || snap[i] || guard[i]) continue
      const dP = diffs[i]
      if (dP <= tolFill || dP >= STRONG) continue // bukan pita transisi
      const gx = bx0 + (i % bw)
      const gy = by0 + Math.floor(i / bw)
      for (const [ox, oy] of NEIGHBORS) {
        const nx = gx + ox
        const ny = gy + oy
        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
        const nidx = (ny - by0) * bw + (nx - bx0)
        if (!snap[nidx]) continue // harus bersinggungan dengan area clear
        const qx = 2 * gx - nx
        const qy = 2 * gy - ny
        if (qx < bx0 || qy < by0 || qx > bx1 || qy > by1) continue
        const qidx = (qy - by0) * bw + (qx - bx0)
        if (!inside[qidx] || diffs[qidx] < STRONG) continue
        cleared[i] = 1 // pita transisi -> ikut clear sampai warna kuat
        break
      }
    }
  }

  // Manual Remove Area + Remove Brush: paksa clear (Guard tetap menang)
  for (let i = 0; i < remAll.length; i++) {
    // Force clear kuas/rect remove: hanya Protect yang absolut — region
    // Keep boleh ditimpa (strok terakhir menang).
    if (remAll[i] && !prot[i] && !seedProt[i] && inside[i]) cleared[i] = 1
  }

  // Minimum Region Size: buang pulau kecil tanpa seed (tidak relevan di
  // mode isi penuh — lubang memang sengaja satu keseluruhan)
  const minArea = (f.min_region_size / 100) * fw * fh
  if (!fillMode && minArea > 1) {
    dropSmallIslands(cleared, seed, bw, bx0, by0, bx1, by1, minArea)
  }

  // EDGE CLEANUP: dilasi lubang HANYA di boundary mask — menelan garis
  // tipis / halo warna / serpihan desain yang masih menempel di tepi area
  // kamera hasil Smart Clear, tanpa deteksi ulang. Mendukung nilai
  // fraksional (step 0.2 px): pass penuh = floor(N), sisa desimal menjadi
  // pass sebagian berupa kekuatan alpha di ring boundary. Protect Area
  // tidak pernah ter-clear dan area di luar frame tidak tersentuh. Bukan
  // penghalus (itu tugas Feather). Harus identik dengan FrameMaskService.
  const ecRaw = Math.max(0, Math.min(5, f.edge_cleanup))
  const ecFull = Math.floor(ecRaw)
  const ecFrac = ecRaw - ecFull
  const ecStrength = new Float32Array(inside.length)
  if (ecRaw > 0) {
    const D8: ReadonlyArray<readonly [number, number]> = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ]
    const dilateEdge = (commit: boolean, weight: number) => {
      const snap = Uint8Array.from(cleared)
      for (let i = 0; i < inside.length; i++) {
        if (!inside[i] || snap[i] || guard[i]) continue
        const gx = bx0 + (i % bw)
        const gy = by0 + Math.floor(i / bw)
        let touch = false
        for (const [ox, oy] of D8) {
          const nx = gx + ox
          const ny = gy + oy
          if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue
          if (snap[(ny - by0) * bw + (nx - bx0)]) {
            touch = true
            break
          }
        }
        if (!touch) continue
        if (commit) {
          cleared[i] = 1
        } else if (weight > ecStrength[i]) {
          ecStrength[i] = weight
        }
      }
    }
    for (let pass = 0; pass < ecFull; pass++) dilateEdge(true, 1)
    if (ecFrac > 0) dilateEdge(false, ecFrac)
  }

  // Feather: box blur peta hole agar tepi halus
  let holeGrid = new Float32Array(bw * bh)
  for (let i = 0; i < cleared.length; i++) {
    if (cleared[i]) holeGrid[i] = 1
  }
  for (let i = 0; i < ecStrength.length; i++) {
    if (ecStrength[i] > holeGrid[i]) holeGrid[i] = ecStrength[i]
  }
  // Keep / Restore menang atas SEMUA proses: kembalikan desain secara
  // penuh (alpha 0) bahkan setelah feather, agar tepi restore tetap tegas.
  for (let i = 0; i < keepGrid.length; i++) {
    if (keepGrid[i] && !remAll[i]) holeGrid[i] = 0
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

  // Overlay tint region brush untuk preview editor (bukan bagian dari
  // render final): remove=merah tipis, protect=kuning tipis, keep=hijau.
  // Prioritas tampil: Keep > Protect > Remove.
  const overlay = new ImageData(bw, bh)
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    if (keepGrid[i]) {
      r = 34
      g = 197
      b = 94
      a = 88
    } else if (guard[i]) {
      r = 250
      g = 204
      b = 21
      a = 72
    } else if (remAll[i]) {
      r = 239
      g = 68
      b = 68
      a = 64
    }
    if (a > 0) {
      overlay.data[i * 4] = r
      overlay.data[i * 4 + 1] = g
      overlay.data[i * 4 + 2] = b
      overlay.data[i * 4 + 3] = a
    }
  }

  const inv = 1 / scale
  return {
    bx: Math.floor(bx0 * inv),
    by: Math.floor(by0 * inv),
    bw: Math.max(1, Math.ceil(bw * inv)),
    bh: Math.max(1, Math.ceil(bh * inv)),
    imageData: imgData,
    overlay,
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
