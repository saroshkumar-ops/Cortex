import { useQuery } from '@tanstack/react-query'
import { fetchActions } from '../api/actions'

export function useActions() {
  return useQuery({
    queryKey: ['actions'],
    queryFn: fetchActions,
  })
}
