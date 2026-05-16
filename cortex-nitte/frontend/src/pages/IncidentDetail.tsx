import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, GitBranch, Lightbulb, Network, ScrollText } from 'lucide-react'

interface SimilarIncident {
  incident_id: string
  similarity: number
  rationale: string
}

interface CausalEdge {
  cause_event_id: string
  effect_event_id: string
  evidence: string
  confidence: number
  timestamps: { cause_ts: string; effect_ts: string }
}

interface Remediation {
  action: string
  target: string
  historical_outcome: string
  confidence: number
}

interface Context {
  similar_past_incidents: SimilarIncident[]
  causal_chain: CausalEdge[]
  suggested_remediations: Remediation[]
  related_events: { event_id: number }[]
  confidence: number
  explain: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function IncidentDetail() {
  const { id } = useParams()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [signal, setSignal] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/pce/reconstruct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incident_id: id, mode: 'fast' }),
        })
        if (!r.ok) {
          setError(`Engine returned ${r.status}`)
          return
        }
        const j = await r.json()
        setCtx(j.context)
        setSignal(j.signal)
      } catch (e) {
        setError(String(e))
      }
    })()
  }, [id])

  return (
    <div className="space-y-6">
      <Link to="/incidents" className="inline-flex items-center gap-2 text-xs text-slate hover:text-ocean">
        <ArrowLeft className="h-3 w-3" /> All incidents
      </Link>

      <div>
        <p className="panel-title">Incident</p>
        <h2 className="mt-1 font-mono text-2xl font-semibold text-ink">{id}</h2>
        {signal && (
          <p className="mt-1 text-sm text-slate">
            <span className="font-semibold text-ink">{signal.service}</span> ·{' '}
            {signal.trigger} · {signal.ts}
          </p>
        )}
        {ctx && (
          <p className="mt-1 text-xs text-slate">
            confidence{' '}
            <span className="font-mono text-ink">{ctx.confidence}</span>
            {' · '}
            {ctx.related_events.length} related events
          </p>
        )}
      </div>

      {error && (
        <div className="panel p-4 text-sm text-ember">
          {error} — make sure the incident is loaded in memory.
        </div>
      )}

      {ctx && (
        <>
          <Section title="Recalled from memory" icon={Network}>
            {ctx.similar_past_incidents.length === 0 ? (
              <p className="text-xs text-slate">No similar past incidents found.</p>
            ) : (
              <ul className="space-y-2">
                {ctx.similar_past_incidents.map((m) => (
                  <li key={m.incident_id} className="rounded-lg border border-haze bg-white/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-ink">{m.incident_id}</span>
                      <span className="rounded-full bg-ocean/15 px-2 py-0.5 font-mono text-[10px] text-ocean">
                        sim {m.similarity.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate">{m.rationale}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Causal chain" icon={GitBranch}>
            {ctx.causal_chain.length === 0 ? (
              <p className="text-xs text-slate">No causal edges built.</p>
            ) : (
              <ol className="space-y-2">
                {ctx.causal_chain.map((e, i) => (
                  <li key={i} className="rounded-lg border border-haze bg-white/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-slate">
                        event #{e.cause_event_id} → #{e.effect_event_id}
                      </span>
                      <span className="font-mono text-[10px] text-ocean">conf {e.confidence}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-ink">{e.evidence}</p>
                    <p className="mt-0.5 text-[10px] text-slate">
                      {e.timestamps.cause_ts} → {e.timestamps.effect_ts}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Suggested remediations" icon={Lightbulb}>
            {ctx.suggested_remediations.length === 0 ? (
              <p className="text-xs text-slate">No remediations suggested.</p>
            ) : (
              <ul className="space-y-2">
                {ctx.suggested_remediations.map((r, i) => (
                  <li key={i} className="rounded-lg border border-haze bg-white/70 p-3">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-moss/15 px-1.5 py-0.5 text-moss">{r.action}</code>
                      <span className="text-xs text-ink">on</span>
                      <span className="font-mono text-xs font-semibold text-ink">{r.target}</span>
                      <span className="ml-auto font-mono text-[10px] text-ocean">conf {r.confidence}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate">{r.historical_outcome}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Explanation" icon={ScrollText}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{ctx.explain}</p>
          </Section>
        </>
      )}
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-ocean" />
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">{title}</h3>
      </div>
      {children}
    </section>
  )
}
