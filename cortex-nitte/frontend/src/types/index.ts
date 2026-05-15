export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthResponse {
  status: HealthStatus
  tick_id: number
  warmup_remaining: number
  uptime_seconds: number
  memory_stats: {
    total_incidents_stored: number
    incident_families: number
    topology_renames_handled: number
    avg_remediation_accuracy: number
  }
}

export type ServiceStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

export interface Service {
  id: string
  name: string
  status: ServiceStatus
  failure_prob: number
  latency_p99: number
  error_rate: number
  replicas: number
  last_deploy: string | null
}

export interface ServiceEdge {
  from: string
  to: string
  weight: number
}

export interface ServicesResponse {
  services: Service[]
  edges: ServiceEdge[]
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'none'

export interface CausalEdge {
  cause_id: string
  effect_id: string
  evidence: string
  confidence: number
  delta_minutes: number
}

export interface PredictionResponse {
  failure_prob: number
  time_to_failure_minutes: number
  confidence: number
  cascade_path: string[]
  severity: Severity
  causal_chain: CausalEdge[]
}

export interface ReconstructRequest {
  service: string
  trigger: string
  mode: 'fast' | 'deep'
}

export interface ContextEvent {
  id: string
  kind: 'deploy' | 'metric' | 'log' | 'trace' | 'topology' | 'remediation'
  service: string
  timestamp: string
  data: Record<string, any>
  provenance: string
}

export interface SimilarPastIncident {
  incident_id: string
  service: string
  timestamp: string
  similarity: number
  rationale: string
  remediation_used: string
  outcome: 'resolved' | 'failed'
  time_to_resolve_minutes: number
}

export interface SuggestedRemediation {
  action: string
  target: string
  confidence: number
  historical_outcome: string
  times_used: number
  times_succeeded: number
}

export interface ContextResponse {
  related_events: ContextEvent[]
  causal_chain: CausalEdge[]
  similar_past_incidents: SimilarPastIncident[]
  suggested_remediations: SuggestedRemediation[]
  confidence: number
  explain: string
  latency_ms: number
}

export type IncidentStatus = 'open' | 'investigating' | 'resolved'
export type IncidentOutcome = 'resolved' | 'failed' | 'pending'

export interface Incident {
  id: string
  service: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: IncidentStatus
  triggered_at: string
  resolved_at: string | null
  failure_prob: number
  cause: string
  remediation_applied: string | null
  outcome: IncidentOutcome
  time_to_resolve_minutes: number | null
  similar_incidents_count: number
  confidence: number
}

export interface IncidentsResponse {
  incidents: Incident[]
  total: number
}

export interface MemoryIncidentFamily {
  id: string
  name: string
  count: number
  avg_resolution_time_minutes: number
  top_remediation: string
  top_remediation_confidence: number
  services_affected: string[]
}

export interface TopologyHistoryEntry {
  timestamp: string
  change: 'rename' | 'add' | 'remove'
  from: string
  to: string
}

export interface RemediationAccuracyPoint {
  date: string
  accuracy: number
}

export interface MemoryStatsResponse {
  total_incidents: number
  incident_families: MemoryIncidentFamily[]
  topology_history: TopologyHistoryEntry[]
  remediation_accuracy_over_time: RemediationAccuracyPoint[]
}

export type ActionType = 'scale' | 'rollback' | 'circuit_break' | 'alert'
export type ActionStatus = 'pending' | 'executed' | 'dry_run' | 'failed'

export interface Action {
  id: string
  incident_id: string
  service: string
  action_type: ActionType
  status: ActionStatus
  triggered_at: string
  outcome: IncidentOutcome
  slack_sent: boolean
  github_pr_url: string | null
  notion_page_url: string | null
}

export interface ActionsResponse {
  actions: Action[]
}

export interface Config {
  dry_run: boolean
  shadow_mode: boolean
  confidence_threshold: number
  prediction_horizon_minutes: number
}

export interface NotificationsStatus {
  slack: { connected: boolean; channel: string }
  github: { connected: boolean; repo: string }
  notion: { connected: boolean; database_id: string }
}

export interface InjectRequest {
  type: 'latency' | 'error_rate' | 'cpu' | 'traffic_spike'
  magnitude: number
}

export interface MemoryPulse {
  last_incident_matched: string | null
  confidence_delta: number
}

export interface WebSocketMessage {
  type: 'update' | 'snapshot' | 'error'
  graph?: {
    nodes: Service[]
    edges: ServiceEdge[]
    tick_id: number
  }
  prediction?: PredictionResponse
  active_incidents?: Incident[]
  action_plan?: {
    severity: string
    actions: Action[]
  }
  memory_pulse?: MemoryPulse
  dry_run?: boolean
  message?: string
  consecutive_errors?: number
}
