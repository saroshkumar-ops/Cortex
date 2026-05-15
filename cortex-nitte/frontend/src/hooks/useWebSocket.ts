import { useEffect, useRef, useCallback } from 'react'
import { useCortexStore, GraphState, Prediction, ActionPlan } from '../store/cortex'
import { WS_URL } from '../lib/api'

const RECONNECT_DELAY_MS = 3000

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(true)
  const { setGraph, setPrediction, addActionPlan, setDryRun, setConnected, setWsError } =
    useCortexStore()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setWsError(null)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)

          // Both "snapshot" (on connect) and "update" (each tick) carry the same fields
          if (msg.type === 'snapshot' || msg.type === 'update') {
            if (msg.graph) setGraph(msg.graph as GraphState)
            if (msg.prediction) setPrediction(msg.prediction as Prediction)
            if (msg.action_plan) addActionPlan(msg.action_plan as ActionPlan)
            if (typeof msg.dry_run === 'boolean') setDryRun(msg.dry_run)
          } else if (msg.type === 'error') {
            setWsError(msg.message ?? 'Backend error')
          }
        } catch (e) {
          console.error('WS parse error', e)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (shouldReconnectRef.current) {
          reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }

      ws.onerror = () => {
        setWsError('WebSocket connection failed')
      }
    } catch (e) {
      console.error('WS connection error', e)
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
    }
  }, [setGraph, setPrediction, addActionPlan, setDryRun, setConnected, setWsError])

  useEffect(() => {
    shouldReconnectRef.current = true
    connect()
    return () => {
      shouldReconnectRef.current = false
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])
}
