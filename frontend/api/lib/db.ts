import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'
import { supabase } from './supabase'

// ==========================================
// PIXELBOOTH — Universal DB Adapter (SQLite + Supabase)
// ==========================================

let sqliteDb: any = null

function getSqlite() {
  if (!sqliteDb && typeof window === 'undefined') {
    try {
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
  async getFolders(parentId?: string | null) {
    const sdb = getSqlite()
    if (sdb) {
      const sql = parentId ? 'SELECT * FROM folders WHERE parent_folder_id = ?' : 'SELECT * FROM folders WHERE parent_folder_id IS NULL'
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
    return (data || []).map((f) => ({ ...f, photos_count: 0, subfolders_count: 0 }))
  },

  // --- Photos ---
  async getPhotos(folderId?: string | null, page = 1, perPage = 20) {
    const sdb = getSqlite()
    if (sdb) {
      const offset = (page - 1) * perPage
      let rows: any[] = []
      let total = 0
      if (folderId && folderId !== 'null') {
        rows = sdb.prepare('SELECT * FROM photos WHERE folder_id = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(folderId, perPage, offset)
        total = sdb.prepare('SELECT count(*) as c FROM photos WHERE folder_id = ?').get(folderId)?.c || 0
      } else {
        rows = sdb.prepare('SELECT * FROM photos WHERE folder_id IS NULL ORDER BY id DESC LIMIT ? OFFSET ?').all(perPage, offset)
        total = sdb.prepare('SELECT count(*) as c FROM photos WHERE folder_id IS NULL').get()?.c || 0
      }
      return {
        data: rows.map((p: any) => ({
          id: p.id,
          token: p.unique_token,
          filename: p.filename,
          photo_url: p.storage_path,
          thumbnail_url: p.thumbnail_path || p.storage_path,
          folder_id: p.folder_id,
          session_id: p.session_id,
          created_at: p.created_at,
        })),
        meta: { current_page: page, per_page: perPage, total, last_page: Math.ceil(total / perPage) },
      }
    }

    const from = (page - 1) * perPage
    const to = from + perPage - 1
    let query = supabase.from('photos').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (folderId && folderId !== 'null') query = query.eq('folder_id', folderId)
    else query = query.is('folder_id', null)
    const { data, count } = await query.range(from, to)
    return {
      data: (data || []).map((p) => ({
        id: p.id,
        token: p.unique_token,
        filename: p.filename,
        photo_url: p.storage_path,
        thumbnail_url: p.thumbnail_path || p.storage_path,
        folder_id: p.folder_id,
        session_id: p.session_id,
        created_at: p.created_at,
      })),
      meta: { current_page: page, per_page: perPage, total: count || 0, last_page: Math.ceil((count || 0) / perPage) },
    }
  },
}

export default db
