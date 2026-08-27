import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import path from 'path'
import fs from 'fs'

import { templatesRouter } from './routes/templates'
import { sessionsRouter } from './routes/sessions'
import { foldersRouter } from './routes/folders'
import { photosRouter } from './routes/photos'
import { settingsRouter } from './routes/settings'
import { hardwareRouter } from './routes/hardware'
import { customerRouter } from './routes/customer'

// ==========================================
// PIXELBOOTH — Hono App (Vercel Native TypeScript)
// 100% Contract & Algorithm Parity with Laravel
// ==========================================

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
}))

// Sub-router containing all endpoints
const api = new Hono()

// Health Check
api.get('/health', (c) => c.json({ status: 'ok', server: 'vercel-native-typescript', timestamp: new Date().toISOString() }))

// Static Storage Files — serve local image assets when testing locally
api.get('/storage/*', async (c) => {
  const filePath = c.req.path.replace(/^\/api\/storage\//, '').replace(/^\/storage\//, '')
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

// Mount All Domain Routers
api.route('/templates', templatesRouter)
api.route('/sessions', sessionsRouter)
api.route('/folders', foldersRouter)
api.route('/photos', photosRouter)
api.route('/settings', settingsRouter)
api.route('/hardware', hardwareRouter)
api.route('/public', customerRouter)

// Mount on BOTH /api and / so it works seamlessly on local dev (with /api prefix) and Vercel serverless
app.route('/api', api)
app.route('/', api)

// Fallback 404 & SPA Asset Handling (Cloudflare Workers ASSETS binding)
app.notFound(async (c) => {
  if ((c.env as any)?.ASSETS) {
    return (c.env as any).ASSETS.fetch(c.req.raw)
  }
  return c.json({ message: 'Endpoint tidak ditemukan' }, 404)
})

// Global Error Handler
app.onError((err, c) => {
  console.error('API Global Error:', err)
  return c.json({ message: err.message || 'Internal Server Error' }, 500)
})

export { app }
export default app
