import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { db } from '../lib/db'
import { uploadToCloudinary } from '../lib/cloudinary'
import { generateQrDataUrl } from '../lib/qrcode'

export const sessionsRouter = new Hono()

// Helper: format template for response
function formatTemplate(t: any) {
  if (!t) return null
  return {
    id: t.id,
    name: t.name,
    template_url: t.template_url || t.template_file,
    preview_url: t.preview_url || t.preview_file || t.template_file,
    frame_count: t.frame_count || 1,
    canvas_width: t.canvas_width || 1200,
    canvas_height: t.canvas_height || 1800,
    frame_configuration: typeof t.frame_configuration === 'string'
      ? JSON.parse(t.frame_configuration || '[]')
      : t.frame_configuration || [],
  }
}

// Helper: format capture for response
function formatCapture(cap: any) {
  return {
    id: cap.id,
    session_id: cap.session_id,
    frame_number: cap.frame_number,
    photo_url: cap.photo_url || cap.photo_path,
    status: cap.status,
    captured_at: cap.captured_at,
  }
}

// POST /api/sessions
sessionsRouter.post('/', async (c) => {
  try {
    const json = await c.req.json().catch(() => ({}))
    const templateId = json.template_id
    const folderId = json.folder_id || null

    if (!templateId) {
      return c.json({ message: 'template_id wajib diisi' }, 400)
    }

    const template = await db.getTemplateById(templateId)
    if (!template) {
      return c.json({ message: `Template id ${templateId} tidak ditemukan` }, 404)
    }

    const sessionToken = randomUUID()
    const totalFrames = template.frame_count || 1

    const session = await db.createSession({
      template_id: template.id,
      folder_id: folderId,
      session_token: sessionToken,
      total_frames: totalFrames,
      current_frame: 1,
      status: 'active',
    })

    if (!session) {
      return c.json({ message: 'Session null setelah createSession' }, 500)
    }

    return c.json({
      message: 'Sesi foto berhasil dibuat',
      data: {
        ...session,
        template: formatTemplate(template),
        captures: [],
      },
    }, 201)
  } catch (err: any) {
    console.error('POST /sessions CRASH:', err)
    return c.json({
      message: err?.message || String(err) || 'Gagal membuat sesi',
      error_type: err?.constructor?.name,
      error_code: err?.code,
    }, 500)
  }
})

// GET /api/sessions/:id
sessionsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const result = await db.getSession(id)

    if (!result) {
      return c.json({ message: 'Sesi tidak ditemukan' }, 404)
    }

    const { session, template, captures, folder } = result

    return c.json({
      data: {
        ...session,
        template: formatTemplate(template),
        captures: (captures || []).map(formatCapture),
        folder: folder ? { id: folder.id, name: folder.name, share_token: folder.share_token } : null,
      },
    })
  } catch (err: any) {
    console.error('GET /sessions/:id error:', err)
    return c.json({ message: err?.message || 'Gagal mengambil sesi' }, 500)
  }
})

// POST /api/sessions/:id/capture
sessionsRouter.post('/:id/capture', async (c) => {
  try {
    const id = c.req.param('id')
    let frameNumber = 1
    let imageBase64 = ''

    // Try JSON first, then FormData
    const contentType = c.req.header('content-type') || ''
    if (contentType.includes('multipart') || contentType.includes('form')) {
      const body = await c.req.parseBody().catch(() => ({}))
      frameNumber = Number(body.frame_number || 1)
      imageBase64 = (body.image || body.photo) as string
    } else {
      const json = await c.req.json().catch(() => ({}))
      frameNumber = Number(json.frame_number || 1)
      imageBase64 = json.image || json.photo || ''
    }

    let photoUrl = ''
    if (imageBase64 && typeof imageBase64 === 'string') {
      photoUrl = await uploadToCloudinary(imageBase64, 'captures', `session-${id}-frame-${frameNumber}-${Date.now()}`)
    }

    const capture = await db.createCapture({
      session_id: Number(id),
      frame_number: frameNumber,
      photo_path: photoUrl,
      status: 'approved',
    })

    // Update session current_frame
    await db.updateSession(id, {
      current_frame: frameNumber + 1,
      status: 'in_progress',
    })

    return c.json({
      message: 'Foto berhasil disimpan',
      data: {
        id: capture?.id,
        session_id: capture?.session_id,
        frame_number: capture?.frame_number,
        photo_url: capture?.photo_path || photoUrl,
        status: capture?.status,
      },
    })
  } catch (err: any) {
    console.error('POST /sessions/:id/capture error:', err)
    return c.json({ message: err?.message || 'Gagal menyimpan foto' }, 500)
  }
})

// POST /api/sessions/:id/restart
sessionsRouter.post('/:id/restart', async (c) => {
  try {
    const id = c.req.param('id')
    await db.updateSession(id, { current_frame: 1, status: 'ready' })
    return c.json({ message: 'Sesi foto berhasil diulang dari awal' })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengulang sesi' }, 500)
  }
})

// POST /api/sessions/:id/complete
sessionsRouter.post('/:id/complete', async (c) => {
  try {
    const id = c.req.param('id')
    const json = await c.req.json().catch(() => ({}))
    const finalImageBase64 = json.final_image_base64

    let finalUrl = ''
    if (finalImageBase64) {
      finalUrl = await uploadToCloudinary(finalImageBase64, 'photos', `final-session-${id}-${Date.now()}`)
    }

    const sessionData = await db.getSession(id)
    const session = sessionData?.session

    const uniqueToken = randomUUID()
    const frontendUrl = process.env.FRONTEND_URL || 'https://pixel-booth-spot-unsil.vercel.app'
    const photoViewUrl = `${frontendUrl}/photo/${uniqueToken}`
    const qrDataUrl = await generateQrDataUrl(photoViewUrl)

    const photo = await db.createPhoto({
      session_id: Number(id),
      folder_id: (session as any)?.folder_id || null,
      filename: `Photo-${Date.now()}.jpg`,
      storage_path: finalUrl,
      thumbnail_path: finalUrl,
      unique_token: uniqueToken,
      qr_path: qrDataUrl,
      is_final: true,
    })

    await db.updateSession(id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    })

    return c.json({
      message: 'Sesi foto selesai',
      data: {
        photo: {
          id: photo?.id,
          photo_url: (photo as any)?.storage_path || finalUrl,
          unique_token: uniqueToken,
          qr_url: qrDataUrl,
          qr_link: photoViewUrl,
        },
      },
    })
  } catch (err: any) {
    console.error('POST /sessions/:id/complete error:', err)
    return c.json({ message: err?.message || 'Gagal menyelesaikan sesi' }, 500)
  }
})

// POST /api/sessions/:id/folder
sessionsRouter.post('/:id/folder', async (c) => {
  try {
    const id = c.req.param('id')
    const { folder_id } = await c.req.json().catch(() => ({ folder_id: null }))
    await db.updateSession(id, { folder_id })
    return c.json({ message: 'Folder tujuan sesi berhasil diubah' })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengubah folder' }, 500)
  }
})
