import { Hono } from 'hono'
import { db } from '../lib/db'

export const customerRouter = new Hono()

// GET /api/public/photo/:token
customerRouter.get('/photo/:token', async (c) => {
  try {
    const token = c.req.param('token')
    const photo = await db.getPhotoByToken(token)

    if (!photo) {
      return c.json({ message: 'Foto tidak ditemukan atau tautan kedaluwarsa' }, 404)
    }

    return c.json({ data: photo })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengambil foto' }, 500)
  }
})

// DELETE /api/public/photo/:token
customerRouter.delete('/photo/:token', async (c) => {
  try {
    const token = c.req.param('token')
    await db.deletePhotoByToken(token)
    return c.json({ message: 'Foto berhasil dihapus' })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal menghapus foto' }, 500)
  }
})

// POST /api/public/photos/bulk-delete
customerRouter.post('/photos/bulk-delete', async (c) => {
  try {
    const { tokens } = await c.req.json().catch(() => ({ tokens: [] }))
    if (Array.isArray(tokens) && tokens.length > 0) {
      await db.bulkDeletePhotosByTokens(tokens)
    }
    return c.json({ message: `${tokens.length} foto berhasil dihapus` })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal menghapus foto' }, 500)
  }
})

// GET /api/public/folder/:token
customerRouter.get('/folder/:token', async (c) => {
  try {
    const token = c.req.param('token')
    const folder = await db.getFolderByToken(token)

    if (!folder) {
      return c.json({ message: 'Folder tidak ditemukan atau tautan kedaluwarsa' }, 404)
    }

    return c.json({ data: folder })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengambil folder' }, 500)
  }
})
