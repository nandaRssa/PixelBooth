import { getRequestListener } from '@hono/node-server'
import { app } from '../server/app'

export const config = {
  runtime: 'nodejs',
}

export default getRequestListener(app.fetch)
