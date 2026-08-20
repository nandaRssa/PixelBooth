import apiClient from './client'
import type { Template, ApiResponse } from '@/types'

export const templateApi = {
  list: async (): Promise<Template[]> => {
    const response = await apiClient.get<ApiResponse<Template[]>>('/templates')
    return response.data.data
  },
}