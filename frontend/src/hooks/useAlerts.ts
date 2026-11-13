import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { alertsApi } from '@/lib/api'
import type { AlertCreate } from '@/types'

function useInvalidateAlerts() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['alerts'] })
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertsApi.getAll().then((r) => r.data),
    refetchInterval: 60_000,
  })
}

export function useCreateAlert() {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: (data: AlertCreate) => alertsApi.create(data).then((r) => r.data),
    onSuccess: () => invalidate(),
  })
}

export function useToggleAlert() {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      alertsApi.update(id, isActive).then((r) => r.data),
    onSuccess: () => invalidate(),
  })
}

export function useDeleteAlert() {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: (id: number) => alertsApi.delete(id),
    onSuccess: () => invalidate(),
  })
}
