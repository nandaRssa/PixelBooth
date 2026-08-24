import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { db } from '../lib/db'
import { saveMedia } from '../lib/storage'
import { generateQrDataUrl } from '../lib/qrcode'

export const foldersRouter = new Hono()

// GET /api/folders
foldersRouter.get('/', async (c) => {
  try {
    const parentId = c.req.query('parent_id')
    const folders = await db.getFolders(parentId)
    return c.json({ data: folders })
  } catch (err: any) {
    console.error('GET /folders error:', err)
    return c.json({ message: err?.message || 'Gagal mengambil folder' }, 500)
  }
})

// GET /api/folders/:id
foldersRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const folder = await db.getFolderById(id)
    if (!folder) {
      return c.json({ message: 'Folder tidak ditemukan' }, 404)
    }
    const frontendUrl = process.env.FRONTEND_URL || 'https://pixel-booth-spot-unsil.vercel.app'
    const qrLink = `${frontendUrl}/folder/${folder.share_token}`
    return c.json({
      data: {
        ...folder,
        qr_url: folder.qr_url || folder.qr_path || await generateQrDataUrl(qrLink),
        qr_link: qrLink,
      },
    })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengambil detail folder' }, 500)
  }
})

// POST /api/folders
foldersRouter.post('/', async (c) => {
  try {
    const json = await c.req.json().catch(() => ({}))
    const name = json.name || 'Folder Baru'
    const parentFolderId = json.parent_folder_id || null
    const shareToken = randomUUID()

    const frontendUrl = process.env.FRONTEND_URL || 'https://pixel-booth-spot-unsil.vercel.app'
    const qrLink = `${frontendUrl}/folder/${shareToken}`
    const qrDataUrl = await generateQrDataUrl(qrLink)
    const qrPath = await saveMedia(qrDataUrl, 'qr', `folder-${shareToken}.png`)

    const folder = await db.createFolder({
      name,
      parent_folder_id: parentFolderId,
      share_token: shareToken,
      qr_path: qrPath,
    })

    return c.json({
      message: 'Folder berhasil dibuat',
      data: {
        id: folder?.id,
        name: folder?.name || name,
        parent_folder_id: parentFolderId,
        share_token: shareToken,
        photos_count: 0,
        subfolders_count: 0,
        qr_url: qrDataUrl,
        qr_link: qrLink,
      },
    }, 201)
  } catch (err: any) {
    console.error('POST /folders error:', err)
    return c.json({ message: err?.message || 'Gagal membuat folder' }, 500)
  }
})

// PUT /api/folders/:id
foldersRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const json = await c.req.json().catch(() => ({}))
    const updated = await db.updateFolder(id, json)
    return c.json({ message: 'Folder berhasil diubah', data: updated })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal mengubah folder' }, 500)
  }
})

// DELETE /api/folders/:id
foldersRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await db.deleteFolder(id)
    return c.json({ message: 'Folder berhasil dihapus' })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal menghapus folder' }, 500)
  }
})

// POST /api/folders/bulk-delete
foldersRouter.post('/bulk-delete', async (c) => {
  try {
    const json = await c.req.json().catch(() => ({}))
    const ids = json.folder_ids || json.ids || []
    if (Array.isArray(ids) && ids.length > 0) {
      await db.bulkDeleteFolders(ids)
    }
    return c.json({ message: `${ids.length} folder berhasil dihapus` })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal menghapus folder' }, 500)
  }
})

// POST /api/folders/bulk-move
foldersRouter.post('/bulk-move', async (c) => {
  try {
    const json = await c.req.json().catch(() => ({}))
    const folderIds = json.folder_ids || []
    const parentFolderId = json.parent_folder_id || json.destination_folder_id || null
    if (Array.isArray(folderIds) && folderIds.length > 0) {
      await db.bulkMoveFolders(folderIds, parentFolderId)
    }
    return c.json({ message: 'Folder berhasil dipindahkan' })
  } catch (err: any) {
    return c.json({ message: err?.message || 'Gagal memindahkan folder' }, 500)
  }
})
