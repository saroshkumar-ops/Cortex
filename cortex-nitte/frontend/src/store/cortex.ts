import { create } from 'zustand'

// ── Graph node — exactly matches backend export_for_visualization ──────────
export interface ServiceNode {
  id: string
  label: string
  status: 'healthy' | 'degraded' | 'critical'
  health: number // 0–1
  metrics: {
    latency_p50: number
    latency_p99: number
    error_rate: number
    request_rate: number
    cpu_percent: number
    memory_percent: number
  }
  history: {
    latency_p99: number[]
    error_rate: number[]
  }
}

export interface ServiceEdge {
  id: string // "auth->orders"
  source: string
  target: string
  metrics: {
    call_volume: number
    error_rate: number
    latency: number
  }
}

export interface GraphState {
  nodes: ServiceNode[]
  edges: ServiceEdge[]
  tick_id: number
  timestamp: number
}

// ── Prediction — matches backend ml inference output ─────────────────────
export interface Prediction {
  failure_prob: number
  confidence: number
  time_to_failure_minutes: number
  cascade_path: string[]    // named services
  node_names?: string[]
  confidence_degraded?: boolean
  original_confidence?: number
}

// ── ActionPlan — matches policy_engine.py ActionPlan.to_dict() ────────────
export interface ActionPlan {
  prediction_id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none'
  service: string
  failure_prob: number
  time_to_failure_minutes: number
  confidence: number
  cascade_path: string[]
  actions: Array<{
    type: string
    service: string
    target_replicas?: number
    mode?: string
    level?: string
    message?: string
    reason?: string
  }>
  reasoning: string
  tick_id: number
  is_suppressed: boolean
  created_at: number
}

// ── ActionRecord — matches action_executor.py ActionRecord.to_dict() ──────
export interface ActionRecord {
  prediction_id: string
  severity: string
  service: string
  action_type: string // "scale_up" | "circuit_breaker" | "alert"
  action: Record<string, unknown>
  result: string
  dry_run: boolean
  duration_ms: number
  timestamp: number
}

// ── Backend runtime config ─────────────────────────────────────────────────
export interface BackendConfig {
  dry_run: boolean
  confidence_threshold: number
  prediction_horizon_minutes: number
  graph_update_interval_seconds: number
  k8s_namespace: string
}

// ── Backend health ─────────────────────────────────────────────────────────
export interface BackendHealth {
  status: string
  tick_id: number
  cache_age_ms: number
  is_stale: boolean
  warmup_remaining: number
  shadow_mode: boolean
  dry_run: boolean
  consecutive_errors: number
  ws_clients: number
  services: string[]
}

// ── Notification status ────────────────────────────────────────────────────
export interface NotificationStatus {
  slack: { configured: boolean; webhook_preview: string | null }
  notion: { configured: boolean; database_id_preview: string | null }
  github: { configured: boolean; repo: string | null }
  cooldown_seconds: number
}

// ── PCE Context — output of pce.Engine.reconstruct_context ────────────────
export interface PceCausalEdge {
  cause_id: number
  effect_id: number
  evidence: number[]
  confidence: number
}

export interface PceIncidentMatch {
  past_incident_id: string
  similarity: number
  rationale: string
}

export interface PceRemediation {
  action: string
  target: string
  historical_outcome: string
  confidence: number
}

export interface PceContext {
  related_events: Record<string, unknown>[]
  causal_chain: PceCausalEdge[]
  similar_past_incidents: PceIncidentMatch[]
  suggested_remediations: PceRemediation[]
  confidence: number
  explain: string
}

export interface PceStats {
  events: number
  services_known: number
  incidents_registered: number
  incidents_resolved: number
  rename_chain_size: number
  uptime_s: number
}

// ── Store ──────────────────────────────────────────────────────────────────
interface CortexStore {
  // Live state
  graph: GraphState | null
  prediction: Prediction | null
  latestActionPlan: ActionPlan | null
  actionPlans: ActionPlan[]          // last 100, accumulated from WS
  dryRun: boolean
  connected: boolean
  wsError: string | null

  // Fetched state
  actionLog: ActionRecord[]          // from GET /api/actions
  config: BackendConfig | null
  health: BackendHealth | null
  notificationStatus: NotificationStatus | null

  // PCE-native state
  pceContext: PceContext | null
  pceSignal: Record<string, unknown> | null
  pceStats: PceStats | null

  // Setters
  setGraph: (g: GraphState) => void
  setPrediction: (p: Prediction) => void
  setLatestActionPlan: (ap: ActionPlan | null) => void
  setActionPlans: (plans: ActionPlan[]) => void
  addActionPlan: (ap: ActionPlan) => void
  setDryRun: (v: boolean) => void
  setConnected: (v: boolean) => void
  setWsError: (e: string | null) => void

  setActionLog: (log: ActionRecord[]) => void
  setConfig: (c: BackendConfig) => void
  setHealth: (h: BackendHealth) => void
  setNotificationStatus: (n: NotificationStatus) => void

  setPceContext: (c: PceContext | null, s: Record<string, unknown> | null) => void
  setPceStats: (s: PceStats | null) => void
}

export const useCortexStore = create<CortexStore>((set) => ({
  graph: null,
  prediction: null,
  latestActionPlan: null,
  actionPlans: [],
  dryRun: true,
  connected: false,
  wsError: null,

  actionLog: [],
  config: null,
  health: null,
  notificationStatus: null,

  pceContext: null,
  pceSignal: null,
  pceStats: null,

  setGraph: (graph) => set({ graph }),
  setPrediction: (prediction) => set({ prediction }),
  setLatestActionPlan: (latestActionPlan) => set({ latestActionPlan }),
  setActionPlans: (actionPlans) => set({
    actionPlans,
    latestActionPlan: actionPlans[0] ?? null,
  }),
  addActionPlan: (ap) =>
    set((s) => ({
      latestActionPlan: ap,
      actionPlans: [ap, ...s.actionPlans.filter((plan) => plan.prediction_id !== ap.prediction_id)].slice(0, 100),
    })),
  setDryRun: (dryRun) => set({ dryRun }),
  setConnected: (connected) => set({ connected }),
  setWsError: (wsError) => set({ wsError }),

  setActionLog: (actionLog) => set({ actionLog }),
  setConfig: (config) => set({ config }),
  setHealth: (health) => set({ health }),
  setNotificationStatus: (notificationStatus) => set({ notificationStatus }),

  setPceContext: (pceContext, pceSignal) => set({ pceContext, pceSignal }),
  setPceStats: (pceStats) => set({ pceStats }),
}))
