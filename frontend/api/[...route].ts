// ABSOLUTE ZERO DEPENDENCY TEST
// No imports whatsoever — just a plain function
export default function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 200
  res.end(JSON.stringify({
    status: 'HANDLER_ALIVE',
    method: req.method,
    url: req.url,
    ts: Date.now()
  }))
}
