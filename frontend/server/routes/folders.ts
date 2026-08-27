import { Hono } from 'hono'
import { db } from '../lib/db'
import { saveMedia } from '../lib/storage'
import { generateQrDataUrl } from '../lib/qrcode'

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
    let reqOrigin = ''
    try {
      const headerOrigin = c.req.header('origin')
      const headerReferer = c.req.header('referer')
      if (headerOrigin) {
        reqOrigin = new URL(headerOrigin).origin
      } else if (headerReferer) {
        reqOrigin = new URL(headerReferer).origin
      } else if (c.req.url) {
        reqOrigin = new URL(c.req.url).origin
      }
    } catch {
      // ignore URL parse errors
    }
    const frontendUrl = (process.env.FRONTEND_URL || reqOrigin || 'https://pixelbooth.pages.dev').replace(/\/$/, '')
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
    const shareToken = generateUUID()

    let reqOrigin = ''
    try {
      const headerOrigin = c.req.header('origin')
      const headerReferer = c.req.header('referer')
      if (headerOrigin) {
        reqOrigin = new URL(headerOrigin).origin
      } else if (headerReferer) {
        reqOrigin = new URL(headerReferer).origin
      } else if (c.req.url) {
        reqOrigin = new URL(c.req.url).origin
      }
    } catch {
      // ignore URL parse errors
    }
    const frontendUrl = (process.env.FRONTEND_URL || reqOrigin || 'https://pixelbooth.pages.dev').replace(/\/$/, '')
    const qrLink = `${frontendUrl}/folder/${shareToken}`
    let qrPath = `qr/folders/${shareToken}.png`
    let qrDataUrl: string | null = null
    try {
      qrDataUrl = await generateQrDataUrl(qrLink)
      const uploadedQr = await saveMedia(qrDataUrl, 'qr', `folder-${shareToken}.png`)
      if (uploadedQr && !uploadedQr.startsWith('data:') && uploadedQr.length <= 255) {
        qrPath = uploadedQr
      }
    } catch (e) {
      console.warn('Folder QR upload skipped:', e)
    }

    const folder = await db.createFolder({
      name,
      parent_folder_id: parentFolderId,
      unique_token: shareToken,
      share_token: shareToken,
      qr_path: qrPath,
    })

    return c.json({
      message: 'Folder berhasil dibuat',
      data: {
        id: folder?.id,
        name: folder?.name || name,
        parent_folder_id: parentFolderId,
        unique_token: folder?.unique_token || shareToken,
        share_token: folder?.share_token || shareToken,
        photos_count: 0,
        subfolders_count: 0,
        qr_url: qrDataUrl || qrPath,
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
