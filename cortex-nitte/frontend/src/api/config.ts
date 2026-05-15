import { apiClient } from './client'
import { Config } from '../types'

export async function fetchConfig(): Promise<Config> {
  const { data } = await apiClient.get<Config>('/api/config')
  return data
}

export async function updateConfig(
  payload: Partial<Config>
): Promise<Config> {
  const { data } = await apiClient.patch<Config>('/api/config', payload)
  return data
}
