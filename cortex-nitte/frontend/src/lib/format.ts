export function formatMetric(value: number | null | undefined, decimals = 0): string {
  if (value == null) return '--'
  return value.toFixed(decimals)
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '--'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatRelative(ts: number | null | undefined): string {
  if (!ts) return '--'
  const now = Date.now() / 1000
  const diff = now - ts
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export function formatETF(minutes: number | null | undefined): string {
  if (!minutes) return '--'
  const mins = Math.floor(minutes)
  const secs = Math.floor((minutes - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '--'
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function statusColor(status: string): string {
  return (
    { healthy: '#10B981', degraded: '#F59E0B', critical: '#EF4444' }[status] ??
    '#6B7280'
  )
}

export function statusBg(status: string): string {
  return (
    { healthy: '#e8f8ef', degraded: '#fff3df', critical: '#ffe6e6' }[status] ??
    '#f3f4f6'
  )
}

export function probToSeverity(prob: number): 'critical' | 'high' | 'medium' | 'low' | 'nominal' {
  if (prob >= 0.9) return 'critical'
  if (prob >= 0.7) return 'high'
  if (prob >= 0.5) return 'medium'
  if (prob >= 0.3) return 'low'
  return 'nominal'
}

export function probToColor(prob: number): string {
  const sev = probToSeverity(prob)
  return (
    { critical: '#EF4444', high: '#F59E0B', medium: '#FBBF24', low: '#3B82F6', nominal: '#10B981' }[sev] ??
    '#6B7280'
  )
}

export function severityToColor(severity: string): { bg: string; text: string; border: string } {
  switch (severity) {
    case 'critical': return { bg: '#ffe6e6', text: '#8c1d1d', border: '#fca5a5' }
    case 'high':     return { bg: '#fff3df', text: '#7b4a00', border: '#fcd34d' }
    case 'medium':   return { bg: '#fefce8', text: '#713f12', border: '#fde68a' }
    case 'low':      return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' }
    default:         return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
  }
}
