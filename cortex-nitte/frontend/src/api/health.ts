import { apiClient } from './client'
import { HealthResponse } from '../types'

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/health')
  return data
}
