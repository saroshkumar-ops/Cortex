import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

interface IncidentRow {
  prediction_id: string
  severity: string
  service: string
  reasoning: string
  created_at: number
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function Incidents() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/incidents`)
        const j = await r.json()
        setIncidents(j.action_plans || [])
      } catch { /* ignore */ }
    }
    load()
    const i = setInterval(load, 4000)
    return () => clearInterval(i)
  }, [])

  const filtered = incidents.filter(
    (inc) =>
      !filter ||
      inc.prediction_id.toLowerCase().includes(filter.toLowerCase()) ||
      inc.service.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="panel-title">Incident memory</p>
          <h2 className="mt-1 text-2xl font-display font-semibold text-ink">
            Indexed incidents ({incidents.length})
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            Every past incident the engine has registered. Each one has a
            role-token signature in the matcher, ready to be retrieved when a
            new signal arrives.
          </p>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by id or service…"
          className="rounded-xl border border-haze bg-white px-3 py-2 text-sm focus:border-ocean focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-8 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-slate" />
          <p className="mt-2 text-sm text-ink">
            {incidents.length === 0
              ? 'No incidents indexed yet.'
              : 'No incidents match your filter.'}
          </p>
          <p className="mt-1 text-xs text-slate">
            Load a sample from the{' '}
            <Link to="/" className="text-ocean underline">
              Dashboard
            </Link>
            , or run the{' '}
            <Link to="/benchmark" className="text-ocean underline">
              Benchmark
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((inc) => (
            <Link
              key={inc.prediction_id}
              to={`/incidents/${encodeURIComponent(inc.prediction_id)}`}
              className="panel block p-4 transition hover:border-ocean/40 hover:shadow-glow"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-ink">
                  {inc.prediction_id}
                </span>
                <span className="rounded-full bg-haze/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-slate">
                  {inc.severity}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-ink">{inc.service}</p>
              <p className="mt-1 line-clamp-2 text-[11px] text-slate">{inc.reasoning}</p>
              <p className="mt-2 text-[10px] uppercase tracking-widest text-slate">
                event #{inc.created_at}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
