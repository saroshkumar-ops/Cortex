import { apiClient } from './client'
import { NotificationsStatus } from '../types'

export async function fetchNotificationsStatus(): Promise<NotificationsStatus> {
  const { data } = await apiClient.get<NotificationsStatus>(
    '/api/notifications/status'
  )
  return data
}
