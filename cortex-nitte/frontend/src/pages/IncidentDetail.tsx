import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, GitPullRequest } from 'lucide-react'
import { reconstructContext } from '../api/context'
import CausalChain from '../components/incidents/CausalChain'
import IncidentLogList from '../components/incidents/IncidentLogList'
import SimilarIncidents from '../components/incidents/SimilarIncidents'
import RemediationSuggestions from '../components/predictions/RemediationSuggestions'
import ConfidenceBar from '../components/shared/ConfidenceBar'
import EmptyState from '../components/shared/EmptyState'
import SeverityBadge from '../components/shared/SeverityBadge'
import { useIncidentById } from '../hooks/useIncidents'

interface IncidentDetailProps {}

export default function IncidentDetail({}: IncidentDetailProps) {
  const { id } = useParams()
  const { data: incident, isLoading: incidentLoading } = useIncidentById(id)

  const contextQuery = useQuery({
    queryKey: ['context', id],
    queryFn: async () =>
      reconstructContext({
        service: incident?.service ?? '',
        trigger: incident?.cause ?? 'prediction',
        mode: 'deep',
      }),
    enabled: Boolean(incident),
  })

  const context = contextQuery.data

  const relatedEvents = useMemo(() => context?.related_events ?? [], [context])

  if (incidentLoading) {
    return (
      <EmptyState
        icon={Activity}
        title="Loading incident"
        subtitle="Pulling the incident timeline from Cortex."
      />
    )
  }

  if (!incident) {
    return (
      <EmptyState
        icon={Activity}
        title="Incident not found"
        subtitle="We could not locate this incident in the feed."
      />
    )
  }

  return (
    <div className="space-y-8">
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="panel-title">Incident {incident.id}</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              {incident.service}
            </h2>
            <p className="text-xs text-slate">Cause: {incident.cause}</p>
          </div>
          <SeverityBadge severity={incident.severity} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate">
              Status
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {incident.status}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate">
              Failure probability
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {Math.round(incident.failure_prob * 100)}%
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate">
              Confidence
            </p>
            <div className="mt-2">
              <ConfidenceBar value={incident.confidence} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <p className="panel-title">Causal chain</p>
          <p className="text-xs text-slate">
            Delta minutes highlight temporal reasoning across events.
          </p>
        </div>
        <CausalChain chain={context?.causal_chain ?? []} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div>
            <p className="panel-title">Similar incidents</p>
            <p className="text-xs text-slate">
              Memory layer matches across service renames.
            </p>
          </div>
          <SimilarIncidents
            incidents={context?.similar_past_incidents ?? []}
            currentService={incident.service}
          />
        </div>
        <div className="space-y-4">
          <div>
            <p className="panel-title">Suggested remediations</p>
            <p className="text-xs text-slate">
              Ranked by historical success rate.
            </p>
          </div>
          <RemediationSuggestions
            suggestions={context?.suggested_remediations ?? []}
          />
        </div>
      </section>

      <section className="panel p-6">
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-4 w-4 text-slate" />
          <p className="panel-title">Reconstruction narrative</p>
        </div>
        <p className="mt-3 text-sm text-slate">
          {context?.explain ?? 'Cortex is still generating the reconstruction.'}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate">
              Reconstruction confidence
            </p>
            <div className="mt-2">
              <ConfidenceBar value={context?.confidence ?? 0} />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate">
              Latency
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {context?.latency_ms ?? 0} ms
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate">
              Similar matches
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {context?.similar_past_incidents.length ?? 0}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="panel-title">Log events</p>
          <p className="text-xs text-slate">
            Extracted from benchmark telemetry for this incident window.
          </p>
        </div>
        <IncidentLogList events={relatedEvents} />
      </section>

      <section className="panel p-6">
        <p className="panel-title">Related events</p>
        <div className="mt-4 space-y-3">
          {relatedEvents.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No related events"
              subtitle="Context events will appear when reconstruction finishes."
            />
          ) : (
            relatedEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-haze bg-white/70 p-4 text-xs text-slate"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{event.kind}</span>
                  <span>{new Date(event.timestamp).toLocaleString()}</span>
                </div>
                <p className="mt-2">Service: {event.service}</p>
                <p className="mt-1">Provenance: {event.provenance}</p>
                <pre className="mt-2 whitespace-pre-wrap text-[10px] text-slate">
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
