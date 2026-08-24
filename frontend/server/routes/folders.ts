import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { supabase } from '../lib/supabase'
import { generateQrDataUrl } from '../lib/qrcode'

export const foldersRouter = new Hono()

// GET /api/folders
foldersRouter.get('/', async (c) => {
  const parentId = c.req.query('parent_id')
  let query = supabase.from('folders').select('*').order('created_at', { ascending: false })

  if (parentId === 'null' || parentId === '' || !parentId) {
    query = query.is('parent_folder_id', null)
  } else {
    query = query.eq('parent_folder_id', Number(parentId))
  }

  const { data: folders } = await query

  const formatted = await Promise.all((folders || []).map(async (f) => {
    const { count: photoCount } = await supabase.from('photos').select('*', { count: 'exact', head: true }).eq('folder_id', f.id)
    const { count: subfolderCount } = await supabase.from('folders').select('*', { count: 'exact', head: true }).eq('parent_folder_id', f.id)
    const frontendUrl = process.env.FRONTEND_URL || 'https://pixel-booth-spot.vercel.app'
    const qrLink = `${frontendUrl}/folder/${f.share_token}`

    return {
      id: f.id,
      name: f.name,
      parent_folder_id: f.parent_folder_id,
      share_token: f.share_token,
      photos_count: photoCount || 0,
      subfolders_count: subfolderCount || 0,
      qr_url: f.qr_path || await generateQrDataUrl(qrLink),
      qr_link: qrLink,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }
  }))

  return c.json({ data: formatted })
})

// POST /api/folders
foldersRouter.post('/', async (c) => {
  const json = await c.req.json().catch(() => ({}))
  const name = json.name || 'Folder Baru'
  const parentFolderId = json.parent_folder_id || null
  const shareToken = randomUUID()

  const frontendUrl = process.env.FRONTEND_URL || 'https://pixel-booth-spot-unsil.vercel.app'
  const qrLink = `${frontendUrl}/folder/${shareToken}`
  const qrDataUrl = await generateQrDataUrl(qrLink)

  const { data: folder, error } = await supabase
    .from('folders')
    .insert({
      name,
      parent_folder_id: parentFolderId,
      share_token: shareToken,
      qr_path: qrDataUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return c.json({ message: error.message }, 500)
  }

  return c.json({
    message: 'Folder berhasil dibuat',
    data: {
      id: folder.id,
      name: folder.name,
      parent_folder_id: folder.parent_folder_id,
      share_token: folder.share_token,
      photos_count: 0,
      subfolders_count: 0,
      qr_url: qrDataUrl,
      qr_link: qrLink,
    },
  }, 201)
})

// GET /api/folders/:id
foldersRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const { data: folder, error } = await supabase.from('folders').select('*').eq('id', id).single()

  if (error || !folder) {
    return c.json({ message: 'Folder tidak ditemukan' }, 404)
  }

  const { data: subfolders } = await supabase.from('folders').select('*').eq('parent_folder_id', id)
  const { data: photos } = await supabase.from('photos').select('*').eq('folder_id', id).order('created_at', { ascending: false })

  const frontendUrl = process.env.FRONTEND_URL || 'https://pixel-booth-spot.vercel.app'
  const qrLink = `${frontendUrl}/folder/${folder.share_token}`

  return c.json({
    data: {
      id: folder.id,
      name: folder.name,
      parent_folder_id: folder.parent_folder_id,
      share_token: folder.share_token,
      qr_url: folder.qr_path || await generateQrDataUrl(qrLink),
      qr_link: qrLink,
      subfolders: (subfolders || []).map((s) => ({ id: s.id, name: s.name, parent_folder_id: s.parent_folder_id })),
      photos: (photos || []).map((p) => ({
        id: p.id,
        token: p.unique_token,
        filename: p.filename,
        photo_url: p.storage_path,
        thumbnail_url: p.thumbnail_path || p.storage_path,
        created_at: p.created_at,
      })),
    },
  })
})

// GET /api/folders/by-token/:token (Public QR Customer Access)
foldersRouter.get('/by-token/:token', async (c) => {
  const token = c.req.param('token')
  const { data: folder, error } = await supabase.from('folders').select('*').eq('share_token', token).single()

  if (error || !folder) {
    return c.json({ message: 'Folder tidak ditemukan atau tautan kedaluwarsa' }, 404)
  }

  const { data: photos } = await supabase.from('photos').select('*').eq('folder_id', folder.id).order('created_at', { ascending: false })

  return c.json({
    data: {
      id: folder.id,
      name: folder.name,
      share_token: folder.share_token,
      photos: (photos || []).map((p) => ({
        id: p.id,
        token: p.unique_token,
        filename: p.filename,
        photo_url: p.storage_path,
        thumbnail_url: p.thumbnail_path || p.storage_path,
        created_at: p.created_at,
      })),
    },
  })
})

// PUT /api/folders/:id
foldersRouter.put('/:id', async (c) => {
  const id = c.req.param('id')
  const { name } = await c.req.json().catch(() => ({}))
  const { data, error } = await supabase.from('folders').update({ name, updated_at: new Date().toISOString() }).eq('id', id).select().single()

  if (error) return c.json({ message: error.message }, 500)
  return c.json({ message: 'Folder berhasil diubah', data })
})

// DELETE /api/folders/:id
foldersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await supabase.from('photos').delete().eq('folder_id', id)
  await supabase.from('folders').delete().eq('id', id)
  return c.json({ message: 'Folder berhasil dihapus' })
})

// POST /api/folders/bulk-delete
foldersRouter.post('/bulk-delete', async (c) => {
  const { ids } = await c.req.json().catch(() => ({ ids: [] }))
  if (Array.isArray(ids) && ids.length > 0) {
    await supabase.from('photos').delete().in('folder_id', ids)
    await supabase.from('folders').delete().in('id', ids)
  }
  return c.json({ message: `${ids.length} folder berhasil dihapus` })
})

// POST /api/folders/bulk-move
foldersRouter.post('/bulk-move', async (c) => {
  const { folder_ids, destination_folder_id } = await c.req.json().catch(() => ({}))
  if (Array.isArray(folder_ids) && folder_ids.length > 0) {
    await supabase.from('folders').update({ parent_folder_id: destination_folder_id || null }).in('id', folder_ids)
  }
  return c.json({ message: 'Folder berhasil dipindahkan' })
})
