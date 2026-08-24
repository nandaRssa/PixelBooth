import { Hono } from 'hono'
import { db } from '../lib/db'
import { uploadToCloudinary } from '../lib/cloudinary'

export const templatesRouter = new Hono()

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
    const frameCount = parseInt((body.frame_count as string) || '1')
    let frameConfig: any[] = []
    if (body.frame_configuration) {
      try { frameConfig = JSON.parse(body.frame_configuration as string) } catch {}
    }

    // Frontend sends 'template_file', accept both
    const file = (body.template_file || body.file) as File | string

    let fileUrl = ''
    if (file && typeof file !== 'string') {
      const buffer = Buffer.from(await file.arrayBuffer())
      fileUrl = await uploadToCloudinary(buffer, 'templates', `${Date.now()}-${(file as any).name || 'template.png'}`)
    } else if (typeof file === 'string' && file.length > 0) {
      fileUrl = file
    }

    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 7)}`

    const template = await db.createTemplate({
      name,
      slug,
      template_file: fileUrl,
      preview_file: fileUrl,
      frame_count: frameCount,
      canvas_width: canvasWidth,
      canvas_height: canvasHeight,
      status,
      frame_configuration: frameConfig,
    })

    return c.json({ message: 'Template berhasil diunggah', data: template }, 201)
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengunggah template' }, 500)
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
