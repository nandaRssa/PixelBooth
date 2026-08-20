import { useQuery, useQueryClient } from '@tanstack/react-query'
import { templateApi } from '@/api/templates'
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

export function useInvalidateTemplates() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['templates'] })
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

export { hardwareApi }