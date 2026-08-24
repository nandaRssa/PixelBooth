import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import path from 'path'
import fs from 'fs'

import { templatesRouter } from './routes/templates'
import { sessionsRouter } from './routes/sessions'
import { foldersRouter } from './routes/folders'
import { photosRouter } from './routes/photos'
import { settingsRouter } from './routes/settings'

// ==========================================
// PIXELBOOTH — Hono App (Vercel Native TypeScript)
// ==========================================

const app = new Hono().basePath('/api')

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
}))

// Health Check
app.get('/health', (c) => c.json({ status: 'ok', server: 'vercel-native-typescript', timestamp: new Date().toISOString() }))

// Static Storage Files — serve Laravel storage files locally
// e.g. GET /api/storage/templates/image.png → ../backend/storage/app/public/templates/image.png
app.get('/storage/*', async (c) => {
  const filePath = c.req.path.replace('/api/storage/', '')
  const candidates = [
    path.resolve(process.cwd(), '../backend/storage/app/public', filePath),
    path.resolve(process.cwd(), '../backend/public/storage', filePath),
    path.resolve(process.cwd(), 'storage/app/public', filePath),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const data = fs.readFileSync(candidate)
      const ext = path.extname(filePath).toLowerCase()
      const mime: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      }
      return new Response(data, { headers: { 'Content-Type': mime[ext] || 'application/octet-stream' } })
    }
  }
  return c.json({ message: 'File tidak ditemukan' }, 404)
})

// Mount Routers
app.route('/templates', templatesRouter)
app.route('/sessions', sessionsRouter)
app.route('/folders', foldersRouter)
app.route('/photos', photosRouter)
app.route('/settings', settingsRouter)

// Fallback 404
app.notFound((c) => c.json({ message: 'Endpoint tidak ditemukan' }, 404))

// Global Error Handler
app.onError((err, c) => {
  console.error('API Error:', err)
  return c.json({ message: err.message || 'Internal Server Error' }, 500)
})

export { app }
export default app
