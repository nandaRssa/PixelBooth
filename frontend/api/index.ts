import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

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
