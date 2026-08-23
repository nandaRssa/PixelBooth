import { Hono } from 'hono'
import { supabase } from '../lib/supabase'

export const settingsRouter = new Hono()

// Default fallback settings
const defaultSettings: Record<string, any> = {
  countdown_duration: 5,
  camera_aspect_ratio: '3:4',
  auto_download: false,
  sound_countdown: true,
  sound_shutter: true,
  app_name: 'PixelBooth',
}

// GET /api/settings
settingsRouter.get('/', async (c) => {
  const { data: rows } = await supabase.from('settings').select('*')
  const settingsObj = { ...defaultSettings }

  for (const row of rows || []) {
    try {
      settingsObj[row.key] = JSON.parse(row.value)
    } catch {
      settingsObj[row.key] = row.value
    }
  }

  return c.json({ data: settingsObj })
})

// POST /api/settings
settingsRouter.post('/', async (c) => {
  const json = await c.req.json().catch(() => ({}))

  for (const [key, value] of Object.entries(json)) {
    const valStr = typeof value === 'string' ? value : JSON.stringify(value)
    await supabase.from('settings').upsert({
      key,
      value: valStr,
      group: 'general',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  }

  return c.json({ message: 'Pengaturan berhasil disimpan' })
})
