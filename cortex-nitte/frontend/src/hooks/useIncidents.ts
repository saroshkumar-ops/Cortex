import { useQuery } from '@tanstack/react-query'
import { fetchIncidentById, fetchIncidents } from '../api/incidents'

export function useIncidents() {
  return useQuery({
    queryKey: ['incidents'],
    queryFn: fetchIncidents,
  })
}

export function useIncidentById(id?: string) {
  return useQuery({
    queryKey: ['incidents', id],
    queryFn: () => fetchIncidentById(id ?? ''),
    enabled: Boolean(id),
  })
}
