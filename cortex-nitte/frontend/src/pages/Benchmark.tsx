import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Loader2, CheckCircle2, AlertCircle, Brain, ScrollText, Trophy, Lightbulb } from 'lucide-react'

interface StatusEvent { phase: string; message: string }
interface DatasetEvent { train_events: number; eval_events: number; eval_signals: number; n_services: number; days: number; seed: number }
interface LogEvent { level: string; line: string; kind?: string }
interface MatchedIncident {
  incident_id: string
  similarity: number | null
  rationale: string
  past_ts: string | null
  past_service: string | null
  past_remediation: string | null
}
interface IncidentEvent {
  incident_id: string
  service: string
  trigger: string
  ts: string
  in_top_k: boolean
  precision_at_k: number
  remediation_matches: boolean
  latency_ms: number
  matches: MatchedIncident[]
  suggested: { action: string; support: unknown }[]
  explain: string
}
interface ScoresEvent {
  'recall@5'?: number
  'precision@5_mean'?: number
  remediation_acc?: number
  latency_p95_ms?: number
  latency_mean_ms?: number
  n?: number
}

type Phase = 'idle' | 'running' | 'done' | 'error'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function Benchmark() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState<StatusEvent | null>(null)
  const [dataset, setDataset] = useState<DatasetEvent | null>(null)
  const [thinking, setThinking] = useState('')
  const [reasoning, setReasoning] = useState('')
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [incidents, setIncidents] = useState<IncidentEvent[]>([])
  const [scores, setScores] = useState<ScoresEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [llmStatus, setLlmStatus] = useState<Record<string, { source: string; model?: string | null; error?: string | null }>>({})

  const esRef = useRef<EventSource | null>(null)
  const phaseRef = useRef<Phase>('idle')
  useEffect(() => { phaseRef.current = phase }, [phase])

  const reset = () => {
    setStatus(null)
    setDataset(null)
    setThinking('')
    setReasoning('')
    setLogs([])
    setIncidents([])
    setScores(null)
    setError(null)
    setLlmStatus({})
  }

  const stop = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
  }, [])

  useEffect(() => () => stop(), [stop])

  const start = () => {
    stop()
    reset()
    setPhase('running')

    const url = `${API_BASE}/api/pce/run_benchmark_stream`
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('status', (e) => {
      try { setStatus(JSON.parse((e as MessageEvent).data)) } catch {}
    })
    es.addEventListener('dataset', (e) => {
      try { setDataset(JSON.parse((e as MessageEvent).data)) } catch {}
    })
    es.addEventListener('thinking', (e) => {
      try { setThinking((prev) => prev + (JSON.parse((e as MessageEvent).data).delta ?? '')) } catch {}
    })
    es.addEventListener('reasoning', (e) => {
      try { setReasoning((prev) => prev + (JSON.parse((e as MessageEvent).data).delta ?? '')) } catch {}
    })
    es.addEventListener('log', (e) => {
      try { setLogs((prev) => [...prev, JSON.parse((e as MessageEvent).data)]) } catch {}
    })
    es.addEventListener('incident', (e) => {
      try { setIncidents((prev) => [...prev, JSON.parse((e as MessageEvent).data)]) } catch {}
    })
    es.addEventListener('llm_status', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as { section: string; source: string; model?: string | null; error?: string | null }
        setLlmStatus((prev) => ({ ...prev, [payload.section]: { source: payload.source, model: payload.model, error: payload.error } }))
      } catch {}
    })
    es.addEventListener('scores', (e) => {
      try { setScores(JSON.parse((e as MessageEvent).data)) } catch {}
    })
    es.addEventListener('done', () => {
      setPhase('done')
      stop()
    })
    es.onerror = () => {
      // EventSource fires onerror on normal close too — only flag if we never finished.
      if (phaseRef.current !== 'done') {
        setError('Connection closed before completion')
        setPhase('error')
      }
      stop()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="panel-title">Benchmark Run</p>
          <h2 className="mt-1 text-2xl font-display font-semibold text-ink">
            Live engine trace
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            Triggers a fresh benchmark-style ingest + reconstruct run. Streams
            the engine's thinking, raw logs, per-incident scores, and a
            post-hoc reasoning narrative — all generated live.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={start}
            disabled={phase === 'running'}
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === 'running' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run system
              </>
            )}
          </button>
        </div>
      </div>

      {/* status / dataset */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-4">
          <p className="panel-title">Status</p>
          <div className="mt-2 flex items-center gap-2 text-sm text-ink">
            {phase === 'running' && <Loader2 className="h-4 w-4 animate-spin text-ocean" />}
            {phase === 'done' && <CheckCircle2 className="h-4 w-4 text-ocean" />}
            {phase === 'error' && <AlertCircle className="h-4 w-4 text-ember" />}
            <span className="font-mono text-xs uppercase tracking-widest text-slate">
              {status?.phase ?? phase}
            </span>
            <span>{status?.message ?? (phase === 'idle' ? 'Idle — press Run system' : '')}</span>
          </div>
          {error && <p className="mt-2 text-xs text-ember">{error}</p>}
        </div>
        <div className="panel p-4">
          <p className="panel-title">Dataset</p>
          {dataset ? (
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <Stat label="train events" value={dataset.train_events} />
              <Stat label="eval events" value={dataset.eval_events} />
              <Stat label="signals" value={dataset.eval_signals} />
              <Stat label="services" value={dataset.n_services} />
              <Stat label="days" value={dataset.days} />
              <Stat label="seed" value={dataset.seed} />
            </dl>
          ) : (
            <p className="mt-2 text-xs text-slate">No dataset loaded yet.</p>
          )}
        </div>
      </div>

      {/* thinking */}
      <Section
        title="Live thinking"
        icon={Brain}
        muted={!thinking}
        badge={<SourceBadge status={llmStatus.thinking} />}
      >
        {thinking ? (
          <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-ink">
            {thinking}
            {phase === 'running' && status?.phase === 'think' && <Cursor />}
          </p>
        ) : (
          <p className="text-xs text-slate">
            The engine's plan will stream here while it processes.
          </p>
        )}
      </Section>

      {/* logs */}
      <Section title="Engine logs" icon={ScrollText} muted={logs.length === 0}>
        {logs.length === 0 ? (
          <p className="text-xs text-slate">Logs will appear as the engine ingests and scores.</p>
        ) : (
          <ul className="max-h-96 space-y-1 overflow-auto font-mono text-[11px] text-ink">
            {logs.map((l, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-6 shrink-0 text-right text-slate">{String(i + 1).padStart(2, '0')}</span>
                <span className={`w-12 shrink-0 uppercase ${logLevelClass(l.level)}`}>{l.level}</span>
                {l.kind && (
                  <span className={`w-24 shrink-0 truncate rounded px-1 text-[10px] uppercase ${logKindClass(l.kind)}`}>
                    {l.kind}
                  </span>
                )}
                <span className="break-all whitespace-pre-wrap">{l.line}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* incidents */}
      <Section title={`Per-incident output (${incidents.length})`} icon={ScrollText} muted={incidents.length === 0}>
        {incidents.length === 0 ? (
          <p className="text-xs text-slate">Held-out signals will be reconstructed live.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {incidents.map((inc) => <IncidentCardLive key={inc.incident_id} inc={inc} />)}
          </div>
        )}
      </Section>

      {/* scores */}
      <Section title="Aggregate scores" icon={Trophy} muted={!scores}>
        {scores ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <ScoreCard label="recall@5" value={scores['recall@5']} max={1} />
            <ScoreCard label="precision@5" value={scores['precision@5_mean']} max={1} />
            <ScoreCard label="remediation_acc" value={scores.remediation_acc} max={1} />
            <ScoreCard label="p95 ms" value={scores.latency_p95_ms} suffix="ms" />
            <ScoreCard label="mean ms" value={scores.latency_mean_ms} suffix="ms" />
            <ScoreCard label="n" value={scores.n} />
          </div>
        ) : (
          <p className="text-xs text-slate">Scores will populate after every signal is scored.</p>
        )}
      </Section>

      {/* reasoning */}
      <Section
        title="Why these results"
        icon={Lightbulb}
        muted={!reasoning}
        badge={<SourceBadge status={llmStatus.reasoning} />}
      >
        {reasoning ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {reasoning}
            {phase === 'running' && status?.phase === 'reason' && <Cursor />}
          </p>
        ) : (
          <p className="text-xs text-slate">
            After scoring completes, the engine explains why each design choice produced these numbers.
          </p>
        )}
      </Section>
    </div>
  )
}

function IncidentCardLive({ inc }: { inc: IncidentEvent }) {
  const top = inc.matches[0]
  return (
    <div className="rounded-xl border border-haze bg-white/80 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-ink">{inc.incident_id}</span>
        <span className="text-xs text-slate">{inc.latency_ms.toFixed(1)} ms</span>
      </div>
      <p className="mt-1 text-xs text-slate">
        <span className="font-semibold text-ink">{inc.service}</span> · {inc.trigger}
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <Badge ok={inc.in_top_k}>in top-5: {String(inc.in_top_k)}</Badge>
        <Badge ok={inc.precision_at_k >= 0.4}>P@5: {inc.precision_at_k}</Badge>
        <Badge ok={inc.remediation_matches}>rem: {String(inc.remediation_matches)}</Badge>
      </div>

      {top && (
        <div className="mt-3 rounded-lg border border-ocean/20 bg-ocean/5 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-ocean">
            <span>↶ recalled from memory</span>
            {typeof top.similarity === 'number' && (
              <span className="ml-auto rounded-full bg-ocean/15 px-1.5 py-0.5 font-mono text-[9px] text-ocean">
                sim {top.similarity.toFixed(3)}
              </span>
            )}
          </div>
          <div className="mt-1 font-mono text-[11px] text-ink">
            <span className="font-semibold">{top.incident_id}</span>
            {top.past_service && <span className="text-slate"> · {top.past_service}</span>}
            {top.past_ts && <span className="text-slate"> · {formatTs(top.past_ts)}</span>}
          </div>
          {top.past_remediation && (
            <div className="mt-1 text-[11px] text-ink">
              <span className="text-slate">previously fixed by </span>
              <code className="rounded bg-moss/15 px-1 py-0.5 text-moss">{top.past_remediation}</code>
            </div>
          )}
          {top.rationale && (
            <p className="mt-1 line-clamp-2 text-[10px] text-slate">{top.rationale}</p>
          )}
        </div>
      )}

      {inc.matches.length > 1 && (
        <p className="mt-1.5 truncate font-mono text-[10px] text-slate">
          + {inc.matches.length - 1} more: {inc.matches.slice(1).map((m) => m.incident_id).join(', ')}
        </p>
      )}
      {inc.suggested.length > 0 && (
        <p className="mt-1.5 truncate font-mono text-[11px] text-slate">
          <span className="text-ink">suggests:</span> {inc.suggested.map((s) => s.action).join(', ')}
        </p>
      )}
      {inc.explain && (
        <p className="mt-2 line-clamp-3 text-[10px] text-slate">{inc.explain}</p>
      )}
    </div>
  )
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts
    return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
  } catch { return ts }
}

function Section({
  title,
  icon: Icon,
  children,
  muted,
  badge,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  muted?: boolean
  badge?: React.ReactNode
}) {
  return (
    <section className={`panel p-4 ${muted ? 'opacity-90' : ''}`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-ocean" />
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">{title}</h3>
        {badge}
      </div>
      {children}
    </section>
  )
}

function SourceBadge({ status }: { status?: { source: string; model?: string | null; error?: string | null } }) {
  if (!status) return null
  if (status.source === 'llm') {
    return (
      <span className="ml-auto rounded-full bg-moss/15 px-2 py-0.5 font-mono text-[10px] text-moss">
        {status.model ?? 'llm'}
      </span>
    )
  }
  return (
    <span
      className="ml-auto rounded-full bg-ember/15 px-2 py-0.5 font-mono text-[10px] text-ember"
      title={status.error ?? 'LLM unavailable — using deterministic fallback'}
    >
      local fallback{status.error ? ` · ${status.error.slice(0, 40)}` : ''}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-haze/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-slate">{label}</div>
      <div className="font-mono text-sm font-semibold text-ink">{value}</div>
    </div>
  )
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
        ok ? 'bg-moss/15 text-moss' : 'bg-ember/15 text-ember'
      }`}
    >
      {children}
    </span>
  )
}

function ScoreCard({ label, value, max, suffix }: { label: string; value: number | undefined; max?: number; suffix?: string }) {
  const display = value === undefined ? '—' : typeof value === 'number' ? (max === 1 ? value.toFixed(3) : value.toFixed(2)) : String(value)
  return (
    <div className="rounded-xl border border-haze bg-white/80 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold text-ink">
        {display}
        {suffix && <span className="ml-1 text-xs text-slate">{suffix}</span>}
      </div>
    </div>
  )
}

function logLevelClass(level: string): string {
  switch (level) {
    case 'error': return 'text-ember'
    case 'warn': return 'text-ember/80'
    case 'info': return 'text-ocean'
    default: return 'text-slate'
  }
}

function logKindClass(kind: string): string {
  switch (kind) {
    case 'incident_signal': return 'bg-ember/15 text-ember'
    case 'remediation': return 'bg-moss/15 text-moss'
    case 'deploy': return 'bg-ocean/15 text-ocean'
    case 'topology': return 'bg-ink/10 text-ink'
    case 'metric': return 'bg-slate/15 text-slate'
    case 'log': return 'bg-ember/10 text-ember'
    case 'summary': return 'bg-moss/10 text-moss'
    default: return 'bg-haze text-slate'
  }
}

function Cursor() {
  return <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-ink align-middle" />
}
