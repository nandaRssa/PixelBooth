import QRCode from 'qrcode'

// ==========================================
// PIXELBOOTH — QR Code Generator (TypeScript)
// ==========================================

export async function generateQrDataUrl(url: string): Promise<string> {
  return await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 2,
    scale: 8,
    color: {
      dark: '#141416',
      light: '#FFFFFF',
    },
  })
}

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
