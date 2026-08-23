import type { IncomingMessage, ServerResponse } from 'node:http'
import { app } from '../server/app'

// ==========================================
// PIXELBOOTH — Single Vercel Serverless Function
// All /api/* routes handled here (1 function = within Hobby plan limit)
// ==========================================

async function nodeRequestToFetch(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host || 'localhost'
  const url = `https://${host}${req.url}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v))
      } else {
        headers.set(key, value)
      }
    }
  }

  let body: Buffer | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  return new Request(url, {
    method: req.method || 'GET',
    headers,
    body: body && body.length > 0 ? body : undefined,
  })
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const fetchRequest = await nodeRequestToFetch(req)
    const fetchResponse = await app.fetch(fetchRequest)

    res.statusCode = fetchResponse.status
    fetchResponse.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value)
    })

    const body = await fetchResponse.arrayBuffer()
    res.end(Buffer.from(body))
  } catch (err) {
    console.error('Vercel handler error:', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: 'Internal Server Error' }))
  }
}
