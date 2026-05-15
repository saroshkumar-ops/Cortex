import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import IncidentCard from '../components/incidents/IncidentCard'
import EmptyState from '../components/shared/EmptyState'
import { useIncidents } from '../hooks/useIncidents'

interface IncidentsProps {}

const filters = ['all', 'open', 'resolved'] as const

const severityRank = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export default function Incidents({}: IncidentsProps) {
  const { data, isLoading } = useIncidents()
  const [filter, setFilter] = useState<(typeof filters)[number]>('all')

  const incidents = useMemo(() => {
    const list = data?.incidents ?? []
    const filtered = list.filter((incident) => {
      if (filter === 'all') {
        return true
      }
      if (filter === 'open') {
        return incident.status !== 'resolved'
      }
      return incident.status === 'resolved'
    })

    return filtered.sort(
      (a, b) => severityRank[b.severity] - severityRank[a.severity]
    )
  }, [data, filter])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="panel-title">Incidents</p>
          <p className="text-xs text-slate">
            All incidents sorted by severity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide ${
                filter === item
                  ? 'bg-ink text-white'
                  : 'border border-haze text-slate'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <EmptyState
          icon={AlertTriangle}
          title="Loading incidents"
          subtitle="Fetching the latest incident timeline."
        />
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No incidents"
          subtitle="No incident entries match the current filter."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {incidents.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </div>
  )
}
