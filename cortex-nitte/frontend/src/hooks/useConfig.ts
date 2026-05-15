import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConfig, updateConfig } from '../api/config'

export function useConfig() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
  })

  const mutation = useMutation({
    mutationFn: updateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
    },
  })

  return { ...query, updateConfig: mutation }
}
