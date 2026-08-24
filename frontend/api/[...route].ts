import { handle } from 'hono/vercel'
import { app } from '../server/app'

// Vercel Serverless Function entry point (single catch-all handler for all /api/* routes)
export const config = {
  runtime: 'nodejs',
}

export default handle(app)
