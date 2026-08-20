import apiClient from './client'
import type { HardwareStatus, ApiResponse } from '@/types'

export const hardwareApi = {
  status: async (): Promise<HardwareStatus> => {
    const response = await apiClient.get<ApiResponse<HardwareStatus>>('/hardware/status')
    return response.data.data
  },
}