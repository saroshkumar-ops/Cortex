import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { injectFault, clearFault } from '../../api/inject'
import { useServices } from '../../hooks/useServices'
import { InjectRequest } from '../../types'

interface InjectState {
  type: InjectRequest['type']
  magnitude: number
}

const defaultState: InjectState = {
  type: 'latency',
  magnitude: 50,
}

interface FaultInjectorProps {}

export default function FaultInjector({}: FaultInjectorProps) {
  const { data } = useServices()
  const services = data?.services ?? []
  const [stateMap, setStateMap] = useState<Record<string, InjectState>>({})

  const injectMutation = useMutation({
    mutationFn: async ({ serviceId, payload }: { serviceId: string; payload: InjectRequest }) => {
      await injectFault(serviceId, payload)
    },
  })

  const clearMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      await clearFault(serviceId)
    },
  })

  const handlers = useMemo(() => {
    return {
      getState: (serviceId: string) => stateMap[serviceId] ?? defaultState,
      updateState: (serviceId: string, patch: Partial<InjectState>) => {
        setStateMap((prev) => ({
          ...prev,
          [serviceId]: { ...(prev[serviceId] ?? defaultState), ...patch },
        }))
      },
    }
  }, [stateMap])

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between">
        <p className="panel-title">Fault injector</p>
        <span className="text-xs text-slate">Demo controls</span>
      </div>

      <div className="mt-4 space-y-4">
        {services.map((service) => {
          const state = handlers.getState(service.id)

          return (
            <div
              key={service.id}
              className="rounded-2xl border border-haze bg-white/70 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{service.name}</p>
                  <p className="text-xs text-slate">{service.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      clearMutation.mutate(service.id)
                    }
                    className="rounded-full border border-haze px-3 py-1 text-xs font-semibold text-slate hover:bg-haze/60"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      injectMutation.mutate({
                        serviceId: service.id,
                        payload: {
                          type: state.type,
                          magnitude: state.magnitude,
                        },
                      })
                    }
                    className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
                  >
                    Inject
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_2fr]">
                <label className="flex flex-col gap-2 text-xs font-semibold text-slate">
                  Fault type
                  <select
                    value={state.type}
                    onChange={(event) =>
                      handlers.updateState(service.id, {
                        type: event.target.value as InjectState['type'],
                      })
                    }
                    className="rounded-lg border border-haze bg-white px-3 py-2 text-sm text-ink"
                  >
                    <option value="latency">Latency</option>
                    <option value="error_rate">Error rate</option>
                    <option value="cpu">CPU</option>
                    <option value="traffic_spike">Traffic spike</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-xs font-semibold text-slate">
                  Magnitude: {state.magnitude}
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={state.magnitude}
                    onChange={(event) =>
                      handlers.updateState(service.id, {
                        magnitude: Number(event.target.value),
                      })
                    }
                    className="w-full"
                  />
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
