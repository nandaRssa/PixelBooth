// PIXELBOOTH — Vercel Serverless Diagnostic Handler
// Shows actual error details instead of generic FUNCTION_INVOCATION_FAILED

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  try {
    // Dynamic import so errors are catchable
    const { app } = await import('../server/app.js')

    const host = (req.headers && req.headers.host) || 'localhost'
    const url = `https://${host}${req.url || '/'}`

    const headers = new Headers()
    if (req.headers) {
      for (const [k, v] of Object.entries(req.headers as Record<string, any>)) {
        if (v != null) Array.isArray(v) ? v.forEach(val => headers.append(k, val)) : headers.set(k, String(v))
      }
    }

    let body: Buffer | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => resolve(Buffer.concat(chunks)))
        req.on('error', reject)
      })
    }

    const fetchReq = new Request(url, {
      method: req.method || 'GET',
      headers,
      body: body && body.length > 0 ? body : undefined,
    })

    const fetchRes = await app.fetch(fetchReq)
    res.statusCode = fetchRes.status
    fetchRes.headers.forEach((v: string, k: string) => res.setHeader(k, v))
    res.end(Buffer.from(await fetchRes.arrayBuffer()))

  } catch (err: any) {
    // Return detailed error for debugging
    res.statusCode = 500
    res.end(JSON.stringify({
      error: 'HANDLER_CRASH',
      message: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 8).join('\n'),
      type: err?.constructor?.name,
      code: err?.code,
    }, null, 2))
  }
}
