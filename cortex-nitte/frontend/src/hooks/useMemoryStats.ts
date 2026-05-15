import { useQuery } from '@tanstack/react-query'
import { fetchMemoryStats } from '../api/memory'

export function useMemoryStats() {
  return useQuery({
    queryKey: ['memory-stats'],
    queryFn: fetchMemoryStats,
  })
}
