import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { db } from '../lib/db'
import { saveMedia } from '../lib/storage'
import { detectFramesFromBuffer, decodeImage } from '../lib/frameDetector'

export const templatesRouter = new Hono()

// Helper: load image buffer from URL or local storage path
async function getImageBuffer(fileUrlOrPath: string): Promise<Buffer | null> {
  if (!fileUrlOrPath) return null

  // 1. Data URI
  if (fileUrlOrPath.startsWith('data:')) {
    const base64Part = fileUrlOrPath.split(',')[1] || fileUrlOrPath
    return Buffer.from(base64Part, 'base64')
  }

  // 2. Remote HTTP / HTTPS (Cloudinary / Supabase Storage)
  if (fileUrlOrPath.startsWith('http://') || fileUrlOrPath.startsWith('https://')) {
    try {
      const res = await fetch(fileUrlOrPath)
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      console.warn('Failed to fetch remote template image:', e)
      return null
    }
  }

  // 3. Local relative path (Laravel storage)
  const clean = fileUrlOrPath.replace(/^\/+/, '').replace(/^storage\//, '').replace(/^api\/storage\//, '')
  const candidates = [
    path.resolve(process.cwd(), '../backend/storage/app/public', clean),
    path.resolve(process.cwd(), '../backend/public/storage', clean),
    path.resolve(process.cwd(), 'storage/app/public', clean),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate)
    }
  }

  return null
}

// GET /api/templates
templatesRouter.get('/', async (c) => {
  const status = c.req.query('status')
  const templates = await db.getTemplates(status)
  return c.json({ data: templates })
})

// GET /api/templates/:id
templatesRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const template = await db.getTemplateById(id)
  if (!template) {
    return c.json({ message: 'Template tidak ditemukan' }, 404)
  }
  return c.json({ data: template })
})

// POST /api/templates
templatesRouter.post('/', async (c) => {
  try {
    const body = await c.req.parseBody()
    const name = (body.name as string) || 'Template Baru'
    const status = (body.status as string) || 'active'
    const canvasWidth = parseInt((body.canvas_width as string) || '1200')
    const canvasHeight = parseInt((body.canvas_height as string) || '1800')
    let frameCount = parseInt((body.frame_count as string) || '1')
    let frameConfig: any[] = []
    if (body.frame_configuration) {
      try { frameConfig = JSON.parse(body.frame_configuration as string) } catch {}
    }

    // Frontend sends 'template_file', accept both
    const file = (body.template_file || body.file) as File | string

    let fileUrl = ''
    let fileBuffer: Buffer | null = null

    if (file && typeof file !== 'string') {
      fileBuffer = Buffer.from(await file.arrayBuffer())
      fileUrl = await saveMedia(fileBuffer, 'templates', `${Date.now()}-${(file as any).name || 'template.png'}`)
    } else if (typeof file === 'string' && file.length > 0) {
      fileUrl = file
      fileBuffer = await getImageBuffer(fileUrl)
    }

    // Preserve exact original natural dimensions from the uploaded template file
    let finalCanvasWidth = parseInt((body.canvas_width as string) || '0')
    let finalCanvasHeight = parseInt((body.canvas_height as string) || '0')

    if (fileBuffer) {
      const decoded = decodeImage(fileBuffer)
      if (decoded && decoded.width > 0 && decoded.height > 0) {
        finalCanvasWidth = decoded.width
        finalCanvasHeight = decoded.height
      }
    }
    if (!finalCanvasWidth || isNaN(finalCanvasWidth)) finalCanvasWidth = 1200
    if (!finalCanvasHeight || isNaN(finalCanvasHeight)) finalCanvasHeight = 1800

    // Auto-detect frames on upload if no explicit configuration provided
    if (frameConfig.length === 0 && fileBuffer) {
      const detected = detectFramesFromBuffer(fileBuffer, finalCanvasWidth, finalCanvasHeight)
      if (detected && detected.frame_configuration.length > 0) {
        frameConfig = detected.frame_configuration
        frameCount = detected.frame_count
      }
    }

    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 7)}`

    const template = await db.createTemplate({
      name,
      slug,
      template_file: fileUrl,
      preview_file: fileUrl,
      frame_count: frameCount || frameConfig.length || 1,
      canvas_width: finalCanvasWidth,
      canvas_height: finalCanvasHeight,
      status,
      frame_configuration: frameConfig,
    })

    return c.json({ message: 'Template berhasil diunggah', data: template }, 201)
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengunggah template' }, 500)
  }
})

// POST /api/templates/:id/detect-frames (Intelligent Frame Detection)
templatesRouter.post('/:id/detect-frames', async (c) => {
  try {
    const id = c.req.param('id')
    const template = await db.getTemplateById(id)
    if (!template) {
      return c.json({ message: 'Template tidak ditemukan' }, 404)
    }

    const fileUrl = template.template_url || (template as any).template_file
    const buffer = await getImageBuffer(fileUrl)
    if (!buffer) {
      return c.json({ message: 'File template tidak ditemukan untuk dianalisis.' }, 404)
    }

    const result = detectFramesFromBuffer(buffer, template.canvas_width, template.canvas_height)

    const method = result?.detection_method || 'smart_clear'
    const frames = result?.frame_configuration || []
    const methodLabel = method === 'transparent' ? ' (Transparency Detection)' : ' (Smart Clear)'

    return c.json({
      message: frames.length > 0
        ? `Frames Detected: ${frames.length} bingkai${methodLabel}.`
        : 'Tidak ada area foto yang terdeteksi pada template ini.',
      data: {
        detection_method: method,
        frame_count: frames.length,
        frames: frames.map((f, i) => ({
          ...f,
          id: i + 1,
          order: i,
        })),
      },
    })
  } catch (err: any) {
    console.error('detect-frames error:', err)
    return c.json({ message: err?.message || 'Gagal menjalankan deteksi frame' }, 500)
  }
})

// PUT /api/templates/:id
templatesRouter.put('/:id', async (c) => {
  const id = c.req.param('id')
  const json = await c.req.json().catch(() => ({}))
  const updated = await db.updateTemplate(id, json)
  return c.json({ message: 'Template berhasil diperbarui', data: updated })
})

// DELETE /api/templates/:id
templatesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.deleteTemplate(id)
  return c.json({ message: 'Template berhasil dihapus' })
})

// POST /api/templates/bulk-delete
templatesRouter.post('/bulk-delete', async (c) => {
  const { ids } = await c.req.json().catch(() => ({ ids: [] }))
  if (Array.isArray(ids)) {
    for (const id of ids) {
      await db.deleteTemplate(id)
    }
  }
  return c.json({ message: `${ids.length} template berhasil dihapus` })
})
