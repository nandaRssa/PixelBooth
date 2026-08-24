import { Hono } from 'hono'
import { db } from '../lib/db'

export const photosRouter = new Hono()

// GET /api/photos
photosRouter.get('/', async (c) => {
  try {
    const folderId = c.req.query('folder_id')
    const uncategorized = c.req.query('uncategorized') === 'true'
    const page = Number(c.req.query('page') || 1)
    const perPage = Number(c.req.query('per_page') || 20)

    const result = await db.getPhotos(folderId, page, perPage, uncategorized)
    return c.json(result)
  } catch (err: any) {
    console.error('GET /photos error:', err)
    return c.json({ message: err?.message || 'Gagal mengambil foto' }, 500)
  }
})

// GET /api/photos/:id
photosRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const photo = await db.getPhotoByToken(id) // or by ID
    if (!photo) {
      return c.json({ message: 'Foto tidak ditemukan' }, 404)
    }
    return c.json({ data: photo })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengambil foto' }, 500)
  }
})

// DELETE /api/photos/:id
photosRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await db.deletePhoto(id)
    return c.json({ message: 'Foto berhasil dihapus' })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal menghapus foto' }, 500)
  }
})

// POST /api/photos/bulk-delete
photosRouter.post('/bulk-delete', async (c) => {
  try {
    const json = await c.req.json().catch(() => ({}))
    const ids = json.photo_ids || json.ids || []
    if (Array.isArray(ids) && ids.length > 0) {
      await db.bulkDeletePhotos(ids)
    }
    return c.json({ message: `${ids.length} foto berhasil dihapus` })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal menghapus foto' }, 500)
  }
})

// POST /api/photos/:id/move
photosRouter.post('/:id/move', async (c) => {
  try {
    const id = c.req.param('id')
    const { folder_id } = await c.req.json().catch(() => ({ folder_id: null }))
    const updated = await db.movePhoto(id, folder_id || null)
    return c.json({ message: 'Foto berhasil dipindahkan', data: updated })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal memindahkan foto' }, 500)
  }
})

// POST /api/photos/bulk-move
photosRouter.post('/bulk-move', async (c) => {
  try {
    const { photo_ids, folder_id } = await c.req.json().catch(() => ({}))
    if (Array.isArray(photo_ids) && photo_ids.length > 0) {
      await db.bulkMovePhotos(photo_ids, folder_id || null)
    }
    return c.json({ message: 'Foto berhasil dipindahkan' })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal memindahkan foto' }, 500)
  }
})
