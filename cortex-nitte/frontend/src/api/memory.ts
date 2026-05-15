import { apiClient } from './client'
import { MemoryStatsResponse } from '../types'

export async function fetchMemoryStats(): Promise<MemoryStatsResponse> {
  const { data } = await apiClient.get<MemoryStatsResponse>('/api/memory/stats')
  return data
}
