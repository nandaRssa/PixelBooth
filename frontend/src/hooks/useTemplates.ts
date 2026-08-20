import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { templateApi, type TemplatePayload } from '@/api/templates'
import { hardwareApi } from '@/api/hardware'

// ==========================================
// Template Hooks
// ==========================================

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
    staleTime: 1000 * 60,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: TemplatePayload) => templateApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => templateApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

export function useDetectTemplateFrames() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => templateApi.detectFrames(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

// ==========================================
// Hardware Status Hook — polling berkala
// ==========================================

const POLL_INTERVAL = 5000

export function useHardwareStatus() {
  return useQuery({
    queryKey: ['hardware-status'],
    queryFn: hardwareApi.status,
    refetchInterval: POLL_INTERVAL,
    retry: false,
  })
}

export { templateApi, hardwareApi }