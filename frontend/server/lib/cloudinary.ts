import crypto from 'crypto'

// ==========================================
// PIXELBOOTH — Cloudinary Client (TypeScript)
// ==========================================

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'tdzyw4dr'
const apiKey = process.env.CLOUDINARY_API_KEY || '324635339443627'
const apiSecret = process.env.CLOUDINARY_API_SECRET || 'sqzKzF5p5BfDxCyJUNQplamsZwA'

export interface UploadResult {
  secure_url: string
  public_id: string
  bytes: number
  format: string
}

/**
 * Upload buffer atau base64 string langsung ke Cloudinary API
 */
export async function uploadToCloudinary(
  fileData: Buffer | string,
  folder: string = 'photos',
  filename?: string
): Promise<string> {
  try {
    const timestamp = Math.round(Date.now() / 1000)
    const publicId = filename ? `pixelbooth/${folder}/${filename}` : `pixelbooth/${folder}/${Date.now()}`

    const paramsToSign = `folder=pixelbooth/${folder}&public_id=${publicId}&timestamp=${timestamp}`
    const signature = crypto.createHash('sha1').update(paramsToSign + apiSecret).digest('hex')

    const formData = new FormData()
    if (typeof fileData === 'string') {
      formData.append('file', fileData)
    } else {
      const blob = new Blob([fileData])
      formData.append('file', blob, filename || 'image.jpg')
    }

    formData.append('api_key', apiKey)
    formData.append('timestamp', String(timestamp))
    formData.append('folder', `pixelbooth/${folder}`)
    formData.append('public_id', publicId)
    formData.append('signature', signature)

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const err = await res.text()
      console.warn('Cloudinary upload error, falling back to data URI:', err)
      if (typeof fileData === 'string' && fileData.startsWith('data:')) {
        return fileData
      }
      return typeof fileData === 'string'
        ? `data:image/jpeg;base64,${fileData}`
        : `data:image/jpeg;base64,${fileData.toString('base64')}`
    }

    const data = (await res.json()) as UploadResult
    return data.secure_url
  } catch (error) {
    console.warn('Cloudinary network exception:', error)
    if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      return fileData
    }
    return typeof fileData === 'string'
      ? `data:image/jpeg;base64,${fileData}`
      : `data:image/jpeg;base64,${fileData.toString('base64')}`
  }
}
