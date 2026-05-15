import { apiClient } from './client'
import { ContextResponse, ReconstructRequest } from '../types'

export async function reconstructContext(
  payload: ReconstructRequest
): Promise<ContextResponse> {
  const { data } = await apiClient.post<ContextResponse>(
    '/api/context/reconstruct',
    payload
  )
  return data
}
