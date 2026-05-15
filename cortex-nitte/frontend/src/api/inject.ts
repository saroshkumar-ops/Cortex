import { apiClient } from './client'
import { InjectRequest } from '../types'

export async function injectFault(
  service: string,
  payload: InjectRequest
): Promise<void> {
  await apiClient.post(`/api/inject/${service}`, payload)
}

export async function clearFault(service: string): Promise<void> {
  await apiClient.delete(`/api/inject/${service}`)
}
