import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Incident } from '../../types'
import SeverityBadge from '../shared/SeverityBadge'

interface IncidentCardProps {
  incident: Incident
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  return date.toLocaleString()
}

const statusStyles: Record<Incident['status'], string> = {
  open: 'bg-red-500/15 text-red-600',
  investigating: 'bg-yellow-500/15 text-yellow-700',
  resolved: 'bg-green-500/15 text-green-600',
}

export default function IncidentCard({ incident }: IncidentCardProps) {
  return (
    <Link
      to={`/incidents/${incident.id}`}
      className="panel block space-y-4 p-4 transition hover:-translate-y-0.5 hover:shadow-glow"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">{incident.service}</p>
          <p className="text-xs text-slate">Triggered {formatTimestamp(incident.triggered_at)}</p>
        </div>
        <SeverityBadge severity={incident.severity} />
      </div>

      <div className="flex items-center justify-between text-xs text-slate">
        <span className="capitalize">{incident.cause}</span>
        <span
          className={clsx(
            'rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide',
            statusStyles[incident.status]
          )}
        >
          {incident.status}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-slate">
        <span>Outcome: {incident.outcome}</span>
        <span>Similarity matches: {incident.similar_incidents_count}</span>
      </div>
    </Link>
  )
}
