// ==========================================
// PIXELBOOTH — Utility unduh QR sebagai PNG
// ==========================================

/**
 * Unduh QR card lengkap dengan header hitam & desain PixelBooth beresolusi tinggi (1200x1600).
 */
export async function downloadQrCardPng({
  type,
  canvasId,
  caption,
  filename,
}: {
  type: 'FOTO' | 'FOLDER'
  canvasId: string
  caption: string
  filename: string
}): Promise<void> {
  const width = 1200
  const height = 1600
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 1. Background Card Container
  const r = 48
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, r)
  ctx.fill()

  // 2. Top Dark Header
  const headerHeight = 310
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, width, headerHeight, [r, r, 0, 0])
  ctx.fillStyle = '#141416'
  ctx.fill()

  // Header Texts
  ctx.textAlign = 'center'

  // FOTO / FOLDER label
  ctx.fillStyle = '#A1A1AA'
  ctx.font = '600 32px system-ui, sans-serif'
  ctx.fillText(type === 'FOTO' ? 'F O T O' : 'F O L D E R', width / 2, 95)

  // PIXELBOOTH brand
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '900 66px system-ui, sans-serif'
  ctx.fillText('P I X E L B O O T H', width / 2, 185)

  // PHOTOBOOTH subtext
  ctx.fillStyle = '#A1A1AA'
  ctx.font = '400 28px system-ui, sans-serif'
  ctx.fillText('P H O T O B O O T H', width / 2, 250)
  ctx.restore()

  // 3. Draw QR Code from HTML Canvas
  const qrCanvas = document.getElementById(canvasId) as HTMLCanvasElement | null
  const qrSize = 780
  const qrX = (width - qrSize) / 2
  const qrY = headerHeight + 65

  if (qrCanvas) {
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize)
  }

  // 4. Divider Line
  const lineY = qrY + qrSize + 65
  ctx.strokeStyle = '#E4E4E7'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(width / 2 - 200, lineY)
  ctx.lineTo(width / 2 + 200, lineY)
  ctx.stroke()

  // 5. Bottom Caption & Footer
  ctx.textAlign = 'center'
  ctx.fillStyle = '#52525B'
  ctx.font = '400 34px system-ui, sans-serif'
  ctx.fillText(caption, width / 2, lineY + 68)

  ctx.fillStyle = '#A1A1AA'
  ctx.font = '500 24px system-ui, sans-serif'
  ctx.fillText('P I X E L B O O T H', width / 2, lineY + 130)

  // 6. Export to PNG and download
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }
  }, 'image/png')
}

/**
 * Unduh QR code SVG atau fallback ke PNG.
 */
export async function downloadSvgAsPng(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Gagal memuat QR')
  const svgText = await res.text()

  const blob = new Blob([svgText], { type: 'image/svg+xml' })
  const svgUrl = URL.createObjectURL(blob)

  const img = new Image()
  img.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      URL.revokeObjectURL(svgUrl)
      return
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (pngBlob) => {
        if (pngBlob) {
          const pngUrl = URL.createObjectURL(pngBlob)
          const a = document.createElement('a')
          a.href = pngUrl
          a.download = filename
          document.body.appendChild(a)
          a.click()
          a.remove()
          setTimeout(() => URL.revokeObjectURL(pngUrl), 2000)
        }
        URL.revokeObjectURL(svgUrl)
      },
      'image/png'
    )
  }
  img.onerror = () => URL.revokeObjectURL(svgUrl)
  img.src = svgUrl
}