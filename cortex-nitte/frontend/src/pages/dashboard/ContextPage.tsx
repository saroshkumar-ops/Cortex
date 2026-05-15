import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Brain, Activity, GitBranch, Network, Database, FileSearch,
  Sparkles, ArrowRight, AlertCircle, RotateCw, Wrench,
} from 'lucide-react'
import { API_BASE } from '../../lib/api'
import { useCortexStore, PceContext, PceStats } from '../../store/cortex'

type IncidentRow = {
  prediction_id: string
  service: string
  reasoning: string
  created_at: number
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`${API_BASE}${path}`, init)
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return (await r.json()) as T
  } catch (err) {
    console.error(path, err)
    return null
  }
}

export function ContextPage() {
  const { pceContext, pceSignal, pceStats, setPceContext, setPceStats } = useCortexStore()

  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<'fast' | 'deep'>('fast')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoloadAttempted, setAutoloadAttempted] = useState(false)

  const refreshStats = useCallback(async () => {
    const s = await fetchJson<PceStats>('/api/pce/stats')
    if (s) setPceStats(s)
  }, [setPceStats])

  const refreshIncidents = useCallback(async () => {
    const r = await fetchJson<{ action_plans: IncidentRow[] }>('/api/incidents?limit=50')
    if (r?.action_plans) {
      setIncidents(r.action_plans)
      if (!selected && r.action_plans.length > 0) {
        setSelected(r.action_plans[0].prediction_id)
      }
    }
  }, [selected])

  useEffect(() => {
    refreshStats()
    refreshIncidents()
  }, [refreshStats, refreshIncidents])

  useEffect(() => {
    // Auto-load the recurring-family sample if the engine looks empty.
    if (autoloadAttempted || !pceStats) return
    if (pceStats.events > 0) {
      setAutoloadAttempted(true)
      return
    }
    setAutoloadAttempted(true)
    ;(async () => {
      // The server may already be ingesting via PCE_AUTOLOAD env; no client action needed.
      // We could also POST events here from a bundled fixture if desired.
    })()
  }, [autoloadAttempted, pceStats])

  const reconstruct = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    const r = await fetchJson<{ signal: Record<string, unknown>; context: PceContext }>(
      '/api/pce/reconstruct',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: selected, mode }),
      },
    )
    setLoading(false)
    if (!r) {
      setError('Reconstruction failed')
      return
    }
    setPceContext(r.context, r.signal)
    refreshStats()
  }, [selected, mode, setPceContext, refreshStats])

  const reset = useCallback(async () => {
    await fetch(`${API_BASE}/api/pce/reset`, { method: 'POST' })
    setPceContext(null, null)
    refreshStats()
    refreshIncidents()
  }, [refreshStats, refreshIncidents, setPceContext])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Brain size={22} className="text-indigo-600" />
            Operational Memory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Reconstruct investigation context from the engine's persistent memory.
          </p>
        </div>
        <button
          onClick={reset}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-slate-100 transition"
          title="Wipe engine state"
        >
          <RotateCw size={13} /> Reset memory
        </button>
      </header>

      <StatsRow stats={pceStats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <IncidentPicker
            incidents={incidents}
            selected={selected}
            onSelect={setSelected}
            mode={mode}
            setMode={setMode}
            onReconstruct={reconstruct}
            loading={loading}
            error={error}
          />
        </div>

        <div className="lg:col-span-2 space-y-4">
          {pceContext ? (
            <ContextView context={pceContext} signal={pceSignal} />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  )
}

function StatsRow({ stats }: { stats: PceStats | null }) {
  const items = [
    { icon: Database,  label: 'Events',       value: stats?.events ?? 0, color: 'text-slate-700' },
    { icon: Network,   label: 'Services',     value: stats?.services_known ?? 0, color: 'text-slate-700' },
    { icon: AlertCircle, label: 'Incidents',  value: stats?.incidents_registered ?? 0, color: 'text-indigo-700' },
    { icon: Wrench,    label: 'Resolved',     value: stats?.incidents_resolved ?? 0, color: 'text-emerald-700' },
    { icon: GitBranch, label: 'Renames',      value: stats?.rename_chain_size ?? 0, color: 'text-amber-700' },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-slate-400" />
            <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">{label}</p>
          </div>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  )
}

function IncidentPicker({
  incidents, selected, onSelect, mode, setMode, onReconstruct, loading, error,
}: {
  incidents: IncidentRow[]
  selected: string | null
  onSelect: (id: string) => void
  mode: 'fast' | 'deep'
  setMode: (m: 'fast' | 'deep') => void
  onReconstruct: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <FileSearch size={15} className="text-indigo-500" />
        <h2 className="font-semibold text-sm text-slate-700">Past Incident Signals</h2>
      </div>

      <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
        {incidents.length === 0 && (
          <p className="text-xs text-slate-400 py-4 text-center">No incidents in memory yet.</p>
        )}
        {incidents.map(inc => (
          <button
            key={inc.prediction_id}
            onClick={() => onSelect(inc.prediction_id)}
            className={`w-full text-left rounded-lg px-3 py-2 transition ${
              selected === inc.prediction_id
                ? 'bg-indigo-50 border border-indigo-200'
                : 'border border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-slate-700">{inc.prediction_id}</span>
              <span className="text-[10px] text-slate-400">{inc.service}</span>
            </div>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">{inc.reasoning}</p>
          </button>
        ))}
      </div>

      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Mode:</span>
          <div className="flex gap-1">
            {(['fast', 'deep'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                  mode === m
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onReconstruct}
          disabled={!selected || loading}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-blue-600 text-white font-semibold text-sm py-2.5 rounded-lg shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? <Activity size={14} className="animate-pulse" /> : <Sparkles size={14} />}
          {loading ? 'Reconstructing…' : 'Reconstruct Context'}
        </button>

        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white border border-dashed border-slate-300 rounded-xl py-16 text-center text-sm text-slate-400">
      <Brain size={32} className="mx-auto mb-3 text-slate-300" />
      Pick an incident and reconstruct context to see <br />
      the engine's causal chain, similar past incidents, and suggested remediation.
    </div>
  )
}

function ContextView({
  context, signal,
}: { context: PceContext; signal: Record<string, unknown> | null }) {
  return (
    <>
      <Card>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Reconstructed for</p>
            <p className="font-mono font-bold text-sm text-slate-700">
              {(signal?.incident_id as string) ?? 'ad-hoc'}
            </p>
          </div>
          <ConfidenceBadge value={context.confidence} />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{context.explain}</p>
      </Card>

      <Card title="Causal Chain" icon={GitBranch}>
        {context.causal_chain.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No causal chain reconstructed.</p>
        ) : (
          <div className="space-y-2">
            {context.causal_chain.map((edge, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">#{edge.cause_id}</span>
                <ArrowRight size={12} className="text-slate-400" />
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">#{edge.effect_id}</span>
                <span className="text-slate-400 ml-auto">confidence {(edge.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Similar Past Incidents" icon={Network}>
        {context.similar_past_incidents.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No behaviorally similar incidents in memory.</p>
        ) : (
          <div className="space-y-2">
            {context.similar_past_incidents.map(m => (
              <div key={m.past_incident_id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-semibold text-slate-700">{m.past_incident_id}</span>
                  <span className="text-xs font-semibold text-indigo-600">
                    {(m.similarity * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">{m.rationale}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Suggested Remediations" icon={Wrench}>
        {context.suggested_remediations.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No remediation suggestions.</p>
        ) : (
          <div className="space-y-2">
            {context.suggested_remediations.map((r, i) => (
              <div key={i} className="flex items-center justify-between border border-slate-100 rounded-lg p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {r.action} <span className="text-slate-400 font-normal">on {r.target}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">{r.historical_outcome}</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600">
                  {(r.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Related Events (${context.related_events.length})`} icon={Database}>
        <div className="max-h-64 overflow-y-auto -mx-1 px-1">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left py-1.5 font-semibold">id</th>
                <th className="text-left py-1.5 font-semibold">ts</th>
                <th className="text-left py-1.5 font-semibold">kind</th>
                <th className="text-left py-1.5 font-semibold">service</th>
                <th className="text-left py-1.5 font-semibold">detail</th>
              </tr>
            </thead>
            <tbody>
              {context.related_events.map((ev: any, i: number) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1.5 font-mono text-slate-400">#{ev.event_id ?? '?'}</td>
                  <td className="py-1.5 text-slate-500">{ev.ts ? new Date(ev.ts).toLocaleTimeString() : ''}</td>
                  <td className="py-1.5 text-slate-700 font-medium">{ev.kind}</td>
                  <td className="py-1.5 text-slate-500">{ev.service || ev.target || ev.trace_id || '—'}</td>
                  <td className="py-1.5 text-slate-500 truncate max-w-[200px]">
                    {ev.msg || ev.name || ev.action || ev.change || ev.trigger || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

function Card({
  title, icon: Icon, children,
}: { title?: string; icon?: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="bg-white border border-slate-200 rounded-xl shadow-sm p-4"
    >
      {title && (
        <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2 mb-3">
          {Icon && <Icon size={14} className="text-indigo-500" />}
          {title}
        </h3>
      )}
      {children}
    </motion.div>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0)
  const tone = value >= 0.75 ? 'emerald' : value >= 0.5 ? 'amber' : 'slate'
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    slate:   'bg-slate-50 text-slate-600 border-slate-200',
  }
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${colors[tone]}`}>
      {pct}% confidence
    </span>
  )
}
