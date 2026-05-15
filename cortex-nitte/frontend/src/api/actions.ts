import { apiClient } from './client'
import { ActionsResponse } from '../types'

export async function fetchActions(): Promise<ActionsResponse> {
  const { data } = await apiClient.get<ActionsResponse>('/api/actions')
  return data
}
