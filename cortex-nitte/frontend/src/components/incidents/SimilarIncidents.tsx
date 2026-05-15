import { History } from 'lucide-react'
import { SimilarPastIncident } from '../../types'
import ConfidenceBar from '../shared/ConfidenceBar'
import EmptyState from '../shared/EmptyState'

interface SimilarIncidentsProps {
  incidents: SimilarPastIncident[]
  currentService: string
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  return date.toLocaleString()
}

export default function SimilarIncidents({
  incidents,
  currentService,
}: SimilarIncidentsProps) {
  if (!incidents.length) {
    return (
      <EmptyState
        icon={History}
        title="No similar incidents"
        subtitle="Cortex will surface matching fingerprints when available."
      />
    )
  }

  return (
    <div className="space-y-4">
      {incidents.map((incident) => {
        const matchedAcrossRename = incident.service !== currentService

        return (
          <div key={incident.incident_id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">
                  {incident.service}
                </p>
                <p className="text-xs text-slate">
                  {formatTimestamp(incident.timestamp)}
                </p>
                <p className="text-xs text-slate">Outcome: {incident.outcome}</p>
                {matchedAcrossRename ? (
                  <span className="chip border-ember/40 bg-ember/15 text-ember">
                    Matched across rename
                  </span>
                ) : null}
              </div>
              <div className="min-w-[200px] space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                  Similarity
                </p>
                <ConfidenceBar value={incident.similarity} />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate">
              <p>Remediation: {incident.remediation_used}</p>
              <p>Resolved in {incident.time_to_resolve_minutes} min</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
