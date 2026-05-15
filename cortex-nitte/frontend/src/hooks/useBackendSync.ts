import { useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ActionPlan,
  ActionRecord,
  BackendConfig,
  BackendHealth,
  GraphState,
  NotificationStatus,
  Prediction,
  useCortexStore,
} from '../store/cortex'
import { API_BASE } from '../lib/api'

export function useBackendSync() {
  const {
    setActionLog,
    setConfig,
    setDryRun,
    setGraph,
    setHealth,
    setNotificationStatus,
    setPrediction,
    setActionPlans,
    addActionPlan,
  } = useCortexStore()
  const location = useLocation()

  const fetchJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T | null> => {
    try {
      const res = await fetch(`${API_BASE}${path}`, init)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return (await res.json()) as T
    } catch (err) {
      console.error(`Backend sync failed for ${path}`, err)
      return null
    }
  }, [])

  const syncGraph = useCallback(async () => {
    const graph = await fetchJson<GraphState>('/api/graph')
    if (graph) setGraph(graph)
  }, [fetchJson, setGraph])

  const syncRuntime = useCallback(async () => {
    const [config, health, notificationStatus, actions, incidents] = await Promise.all([
      fetchJson<BackendConfig>('/api/config'),
      fetchJson<BackendHealth>('/health'),
      fetchJson<NotificationStatus>('/api/notifications/status'),
      fetchJson<{ actions: ActionRecord[] }>('/api/actions?limit=100'),
      fetchJson<{ action_plans: ActionPlan[] }>('/api/incidents?limit=100'),
    ])

    if (config) {
      setConfig(config)
      setDryRun(config.dry_run)
    }
    if (health) setHealth(health)
    if (notificationStatus) setNotificationStatus(notificationStatus)
    if (actions?.actions) setActionLog(actions.actions)
    if (incidents?.action_plans) setActionPlans(incidents.action_plans)
  }, [fetchJson, setActionLog, setActionPlans, setConfig, setDryRun, setHealth, setNotificationStatus])

  const syncPrediction = useCallback(async () => {
    const prediction = await fetchJson<{ prediction: Prediction; action_plan: ActionPlan | null }>('/api/prediction')
    if (prediction?.prediction && Object.keys(prediction.prediction).length > 0) {
      setPrediction(prediction.prediction)
    }
    if (prediction?.action_plan) {
      addActionPlan(prediction.action_plan)
    }
  }, [addActionPlan, fetchJson, setPrediction])

  const syncAll = useCallback(() => {
    void syncGraph()
    void syncRuntime()
    void syncPrediction()
  }, [syncGraph, syncPrediction, syncRuntime])

  useEffect(() => {
    syncAll()

    const graphTimer = window.setInterval(syncGraph, 2000)
    const predictionTimer = window.setInterval(syncPrediction, 5000)
    const runtimeTimer = window.setInterval(syncRuntime, 10000)

    return () => {
      window.clearInterval(graphTimer)
      window.clearInterval(predictionTimer)
      window.clearInterval(runtimeTimer)
    }
  }, [syncAll, syncGraph, syncPrediction, syncRuntime])

  useEffect(() => {
    syncAll()
  }, [location.pathname, syncAll])
}
