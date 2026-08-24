import { Hono } from 'hono'
import { db } from '../lib/db'
import { saveMedia } from '../lib/storage'
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
    status: cap.status || 'approved',
    captured_at: cap.captured_at,
  }
}

// Helper: assemble complete session payload
async function getFullSessionPayload(sessionId: number | string) {
  const result = await db.getSession(sessionId)
  if (!result || !result.session) return null
  const { session, template, captures, folder } = result
  return {
    ...session,
    template: formatTemplate(template),
    captures: (captures || []).map(formatCapture),
    folder: folder ? { id: folder.id, name: folder.name, share_token: folder.share_token } : null,
  }
}

// Cross-env safe UUID
function generateUUID(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// POST /api/sessions (Create Session)
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

    const sessionToken = generateUUID()
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
      return c.json({ message: 'Gagal membuat sesi' }, 500)
    }

    const fullSession = await getFullSessionPayload(session.id)

    return c.json({
      message: 'Sesi foto dimulai.',
      data: fullSession,
    }, 201)
  } catch (err: any) {
    console.error('POST /sessions CRASH:', err)
    return c.json({
      message: err?.message || String(err) || 'Gagal membuat sesi',
    }, 500)
  }
})

// GET /api/sessions/:id (Show Session)
sessionsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const fullSession = await getFullSessionPayload(id)

    if (!fullSession) {
      return c.json({ message: 'Sesi tidak ditemukan' }, 404)
    }

    return c.json({ data: fullSession })
  } catch (err: any) {
    console.error('GET /sessions/:id error:', err)
    return c.json({ message: err?.message || 'Gagal mengambil sesi' }, 500)
  }
})

// POST /api/sessions/:id/capture (Capture Frame)
sessionsRouter.post('/:id/capture', async (c) => {
  try {
    const id = c.req.param('id')
    const sessionData = await db.getSession(id)
    if (!sessionData || !sessionData.session) {
      return c.json({ message: 'Sesi tidak ditemukan' }, 404)
    }

    const currentSession = sessionData.session
    const totalFrames = currentSession.total_frames || 1
    const frameNumber = currentSession.current_frame || 1

    let imageBase64 = ''

    // Read payload (supports { image_base64 } or { image } or FormData)
    const contentType = c.req.header('content-type') || ''
    if (contentType.includes('multipart') || contentType.includes('form')) {
      const body = await c.req.parseBody().catch(() => ({}))
      imageBase64 = (body.image_base64 || body.image || body.photo) as string
    } else {
      const json = await c.req.json().catch(() => ({}))
      imageBase64 = json.image_base64 || json.image || json.photo || ''
    }

    let photoUrl = ''
    if (imageBase64 && typeof imageBase64 === 'string') {
      photoUrl = await saveMedia(
        imageBase64,
        'captures',
        `session-${currentSession.session_token || id}-frame-${frameNumber}`
      )
    }

    const capture = await db.createCapture({
      session_id: Number(id),
      frame_number: frameNumber,
      photo_path: photoUrl,
      status: 'approved',
    })

    // Advance to next uncaptured frame or calculate all_done
    const allCaptures = (await db.getSession(id))?.captures || []
    const approvedFrames = allCaptures
      .filter((cap: any) => cap.status === 'approved' || cap.status === 'captured')
      .map((cap: any) => cap.frame_number)

    let nextFrame: number | null = null
    for (let i = 1; i <= totalFrames; i++) {
      if (!approvedFrames.includes(i)) {
        nextFrame = i
        break
      }
    }

    let allDone = false
    if (nextFrame === null) {
      await db.updateSession(id, { current_frame: totalFrames, status: 'active' })
      allDone = true
    } else {
      await db.updateSession(id, { current_frame: nextFrame, status: 'active' })
      allDone = false
    }

    const fullSession = await getFullSessionPayload(id)

    return c.json({
      message: `Frame ${frameNumber} berhasil di-capture.`,
      data: {
        capture: {
          id: capture?.id,
          session_id: Number(id),
          frame_number: frameNumber,
          photo_path: photoUrl,
          photo_url: photoUrl,
          status: 'approved',
        },
        session: fullSession,
        all_done: allDone,
      },
    })
  } catch (err: any) {
    console.error('POST /sessions/:id/capture error:', err)
    return c.json({ message: err?.message || 'Gagal menyimpan foto' }, 500)
  }
})

// POST /api/sessions/:id/retake (Retake Frame)
sessionsRouter.post('/:id/retake', async (c) => {
  try {
    const id = c.req.param('id')
    const json = await c.req.json().catch(() => ({}))
    const frameNumber = Number(json.frame_number || 1)

    await db.updateSession(id, {
      current_frame: frameNumber,
      status: 'active',
    })

    const fullSession = await getFullSessionPayload(id)
    return c.json({
      message: `Kamera kembali ke frame ${frameNumber} untuk pengambilan ulang.`,
      data: fullSession,
    })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal memulai retake' }, 500)
  }
})

// POST /api/sessions/:id/restart (Restart Session from frame 1)
sessionsRouter.post('/:id/restart', async (c) => {
  try {
    const id = c.req.param('id')
    await db.resetCaptures(id)
    await db.updateSession(id, { current_frame: 1, status: 'active' })

    const fullSession = await getFullSessionPayload(id)
    return c.json({
      message: 'Sesi diulangi dari awal (Frame 1).',
      data: fullSession,
    })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengulang sesi' }, 500)
  }
})

// POST /api/sessions/:id/complete (Complete Session & Final Photo)
sessionsRouter.post('/:id/complete', async (c) => {
  try {
    const id = c.req.param('id')
    const json = await c.req.json().catch(() => ({}))
    const finalImageBase64 = json.final_image_base64

    const sessionData = await db.getSession(id)
    if (!sessionData || !sessionData.session) {
      return c.json({ message: 'Sesi tidak ditemukan' }, 404)
    }

    const currentSession = sessionData.session

    let finalUrl = ''
    if (finalImageBase64) {
      try {
        finalUrl = await saveMedia(
          finalImageBase64,
          'photos',
          `${currentSession.session_token || id}-final`
        )
      } catch (err) {
        console.error('saveMedia finalImage error:', err)
      }
    }

    // Fallback: If composite image is missing or failed, use the latest valid capture from this session
    if (!finalUrl) {
      const captures = sessionData.captures || []
      if (captures && captures.length > 0) {
        const validCaptures = captures.filter((c: any) => c.status !== 'retaken')
        const chosen = validCaptures[validCaptures.length - 1] || captures[captures.length - 1]
        finalUrl = chosen.photo_url || chosen.photo_path || ''
      }
    }

    const uniqueToken = (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
        })

    const frontendUrl = process.env.FRONTEND_URL || 'https://pixel-booth-spot-unsil.vercel.app'
    const photoViewUrl = `${frontendUrl}/photo/${uniqueToken}`
    let qrPath = `qr/photos/${uniqueToken}.png`
    try {
      const qrDataUrl = await generateQrDataUrl(photoViewUrl)
      const uploadedQr = await saveMedia(qrDataUrl, 'qr', `${uniqueToken}.png`)
      if (uploadedQr && !uploadedQr.startsWith('data:') && uploadedQr.length <= 255) {
        qrPath = uploadedQr
      }
    } catch (e) {
      console.warn('QR upload skipped:', e)
    }

    const folderName = sessionData.folder?.name || ''
    const templateName = sessionData.template?.name || ''
    const scopeName = (folderName || templateName || 'Photo').replace(/[^A-Za-z0-9]/g, '') || 'Photo'
    const formattedFilename = `PixelBooth-${scopeName}-${Date.now()}.jpg`

    const photo = await db.createPhoto({
      session_id: Number(id),
      folder_id: currentSession.folder_id || null,
      filename: formattedFilename,
      storage_path: finalUrl,
      thumbnail_path: finalUrl,
      unique_token: uniqueToken,
      qr_path: qrPath,
      is_final: true,
    })

    await db.updateSession(id, {
      status: 'complete',
      completed_at: new Date().toISOString(),
    })

    const fullSession = await getFullSessionPayload(id)

    return c.json({
      message: 'Sesi selesai. Foto berhasil disimpan.',
      data: {
        session: fullSession,
        photo: {
          id: photo?.id,
          session_id: Number(id),
          folder_id: currentSession.folder_id,
          filename: formattedFilename,
          url: finalUrl,
          photo_url: finalUrl,
          thumbnail_url: finalUrl,
          unique_token: uniqueToken,
          qr_path: qrPath,
          qr_url: qrPath,
          qr_link: photoViewUrl,
        },
      },
    })
  } catch (err: any) {
    console.error('POST /sessions/:id/complete error:', err)
    return c.json({ message: err?.message || 'Gagal menyelesaikan sesi' }, 500)
  }
})

// POST /api/sessions/:id/cancel (Cancel Session)
sessionsRouter.post('/:id/cancel', async (c) => {
  try {
    const id = c.req.param('id')
    await db.updateSession(id, { status: 'cancelled' })
    return c.json({ message: 'Sesi dibatalkan dan file temporary telah dihapus.' })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal membatalkan sesi' }, 500)
  }
})

// POST /api/sessions/:id/set-folder & /folder (Set Folder)
async function handleSetFolder(c: any) {
  try {
    const id = c.req.param('id')
    const json = await c.req.json().catch(() => ({}))
    const folderId = json.folder_id !== undefined ? json.folder_id : null
    await db.updateSession(id, { folder_id: folderId })
    const fullSession = await getFullSessionPayload(id)
    return c.json({
      message: 'Folder tujuan berhasil diatur.',
      data: fullSession,
    })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengubah folder' }, 500)
  }
}

sessionsRouter.post('/:id/set-folder', handleSetFolder)
sessionsRouter.post('/:id/folder', handleSetFolder)
