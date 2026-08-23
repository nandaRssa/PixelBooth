// Minimal test endpoint — zero dependencies
export default function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  res.status(200).end(JSON.stringify({
    status: 'ok',
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  }))
}
