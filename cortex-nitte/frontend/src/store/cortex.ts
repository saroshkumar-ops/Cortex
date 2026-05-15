import { create } from 'zustand'
import {
  Action,
  Incident,
  MemoryPulse,
  PredictionResponse,
  Service,
  ServiceEdge,
  WebSocketMessage,
} from '../types'

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface GraphSnapshot {
  nodes: Service[]
  edges: ServiceEdge[]
  tick_id: number
}

export interface ActionPlan {
  severity: string
  actions: Action[]
}

interface CortexState {
  graph: GraphSnapshot | null
  prediction: PredictionResponse | null
  activeIncidents: Incident[]
  actionPlan: ActionPlan | null
  memoryPulse: MemoryPulse | null
  dryRun: boolean
  connectionStatus: ConnectionStatus
  consecutiveErrors: number
  lastMessage: string | null
  setWebSocketMessage: (message: WebSocketMessage) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  reset: () => void
}

const initialState: Omit<
  CortexState,
  'setWebSocketMessage' | 'setConnectionStatus' | 'reset'
> = {
  graph: null,
  prediction: null,
  activeIncidents: [],
  actionPlan: null,
  memoryPulse: null,
  dryRun: false,
  connectionStatus: 'connecting',
  consecutiveErrors: 0,
  lastMessage: null,
}

const useCortexStore = create<CortexState>((set) => ({
  ...initialState,
  setWebSocketMessage: (message) =>
    set((state) => {
      const nextState: Partial<CortexState> = {}

      if (message.graph) {
        nextState.graph = message.graph
      }
      if (message.prediction) {
        nextState.prediction = message.prediction
      }
      if (message.active_incidents) {
        nextState.activeIncidents = message.active_incidents
      }
      if (message.action_plan) {
        nextState.actionPlan = message.action_plan
      }
      if (message.memory_pulse) {
        nextState.memoryPulse = message.memory_pulse
      }
      if (typeof message.dry_run === 'boolean') {
        nextState.dryRun = message.dry_run
      }
      if (typeof message.consecutive_errors === 'number') {
        nextState.consecutiveErrors = message.consecutive_errors
      }
      if (message.message) {
        nextState.lastMessage = message.message
      }

      if (Object.keys(nextState).length === 0) {
        return state
      }

      return { ...state, ...nextState }
    }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  reset: () => set(initialState),
}))

export default useCortexStore
