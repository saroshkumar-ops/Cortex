import { apiClient } from './client'
import { Incident, IncidentsResponse } from '../types'

export async function fetchIncidents(): Promise<IncidentsResponse> {
  const { data } = await apiClient.get<IncidentsResponse>('/api/incidents')
  return data
}

export async function fetchIncidentById(id: string): Promise<Incident> {
  const { data } = await apiClient.get<Incident>(`/api/incidents/${id}`)
  return data
}
