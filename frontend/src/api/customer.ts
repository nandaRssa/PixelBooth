import apiClient from './client'
import type { CustomerFolder, CustomerPhoto } from '@/types'

// ==========================================
// PIXELBOOTH — Customer Public API
// Tidak memerlukan autentikasi (token dari QR)
// ==========================================

export const customerApi = {
  getPhoto: async (token: string): Promise<CustomerPhoto> => {
    const response = await apiClient.get<{ data: CustomerPhoto }>(`/public/photo/${token}`)
    return response.data.data
  },

  getFolder: async (token: string): Promise<CustomerFolder> => {
    const response = await apiClient.get<{ data: CustomerFolder }>(`/public/folder/${token}`)
    return response.data.data
  },
}