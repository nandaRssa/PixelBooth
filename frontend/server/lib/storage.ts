import path from 'path'
import fs from 'fs'
import { uploadToCloudinary } from './cloudinary'

// ==========================================
// PIXELBOOTH — Smart Universal Storage Engine
// Local Dev: Instant local disk storage (< 15ms)
// Vercel Production: Cloudinary Cloud Storage
// ==========================================

export async function saveMedia(
  fileData: Buffer | string,
  folder: 'templates' | 'sessions' | 'photos' | 'captures' | 'qr',
  filename: string
): Promise<string> {
  // If running on Vercel or cloud environment without writable disk, use Cloudinary
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return uploadToCloudinary(fileData, folder, filename)
  }

  // Local Development: Write directly to local disk for ultra-fast response
  try {
    let buffer: Buffer
    if (typeof fileData === 'string') {
      if (fileData.includes(';base64,')) {
        const b64 = fileData.split(';base64,')[1]
        buffer = Buffer.from(b64, 'base64')
      } else if (fileData.startsWith('data:')) {
        const b64 = fileData.split(',')[1]
        buffer = Buffer.from(b64, 'base64')
      } else {
        try {
          buffer = Buffer.from(fileData, 'base64')
        } catch {
          buffer = Buffer.from(fileData)
        }
      }
    } else {
      buffer = fileData
    }

    const safeFilename = filename.endsWith('.jpg') || filename.endsWith('.png') || filename.endsWith('.webp') || filename.endsWith('.svg')
      ? filename
      : `${filename}.jpg`

    const candidateDirs = [
      path.resolve(process.cwd(), '../backend/storage/app/public', folder),
      path.resolve(process.cwd(), 'storage/app/public', folder),
    ]

    let targetDir = candidateDirs[0]
    for (const dir of candidateDirs) {
      if (fs.existsSync(path.dirname(dir))) {
        targetDir = dir
        break
      }
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const filePath = path.join(targetDir, safeFilename)
    fs.writeFileSync(filePath, buffer)

    // Return URL accessible via /api/storage/*
    return `/api/storage/${folder}/${safeFilename}`
  } catch (err) {
    console.warn('Local disk write failed, fallback to Cloudinary:', err)
    return uploadToCloudinary(fileData, folder, filename)
  }
}
