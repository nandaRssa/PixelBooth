import { Hono } from 'hono'
import { supabase } from '../lib/supabase'
import { uploadToCloudinary } from '../lib/cloudinary'
import { generateQrDataUrl } from '../lib/qrcode'

export const sessionsRouter = new Hono()

// POST /api/sessions
sessionsRouter.post('/', async (c) => {
  const json = await c.req.json().catch(() => ({}))
  const templateId = json.template_id
  const folderId = json.folder_id || null

  const { data: template, error: tplErr } = await supabase.from('templates').select('*').eq('id', templateId).single()
  if (tplErr || !template) {
    return c.json({ message: 'Template tidak ditemukan' }, 404)
  }

  const sessionToken = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  const totalFrames = template.frame_count || 1

  const { data: session, error } = await supabase
    .from('photo_sessions')
    .insert({
      template_id: template.id,
      folder_id: folderId,
      session_token: sessionToken,
      total_frames: totalFrames,
      current_frame: 1,
      status: 'ready',
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return c.json({ message: error.message }, 500)
  }

  return c.json({
    message: 'Sesi foto berhasil dibuat',
    data: {
      ...session,
      template: {
        id: template.id,
        name: template.name,
        template_url: template.template_file,
        preview_url: template.preview_file || template.template_file,
        frame_count: template.frame_count,
        canvas_width: template.canvas_width,
        canvas_height: template.canvas_height,
        frame_configuration: typeof template.frame_configuration === 'string' ? JSON.parse(template.frame_configuration) : template.frame_configuration || [],
      },
      captures: [],
    },
  }, 201)
})

// GET /api/sessions/:id
sessionsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const { data: session, error } = await supabase.from('photo_sessions').select('*').eq('id', id).single()

  if (error || !session) {
    return c.json({ message: 'Sesi tidak ditemukan' }, 404)
  }

  const { data: template } = await supabase.from('templates').select('*').eq('id', session.template_id).single()
  const { data: captures } = await supabase.from('session_captures').select('*').eq('session_id', id).order('frame_number', { ascending: true })
  const { data: folder } = session.folder_id ? await supabase.from('folders').select('*').eq('id', session.folder_id).single() : { data: null }

  return c.json({
    data: {
      ...session,
      template: template ? {
        id: template.id,
        name: template.name,
        template_url: template.template_file,
        preview_url: template.preview_file || template.template_file,
        frame_count: template.frame_count,
        canvas_width: template.canvas_width,
        canvas_height: template.canvas_height,
        frame_configuration: typeof template.frame_configuration === 'string' ? JSON.parse(template.frame_configuration) : template.frame_configuration || [],
      } : null,
      captures: (captures || []).map((cap) => ({
        id: cap.id,
        session_id: cap.session_id,
        frame_number: cap.frame_number,
        photo_url: cap.photo_path,
        status: cap.status,
        captured_at: cap.captured_at,
      })),
      folder: folder ? { id: folder.id, name: folder.name, share_token: folder.share_token } : null,
    },
  })
})

// POST /api/sessions/:id/capture
sessionsRouter.post('/:id/capture', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.parseBody().catch(() => ({}))
  const json = await c.req.json().catch(() => ({}))

  const frameNumber = Number(body.frame_number || json.frame_number || 1)
  const imageBase64 = (json.image || json.photo || body.image || body.photo) as string

  let photoUrl = ''
  if (imageBase64 && typeof imageBase64 === 'string') {
    photoUrl = await uploadToCloudinary(imageBase64, 'captures', `session-${id}-frame-${frameNumber}-${Date.now()}`)
  }

  // Deactivate previous capture for this frame if any
  await supabase.from('session_captures').update({ status: 'retaken' }).eq('session_id', id).eq('frame_number', frameNumber)

  const { data: capture, error } = await supabase
    .from('session_captures')
    .insert({
      session_id: Number(id),
      frame_number: frameNumber,
      photo_path: photoUrl,
      status: 'approved',
      captured_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return c.json({ message: error.message }, 500)
  }

  // Update session current_frame
  await supabase.from('photo_sessions').update({
    current_frame: frameNumber + 1,
    status: 'in_progress',
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return c.json({
    message: 'Foto berhasil disimpan',
    data: {
      id: capture.id,
      session_id: capture.session_id,
      frame_number: capture.frame_number,
      photo_url: capture.photo_path,
      status: capture.status,
    },
  })
})

// POST /api/sessions/:id/restart
sessionsRouter.post('/:id/restart', async (c) => {
  const id = c.req.param('id')
  await supabase.from('session_captures').update({ status: 'retaken' }).eq('session_id', id)
  await supabase.from('photo_sessions').update({
    current_frame: 1,
    status: 'ready',
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return c.json({ message: 'Sesi foto berhasil diulang dari awal' })
})

// POST /api/sessions/:id/complete
sessionsRouter.post('/:id/complete', async (c) => {
  const id = c.req.param('id')
  const json = await c.req.json().catch(() => ({}))
  const finalImageBase64 = json.final_image_base64

  let finalUrl = ''
  if (finalImageBase64) {
    finalUrl = await uploadToCloudinary(finalImageBase64, 'photos', `final-session-${id}-${Date.now()}`)
  }

  const { data: session } = await supabase.from('photo_sessions').select('*').eq('id', id).single()
  const uniqueToken = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  const frontendUrl = process.env.FRONTEND_URL || 'https://pixel-booth-spot.vercel.app'
  const photoViewUrl = `${frontendUrl}/photo/${uniqueToken}`
  const qrDataUrl = await generateQrDataUrl(photoViewUrl)

  const { data: photo, error } = await supabase
    .from('photos')
    .insert({
      session_id: Number(id),
      folder_id: session?.folder_id || null,
      filename: `Photo-${Date.now()}.jpg`,
      storage_path: finalUrl,
      thumbnail_path: finalUrl,
      unique_token: uniqueToken,
      qr_path: qrDataUrl,
      is_final: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  await supabase.from('photo_sessions').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return c.json({
    message: 'Sesi foto selesai',
    data: {
      photo: {
        id: photo?.id,
        photo_url: photo?.storage_path,
        unique_token: photo?.unique_token,
        qr_url: qrDataUrl,
        qr_link: photoViewUrl,
      },
    },
  })
})

// POST /api/sessions/:id/folder
sessionsRouter.post('/:id/folder', async (c) => {
  const id = c.req.param('id')
  const { folder_id } = await c.req.json().catch(() => ({ folder_id: null }))
  await supabase.from('photo_sessions').update({ folder_id, updated_at: new Date().toISOString() }).eq('id', id)
  return c.json({ message: 'Folder tujuan sesi berhasil diubah' })
})
