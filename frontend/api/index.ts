import { handle } from 'hono/vercel'
import { app } from '../server/app'

// Vercel Serverless Function entry point
export const config = {
  runtime: 'nodejs',
}

export default handle(app)
