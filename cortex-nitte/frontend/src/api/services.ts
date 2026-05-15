import { apiClient } from './client'
import { ServicesResponse } from '../types'

export async function fetchServices(): Promise<ServicesResponse> {
  const { data } = await apiClient.get<ServicesResponse>('/api/services')
  return data
}
