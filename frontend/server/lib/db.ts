import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import { supabase } from './supabase'

// ==========================================
// PIXELBOOTH — Universal DB Adapter (SQLite + Supabase)
// Supports all Photobooth operations with 100% parity to Laravel
// ==========================================

let sqliteDb: any = null

function getSqlite() {
  // On Vercel (production), skip SQLite entirely — always use Supabase
  if (process.env.VERCEL || process.env.VERCEL_ENV) return null

  if (!sqliteDb && typeof window === 'undefined') {
    try {
      const req = createRequire(import.meta.url)
      const Database = req('better-sqlite3')
      const p1 = path.resolve(process.cwd(), '../backend/database/database.sqlite')
      const p2 = path.resolve(process.cwd(), 'database/database.sqlite')
      const targetPath = fs.existsSync(p1) ? p1 : fs.existsSync(p2) ? p2 : null
      if (targetPath) {
        sqliteDb = new Database(targetPath)
      }
    } catch (e) {
      // Fallback to Supabase
    }
  }
  return sqliteDb
}

export const db = {
  isSupabaseConfigured(): boolean {
    return Boolean(
      process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
    )
  },

  // --- Templates ---
  async getTemplates(status?: string) {
    const sdb = getSqlite()
    if (sdb) {
      const sql = status
        ? 'SELECT * FROM templates WHERE status = ? ORDER BY id DESC'
        : 'SELECT * FROM templates ORDER BY id DESC'
      const rows = status ? sdb.prepare(sql).all(status) : sdb.prepare(sql).all()
      return rows.map((t: any) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        template_url: t.template_file,
        preview_url: t.preview_file || t.template_file,
        frame_count: t.frame_count || 1,
        canvas_width: t.canvas_width || 1200,
        canvas_height: t.canvas_height || 1800,
        status: t.status || 'active',
        frame_configuration: typeof t.frame_configuration === 'string' ? JSON.parse(t.frame_configuration || '[]') : t.frame_configuration || [],
        created_at: t.created_at,
        updated_at: t.updated_at,
      }))
    }

    let query = supabase.from('templates').select('*').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data } = await query
    return (data || []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      template_url: t.template_file,
      preview_url: t.preview_file || t.template_file,
      frame_count: t.frame_count || 1,
      canvas_width: t.canvas_width || 1200,
      canvas_height: t.canvas_height || 1800,
      status: t.status || 'active',
      frame_configuration: typeof t.frame_configuration === 'string' ? JSON.parse(t.frame_configuration) : t.frame_configuration || [],
      created_at: t.created_at,
      updated_at: t.updated_at,
    }))
  },

  async getTemplateById(id: number | string) {
    const sdb = getSqlite()
    if (sdb) {
      const row = sdb.prepare('SELECT * FROM templates WHERE id = ?').get(id)
      if (!row) return null
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        template_url: row.template_file,
        preview_url: row.preview_file || row.template_file,
        frame_count: row.frame_count || 1,
        canvas_width: row.canvas_width || 1200,
        canvas_height: row.canvas_height || 1800,
        status: row.status || 'active',
        frame_configuration: typeof row.frame_configuration === 'string' ? JSON.parse(row.frame_configuration || '[]') : row.frame_configuration || [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    }

    const { data } = await supabase.from('templates').select('*').eq('id', id).single()
    if (!data) return null
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      template_url: data.template_file,
      preview_url: data.preview_file || data.template_file,
      frame_count: data.frame_count || 1,
      canvas_width: data.canvas_width || 1200,
      canvas_height: data.canvas_height || 1800,
      status: data.status || 'active',
      frame_configuration: typeof data.frame_configuration === 'string' ? JSON.parse(data.frame_configuration) : data.frame_configuration || [],
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  },

  async createTemplate(payload: any) {
    const sdb = getSqlite()
    if (sdb) {
      const stmt = sdb.prepare(`
        INSERT INTO templates (name, slug, template_file, preview_file, frame_count, canvas_width, canvas_height, status, frame_configuration, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      const info = stmt.run(
        payload.name,
        payload.slug,
        payload.template_file,
        payload.preview_file || payload.template_file,
        payload.frame_count || 1,
        payload.canvas_width || 1200,
        payload.canvas_height || 1800,
        payload.status || 'active',
        JSON.stringify(payload.frame_configuration || [])
      )
      return this.getTemplateById(info.lastInsertRowid)
    }

    const { data } = await supabase.from('templates').insert(payload).select().single()
    return data
  },

  async updateTemplate(id: number | string, payload: any) {
    const sdb = getSqlite()
    if (sdb) {
      const sets: string[] = ["updated_at = datetime('now')"]
      const values: any[] = []
      if (payload.name) { sets.push('name = ?'); values.push(payload.name) }
      if (payload.status) { sets.push('status = ?'); values.push(payload.status) }
      if (payload.canvas_width) { sets.push('canvas_width = ?'); values.push(payload.canvas_width) }
      if (payload.canvas_height) { sets.push('canvas_height = ?'); values.push(payload.canvas_height) }
      if (payload.frame_count !== undefined) { sets.push('frame_count = ?'); values.push(payload.frame_count) }
      if (payload.frame_configuration !== undefined) {
        sets.push('frame_configuration = ?')
        values.push(typeof payload.frame_configuration === 'string' ? payload.frame_configuration : JSON.stringify(payload.frame_configuration))
      }
      values.push(id)
      sdb.prepare(`UPDATE templates SET ${sets.join(', ')} WHERE id = ?`).run(...values)
      return this.getTemplateById(id)
    }

    const { data } = await supabase.from('templates').update(payload).eq('id', id).select().single()
    return data
  },

  async deleteTemplate(id: number | string) {
    const sdb = getSqlite()
    if (sdb) {
      sdb.prepare('DELETE FROM templates WHERE id = ?').run(id)
      return
    }
    await supabase.from('templates').delete().eq('id', id)
  },

  // --- Folders ---
  async getFolders(parentId?: string | number | null) {
    const sdb = getSqlite()
    if (sdb) {
      const sql = parentId ? 'SELECT * FROM folders WHERE parent_folder_id = ? ORDER BY id DESC' : 'SELECT * FROM folders WHERE parent_folder_id IS NULL ORDER BY id DESC'
      const rows = parentId ? sdb.prepare(sql).all(parentId) : sdb.prepare(sql).all()
      return rows.map((f: any) => {
        const photoCount = sdb.prepare('SELECT count(*) as c FROM photos WHERE folder_id = ?').get(f.id)?.c || 0
        const subCount = sdb.prepare('SELECT count(*) as c FROM folders WHERE parent_folder_id = ?').get(f.id)?.c || 0
        return {
          id: f.id,
          name: f.name,
          parent_folder_id: f.parent_folder_id,
          share_token: f.share_token,
          photos_count: photoCount,
          subfolders_count: subCount,
          qr_url: f.qr_path,
          created_at: f.created_at,
          updated_at: f.updated_at,
        }
      })
    }

    let query = supabase.from('folders').select('*').order('created_at', { ascending: false })
    if (parentId) query = query.eq('parent_folder_id', parentId)
    else query = query.is('parent_folder_id', null)
    const { data } = await query
    if (!data || data.length === 0) return []

    // Calculate real photo count and subfolder count per folder
    const foldersWithCounts = await Promise.all(
      data.map(async (f) => {
        const { count: photoCount } = await supabase
          .from('photos')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', f.id)

        const { count: subfolderCount } = await supabase
          .from('folders')
          .select('*', { count: 'exact', head: true })
          .eq('parent_folder_id', f.id)

        return {
          id: f.id,
          name: f.name,
          parent_folder_id: f.parent_folder_id,
          share_token: f.share_token,
          photos_count: photoCount ?? 0,
          subfolders_count: subfolderCount ?? 0,
          qr_url: f.qr_path,
          created_at: f.created_at,
          updated_at: f.updated_at,
        }
      })
    )

    return foldersWithCounts
  },

  async getFolderById(id: number | string) {
    const sdb = getSqlite()
    if (sdb) {
      const f = sdb.prepare('SELECT * FROM folders WHERE id = ?').get(id)
      if (!f) return null
      const subfolders = sdb.prepare('SELECT * FROM folders WHERE parent_folder_id = ?').all(id)
      const photos = sdb.prepare('SELECT * FROM photos WHERE folder_id = ? ORDER BY id DESC').all(id)
      return {
        ...f,
        subfolders: subfolders || [],
        photos: (photos || []).map((p: any) => ({
          id: p.id,
          token: p.unique_token,
          filename: p.filename,
          photo_url: p.storage_path,
          thumbnail_url: p.thumbnail_path || p.storage_path,
          created_at: p.created_at,
        })),
      }
    }

    const { data: folder } = await supabase.from('folders').select('*').eq('id', id).single()
    if (!folder) return null
    const { data: subfolders } = await supabase.from('folders').select('*').eq('parent_folder_id', id)
    const { data: photos } = await supabase.from('photos').select('*').eq('folder_id', id).order('created_at', { ascending: false })
    return {
      ...folder,
      subfolders: subfolders || [],
      photos: (photos || []).map((p) => ({
        id: p.id,
        token: p.unique_token,
        filename: p.filename,
        photo_url: p.storage_path,
        thumbnail_url: p.thumbnail_path || p.storage_path,
        created_at: p.created_at,
      })),
    }
  },

  async getFolderByToken(token: string) {
    const sdb = getSqlite()
    if (sdb) {
      const f = sdb.prepare('SELECT * FROM folders WHERE share_token = ?').get(token)
      if (!f) return null
      const photos = sdb.prepare('SELECT * FROM photos WHERE folder_id = ? ORDER BY id DESC').all(f.id)
      return {
        id: f.id,
        name: f.name,
        share_token: f.share_token,
        photos: (photos || []).map((p: any) => ({
          id: p.id,
          token: p.unique_token,
          filename: p.filename,
          photo_url: p.storage_path,
          thumbnail_url: p.thumbnail_path || p.storage_path,
          created_at: p.created_at,
        })),
      }
    }

    const { data: folder } = await supabase.from('folders').select('*').eq('share_token', token).single()
    if (!folder) return null
    const { data: photos } = await supabase.from('photos').select('*').eq('folder_id', folder.id).order('created_at', { ascending: false })
    return {
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
    }
  },

  async createFolder(payload: any) {
    const sdb = getSqlite()
    if (sdb) {
      const stmt = sdb.prepare(`
        INSERT INTO folders (name, parent_folder_id, share_token, qr_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      const info = stmt.run(payload.name, payload.parent_folder_id || null, payload.share_token, payload.qr_path || null)
      return sdb.prepare('SELECT * FROM folders WHERE id = ?').get(info.lastInsertRowid)
    }
    const { data } = await supabase.from('folders').insert(payload).select().single()
    return data
  },

  async updateFolder(id: number | string, payload: any) {
    const sdb = getSqlite()
    if (sdb) {
      const sets: string[] = ["updated_at = datetime('now')"]
      const values: any[] = []
      if (payload.name) { sets.push('name = ?'); values.push(payload.name) }
      if (payload.parent_folder_id !== undefined) { sets.push('parent_folder_id = ?'); values.push(payload.parent_folder_id) }
      values.push(id)
      sdb.prepare(`UPDATE folders SET ${sets.join(', ')} WHERE id = ?`).run(...values)
      return sdb.prepare('SELECT * FROM folders WHERE id = ?').get(id)
    }
    const { data } = await supabase.from('folders').update(payload).eq('id', id).select().single()
    return data
  },

  async deleteFolder(id: number | string) {
    const sdb = getSqlite()
    if (sdb) {
      sdb.prepare('DELETE FROM photos WHERE folder_id = ?').run(id)
      sdb.prepare('DELETE FROM folders WHERE id = ?').run(id)
      return
    }
    await supabase.from('photos').delete().eq('folder_id', id)
    await supabase.from('folders').delete().eq('id', id)
  },

  async bulkDeleteFolders(ids: number[]) {
    for (const id of ids) {
      await this.deleteFolder(id)
    }
  },

  async bulkMoveFolders(ids: number[], parentFolderId: number | null) {
    const sdb = getSqlite()
    if (sdb) {
      for (const id of ids) {
        sdb.prepare('UPDATE folders SET parent_folder_id = ?, updated_at = datetime("now") WHERE id = ?').run(parentFolderId, id)
      }
      return
    }
    await supabase.from('folders').update({ parent_folder_id: parentFolderId }).in('id', ids)
  },

  // --- Sessions ---
  async createSession(payload: any) {
    const sdb = getSqlite()
    if (sdb) {
      const stmt = sdb.prepare(`
        INSERT INTO photo_sessions (template_id, folder_id, session_token, total_frames, current_frame, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      const info = stmt.run(
        payload.template_id, payload.folder_id || null,
        payload.session_token, payload.total_frames || 1,
        payload.current_frame || 1, 'active',
      )
      return sdb.prepare('SELECT * FROM photo_sessions WHERE id = ?').get(info.lastInsertRowid)
    }
    const { data } = await supabase.from('photo_sessions').insert(payload).select().single()
    return data
  },

  async getSession(id: number | string) {
    const sdb = getSqlite()
    if (sdb) {
      const session = sdb.prepare('SELECT * FROM photo_sessions WHERE id = ?').get(id)
      if (!session) return null
      const template = (session as any).template_id
        ? sdb.prepare('SELECT * FROM templates WHERE id = ?').get((session as any).template_id)
        : null
      const captures = sdb.prepare('SELECT * FROM session_captures WHERE session_id = ? ORDER BY frame_number ASC').all(id)
      const folder = (session as any).folder_id
        ? sdb.prepare('SELECT * FROM folders WHERE id = ?').get((session as any).folder_id)
        : null
      return { session, template, captures, folder }
    }
    const { data: session } = await supabase.from('photo_sessions').select('*').eq('id', id).single()
    if (!session) return null
    const { data: template } = session.template_id
      ? await supabase.from('templates').select('*').eq('id', session.template_id).single()
      : { data: null }
    const { data: captures } = await supabase.from('session_captures').select('*').eq('session_id', id).order('frame_number', { ascending: true })
    const { data: folder } = session.folder_id
      ? await supabase.from('folders').select('*').eq('id', session.folder_id).single()
      : { data: null }
    return { session, template, captures: captures || [], folder }
  },

  async updateSession(id: number | string, payload: any) {
    const sdb = getSqlite()
    if (sdb) {
      const statusMap: Record<string, string> = {
        ready: 'active', in_progress: 'active', completed: 'complete', cancelled: 'cancelled'
      }
      const sets: string[] = ["updated_at = datetime('now')"]
      const values: any[] = []
      if (payload.status !== undefined) {
        sets.push('status = ?'); values.push(statusMap[payload.status] || payload.status)
      }
      if (payload.current_frame !== undefined) { sets.push('current_frame = ?'); values.push(payload.current_frame) }
      if (payload.folder_id !== undefined) { sets.push('folder_id = ?'); values.push(payload.folder_id) }
      if (payload.completed_at !== undefined) { sets.push('completed_at = ?'); values.push(payload.completed_at) }
      values.push(id)
      sdb.prepare(`UPDATE photo_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values)
      return sdb.prepare('SELECT * FROM photo_sessions WHERE id = ?').get(id)
    }
    const { data } = await supabase.from('photo_sessions').update(payload).eq('id', id).select().single()
    return data
  },

  async createCapture(payload: any) {
    const sdb = getSqlite()
    if (sdb) {
      sdb.prepare('UPDATE session_captures SET status = ? WHERE session_id = ? AND frame_number = ?')
        .run('retaken', payload.session_id, payload.frame_number)
      const stmt = sdb.prepare(`
        INSERT INTO session_captures (session_id, frame_number, photo_path, status, captured_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `)
      const info = stmt.run(payload.session_id, payload.frame_number, payload.photo_path, payload.status || 'approved')
      return sdb.prepare('SELECT * FROM session_captures WHERE id = ?').get(info.lastInsertRowid)
    }
    await supabase.from('session_captures').update({ status: 'retaken' })
      .eq('session_id', payload.session_id).eq('frame_number', payload.frame_number)
    const { data } = await supabase.from('session_captures').insert(payload).select().single()
    return data
  },

  async resetCaptures(sessionId: number | string) {
    const sdb = getSqlite()
    if (sdb) {
      sdb.prepare('UPDATE session_captures SET status = ? WHERE session_id = ?').run('retaken', sessionId)
      return
    }
    await supabase.from('session_captures').update({ status: 'retaken' }).eq('session_id', sessionId)
  },

  async createPhoto(payload: any) {
    const sdb = getSqlite()
    if (sdb) {
      const stmt = sdb.prepare(`
        INSERT INTO photos (session_id, folder_id, filename, storage_path, thumbnail_path, unique_token, qr_path, is_final, is_temporary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `)
      const info = stmt.run(
        payload.session_id || null, payload.folder_id || null,
        payload.filename, payload.storage_path,
        payload.thumbnail_path || payload.storage_path,
        payload.unique_token, payload.qr_path || null,
        payload.is_final ? 1 : 0,
      )
      return sdb.prepare('SELECT * FROM photos WHERE id = ?').get(info.lastInsertRowid)
    }
    const { data } = await supabase.from('photos').insert(payload).select().single()
    return data
  },

  // --- Photos ---
  async getPhotos(folderId?: string | number | null, page = 1, perPage = 20, uncategorized = false) {
    const sdb = getSqlite()
    if (sdb) {
      const offset = (page - 1) * perPage
      let rows: any[] = []
      let total = 0
      if (folderId && folderId !== 'null' && !uncategorized) {
        rows = sdb.prepare('SELECT * FROM photos WHERE folder_id = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(folderId, perPage, offset)
        total = sdb.prepare('SELECT count(*) as c FROM photos WHERE folder_id = ?').get(folderId)?.c || 0
      } else if (uncategorized) {
        rows = sdb.prepare('SELECT * FROM photos WHERE folder_id IS NULL ORDER BY id DESC LIMIT ? OFFSET ?').all(perPage, offset)
        total = sdb.prepare('SELECT count(*) as c FROM photos WHERE folder_id IS NULL').get()?.c || 0
      } else {
        rows = sdb.prepare('SELECT * FROM photos ORDER BY id DESC LIMIT ? OFFSET ?').all(perPage, offset)
        total = sdb.prepare('SELECT count(*) as c FROM photos').get()?.c || 0
      }
      return {
        data: rows.map((p: any) => ({
          id: p.id,
          session_id: p.session_id,
          folder_id: p.folder_id,
          filename: p.filename,
          storage_path: p.storage_path,
          url: p.storage_path,
          photo_url: p.storage_path,
          thumbnail_path: p.thumbnail_path || p.storage_path,
          thumbnail_url: p.thumbnail_path || p.storage_path,
          unique_token: p.unique_token,
          qr_path: p.qr_path,
          qr_url: p.qr_path,
          is_final: Boolean(p.is_final),
          created_at: p.created_at,
          updated_at: p.updated_at,
        })),
        current_page: page,
        last_page: Math.max(1, Math.ceil(total / perPage)),
        per_page: perPage,
        total,
      }
    }

    const from = (page - 1) * perPage
    const to = from + perPage - 1
    let query = supabase.from('photos').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (folderId && folderId !== 'null' && !uncategorized) query = query.eq('folder_id', folderId)
    else if (uncategorized) query = query.is('folder_id', null)
    const { data, count } = await query.range(from, to)
    const total = count || 0
    return {
      data: (data || []).map((p) => ({
        id: p.id,
        session_id: p.session_id,
        folder_id: p.folder_id,
        filename: p.filename,
        storage_path: p.storage_path,
        url: p.storage_path,
        photo_url: p.storage_path,
        thumbnail_path: p.thumbnail_path || p.storage_path,
        thumbnail_url: p.thumbnail_path || p.storage_path,
        unique_token: p.unique_token,
        qr_path: p.qr_path,
        qr_url: p.qr_path,
        is_final: Boolean(p.is_final),
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
      current_page: page,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      per_page: perPage,
      total,
    }
  },

  async getPhotoByToken(token: string) {
    const sdb = getSqlite()
    if (sdb) {
      const p = sdb.prepare('SELECT * FROM photos WHERE unique_token = ?').get(token)
      if (!p) return null
      return {
        id: p.id,
        token: p.unique_token,
        filename: p.filename,
        photo_url: p.storage_path,
        thumbnail_url: p.thumbnail_path || p.storage_path,
        folder_id: p.folder_id,
        session_id: p.session_id,
        qr_url: p.qr_path,
        created_at: p.created_at,
      }
    }
    const { data: p } = await supabase.from('photos').select('*').eq('unique_token', token).single()
    if (!p) return null
    return {
      id: p.id,
      token: p.unique_token,
      filename: p.filename,
      photo_url: p.storage_path,
      thumbnail_url: p.thumbnail_path || p.storage_path,
      folder_id: p.folder_id,
      session_id: p.session_id,
      qr_url: p.qr_path,
      created_at: p.created_at,
    }
  },

  async deletePhoto(id: number | string) {
    const sdb = getSqlite()
    if (sdb) {
      sdb.prepare('DELETE FROM photos WHERE id = ?').run(id)
      return
    }
    await supabase.from('photos').delete().eq('id', id)
  },

  async deletePhotoByToken(token: string) {
    const sdb = getSqlite()
    if (sdb) {
      sdb.prepare('DELETE FROM photos WHERE unique_token = ?').run(token)
      return
    }
    await supabase.from('photos').delete().eq('unique_token', token)
  },

  async bulkDeletePhotos(ids: number[]) {
    for (const id of ids) {
      await this.deletePhoto(id)
    }
  },

  async bulkDeletePhotosByTokens(tokens: string[]) {
    for (const token of tokens) {
      await this.deletePhotoByToken(token)
    }
  },

  async movePhoto(id: number | string, folderId: number | null) {
    const sdb = getSqlite()
    if (sdb) {
      sdb.prepare('UPDATE photos SET folder_id = ?, updated_at = datetime("now") WHERE id = ?').run(folderId, id)
      return sdb.prepare('SELECT * FROM photos WHERE id = ?').get(id)
    }
    const { data } = await supabase.from('photos').update({ folder_id: folderId }).eq('id', id).select().single()
    return data
  },

  async bulkMovePhotos(ids: number[], folderId: number | null) {
    for (const id of ids) {
      await this.movePhoto(id, folderId)
    }
  },
}

export default db
