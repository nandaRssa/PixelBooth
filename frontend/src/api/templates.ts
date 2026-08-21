import apiClient from './client'
import type { Template, ApiResponse, CameraFrame } from '@/types'

// ==========================================
// PIXELBOOTH — Templates API
// Frame bisa manual (Frame Editor) atau hasil
// auto detection (mode Auto Render).
// ==========================================

export interface TemplatePayload {
  name: string
  template_file: File
  preview_file?: File | null
  canvas_width: number
  canvas_height: number
  frame_count?: number
  frame_configuration?: CameraFrame[] | null
}

export interface TemplateUpdatePayload {
  name?: string
  frame_count?: number
  frame_configuration?: CameraFrame[]
  status?: 'draft' | 'active' | 'inactive'
}

function toFormData(payload: TemplatePayload): FormData {
  const form = new FormData()
  form.append('name', payload.name)
  form.append('template_file', payload.template_file)
  if (payload.preview_file) form.append('preview_file', payload.preview_file)
  form.append('canvas_width', String(payload.canvas_width))
  form.append('canvas_height', String(payload.canvas_height))
  if (payload.frame_count != null) {
    form.append('frame_count', String(payload.frame_count))
  }
  if (payload.frame_configuration) {
    form.append('frame_configuration', JSON.stringify(payload.frame_configuration))
  }
  return form
}

export const templateApi = {
  list: async (): Promise<Template[]> => {
    const response = await apiClient.get<ApiResponse<Template[]>>('/templates')
    return response.data.data
  },

  show: async (id: number): Promise<Template> => {
    const response = await apiClient.get<ApiResponse<Template>>(`/templates/${id}`)
    return response.data.data
  },

  create: async (payload: TemplatePayload): Promise<Template> => {
    const response = await apiClient.post<ApiResponse<Template>>('/templates', toFormData(payload), {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data.data
  },

  update: async (id: number, payload: TemplateUpdatePayload): Promise<Template> => {
    const response = await apiClient.put<ApiResponse<Template>>(`/templates/${id}`, payload)
    return response.data.data
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/templates/${id}`)
  },

  /** Auto detection (mode Auto Render) — hasil TIDAK tersimpan otomatis. */
  detectFrames: async (id: number): Promise<CameraFrame[]> => {
    const response = await apiClient.post<ApiResponse<{ frame_count: number; frames: CameraFrame[] }>>(
      `/templates/${id}/detect-frames`
    )
    return response.data.data.frames
  },
}
