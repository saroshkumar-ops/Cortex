import { useEffect, useRef } from 'react'
import useCortexStore from '../store/cortex'
import { WebSocketMessage } from '../types'

const MAX_RECONNECT_DELAY = 10000

export function useWebSocket() {
  const setWebSocketMessage = useCortexStore(
    (state) => state.setWebSocketMessage
  )
  const setConnectionStatus = useCortexStore(
    (state) => state.setConnectionStatus
  )
  const graph = useCortexStore((state) => state.graph)
  const prediction = useCortexStore((state) => state.prediction)
  const activeIncidents = useCortexStore((state) => state.activeIncidents)
  const memoryPulse = useCortexStore((state) => state.memoryPulse)
  const connectionStatus = useCortexStore((state) => state.connectionStatus)
  const reconnectAttempt = useRef(0)
  const reconnectTimeout = useRef<number | null>(null)

  useEffect(() => {
    let socket: WebSocket | null = null
    let isMounted = true

    const connect = () => {
      if (!isMounted) {
        return
      }

      setConnectionStatus('connecting')
      socket = new WebSocket(import.meta.env.VITE_WS_URL)

      socket.onopen = () => {
        reconnectAttempt.current = 0
        setConnectionStatus('open')
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as WebSocketMessage
          setWebSocketMessage(payload)
        } catch (error) {
          setWebSocketMessage({
            type: 'error',
            message: 'Malformed WebSocket payload',
          })
          setConnectionStatus('error')
        }
      }

      socket.onerror = () => {
        setConnectionStatus('error')
      }

      socket.onclose = () => {
        setConnectionStatus('closed')
        if (!isMounted) {
          return
        }

        const attempt = reconnectAttempt.current
        const delay = Math.min(800 * 2 ** attempt, MAX_RECONNECT_DELAY)
        reconnectAttempt.current = attempt + 1

        reconnectTimeout.current = window.setTimeout(() => {
          connect()
        }, delay)
      }
    }

    connect()

    return () => {
      isMounted = false
      if (socket) {
        socket.close()
      }
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current)
      }
    }
  }, [setConnectionStatus, setWebSocketMessage])

  return {
    graph,
    prediction,
    activeIncidents,
    memoryPulse,
    connectionStatus,
  }
}
