import QRCode from 'qrcode'

// ==========================================
// PIXELBOOTH — QR Code Generator (TypeScript)
// Uses Pure SVG Math - 0 Canvas Dependency (100% Cloudflare & Node compatible)
// ==========================================

export async function generateQrSvg(url: string): Promise<string> {
  return await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
    color: {
      dark: '#141416',
      light: '#FFFFFF',
    },
  })
}

export async function generateQrDataUrl(url: string): Promise<string> {
  const svg = await generateQrSvg(url)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
