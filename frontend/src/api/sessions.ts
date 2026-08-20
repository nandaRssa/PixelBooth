import apiClient from './client'
import type { ApiResponse, PhotoSession } from '@/types'

export const sessionApi = {
  create: async (templateId: number, folderId: number | null = null): Promise<PhotoSession> => {
    const response = await apiClient.post<ApiResponse<PhotoSession>>('/sessions', {
      template_id: templateId,
      folder_id: folderId,
    })
    return response.data.data
  },
}