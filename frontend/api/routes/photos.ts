import { Hono } from 'hono'
import { supabase } from '../lib/supabase'

export const photosRouter = new Hono()

// GET /api/photos
photosRouter.get('/', async (c) => {
  const folderId = c.req.query('folder_id')
  const page = Number(c.req.query('page') || 1)
  const perPage = Number(c.req.query('per_page') || 20)

  let query = supabase.from('photos').select('*', { count: 'exact' }).order('created_at', { ascending: false })

  if (folderId === 'null' || folderId === 'root' || folderId === '') {
    query = query.is('folder_id', null)
  } else if (folderId) {
    query = query.eq('folder_id', Number(folderId))
  }

  const from = (page - 1) * perPage
  const to = from + perPage - 1
  const { data: photos, count } = await query.range(from, to)

  const formatted = (photos || []).map((p) => ({
    id: p.id,
    token: p.unique_token,
    filename: p.filename,
    photo_url: p.storage_path,
    thumbnail_url: p.thumbnail_path || p.storage_path,
    folder_id: p.folder_id,
    session_id: p.session_id,
    created_at: p.created_at,
  }))

  return c.json({
    data: formatted,
    meta: {
      current_page: page,
      per_page: perPage,
      total: count || 0,
      last_page: Math.ceil((count || 0) / perPage),
    },
  })
})

// GET /api/photos/:id
photosRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const { data: photo, error } = await supabase.from('photos').select('*').eq('id', id).single()

  if (error || !photo) {
    return c.json({ message: 'Foto tidak ditemukan' }, 404)
  }

  return c.json({
    data: {
      id: photo.id,
      token: photo.unique_token,
      filename: photo.filename,
      photo_url: photo.storage_path,
      thumbnail_url: photo.thumbnail_path || photo.storage_path,
      folder_id: photo.folder_id,
      session_id: photo.session_id,
      created_at: photo.created_at,
    },
  })
})

// GET /api/photos/by-token/:token (Public Customer Access)
photosRouter.get('/by-token/:token', async (c) => {
  const token = c.req.param('token')
  const { data: photo, error } = await supabase.from('photos').select('*').eq('unique_token', token).single()

  if (error || !photo) {
    return c.json({ message: 'Foto tidak ditemukan atau tautan kedaluwarsa' }, 404)
  }

  return c.json({
    data: {
      id: photo.id,
      token: photo.unique_token,
      filename: photo.filename,
      photo_url: photo.storage_path,
      thumbnail_url: photo.thumbnail_path || photo.storage_path,
      created_at: photo.created_at,
    },
  })
})

// DELETE /api/photos/:id
photosRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await supabase.from('photos').delete().eq('id', id)
  return c.json({ message: 'Foto berhasil dihapus' })
})

// POST /api/photos/bulk-delete
photosRouter.post('/bulk-delete', async (c) => {
  const { ids } = await c.req.json().catch(() => ({ ids: [] }))
  if (Array.isArray(ids) && ids.length > 0) {
    await supabase.from('photos').delete().in('id', ids)
  }
  return c.json({ message: `${ids.length} foto berhasil dihapus` })
})

// POST /api/photos/bulk-move
photosRouter.post('/bulk-move', async (c) => {
  const { photo_ids, folder_id } = await c.req.json().catch(() => ({}))
  if (Array.isArray(photo_ids) && photo_ids.length > 0) {
    await supabase.from('photos').update({ folder_id: folder_id || null }).in('id', photo_ids)
  }
  return c.json({ message: 'Foto berhasil dipindahkan' })
})
