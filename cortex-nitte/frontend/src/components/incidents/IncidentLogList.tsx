import clsx from 'clsx'
import { TerminalSquare } from 'lucide-react'
import { ContextEvent } from '../../types'
import EmptyState from '../shared/EmptyState'

interface IncidentLogListProps {
  events: ContextEvent[]
}

const levelStyles: Record<string, string> = {
  error: 'bg-red-500/15 text-red-600',
  warn: 'bg-orange-500/15 text-orange-600',
  warning: 'bg-orange-500/15 text-orange-600',
  info: 'bg-blue-400/15 text-blue-500',
  debug: 'bg-gray-200 text-gray-600',
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function IncidentLogList({ events }: IncidentLogListProps) {
  const logs = events.filter((event) => event.kind === 'log')

  if (!logs.length) {
    return (
      <EmptyState
        icon={TerminalSquare}
        title="No log events"
        subtitle="Log telemetry will appear here when available."
      />
    )
  }

  return (
    <div className="space-y-3">
      {logs.map((event) => {
        const payload = event.data ?? {}
        const rawLevel = String(payload.level ?? 'info').toLowerCase()
        const message =
          (payload.msg as string | undefined) ??
          (payload.message as string | undefined) ??
          'Log event'
        const traceId = payload.trace_id as string | undefined
        const attrs = payload.attrs as Record<string, unknown> | undefined
        const hasAttrs = attrs && Object.keys(attrs).length > 0

        return (
          <div
            key={event.id}
            className="rounded-2xl border border-haze bg-white/70 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={clsx(
                    'rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide',
                    levelStyles[rawLevel] ?? 'bg-gray-100 text-gray-500'
                  )}
                >
                  {rawLevel}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{message}</p>
                  <p className="text-xs text-slate">Service: {event.service}</p>
                </div>
              </div>
              <div className="text-xs text-slate">
                {formatTimestamp(event.timestamp)}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate">
              {traceId ? <span>Trace: {traceId}</span> : null}
              <span>Source: {event.provenance}</span>
            </div>

            {hasAttrs ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-[10px] text-slate">
                {JSON.stringify(attrs, null, 2)}
              </pre>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
