import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Database,
  Gauge,
  Network,
  PlayCircle,
  RefreshCcw,
  ScrollText,
  Timer,
} from 'lucide-react'

interface Stats {
  events: number
  services_known: number
  incidents_registered: number
  incidents_resolved: number
  rename_chain_size: number
  log_templates: number
  log_observations: number
  log_compression_ratio: number
  uptime_s: number
}

interface Health {
  status: string
  is_stale: boolean
  ws_clients: number
  dry_run: boolean
  uptime_s: number
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState<string | null>(null)

  const fetchAll = async () => {
    try {
      const [s, h] = await Promise.all([
        fetch(`${API_BASE}/api/pce/stats`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/health`).then((r) => (r.ok ? r.json() : null)),
      ])
      setStats(s)
      setHealth(h)
    } catch {
      /* surface via empty UI */
    }
  }

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 4000)
    return () => clearInterval(t)
  }, [])

  const loadSample = async (sample: string) => {
    setLoading(true)
    setLoadMsg(null)
    try {
      const r = await fetch(`${API_BASE}/api/pce/load_sample`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample }),
      })
      const j = await r.json()
      setLoadMsg(`Ingested ${j.ingested} events (total ${j.total_events})`)
      fetchAll()
    } catch {
      setLoadMsg('Load failed')
    } finally {
      setLoading(false)
    }
  }

  const reset = async () => {
    await fetch(`${API_BASE}/api/pce/reset`, { method: 'POST' })
    setLoadMsg('Engine reset')
    fetchAll()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="panel-title">Engine overview</p>
          <h2 className="mt-1 text-2xl font-display font-semibold text-ink">
            Persistent Context Engine
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            Operational memory engine for incident response. Live view of what
            the shared <code>Engine</code> instance has ingested.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadSample('recurring_family')}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white shadow-glow hover:bg-ink/90 disabled:opacity-60"
          >
            <PlayCircle className="h-4 w-4" /> Load recurring-family sample
          </button>
          <button
            onClick={() => loadSample('worked_example')}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-haze bg-white px-3 py-2 text-xs font-semibold text-ink hover:bg-haze/40 disabled:opacity-60"
          >
            <PlayCircle className="h-4 w-4" /> Worked example
          </button>
          <button
            onClick={reset}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-haze bg-white px-3 py-2 text-xs font-semibold text-slate hover:bg-haze/40 disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" /> Reset
          </button>
        </div>
      </div>

      {loadMsg && (
        <p className="text-xs text-slate">{loadMsg}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ScrollText}
          label="Events ingested"
          value={stats?.events ?? 0}
          sub={stats ? `${stats.log_observations} log obs (${stats.log_compression_ratio}× compressed)` : '—'}
        />
        <StatCard
          icon={AlertTriangle}
          label="Incidents in memory"
          value={stats?.incidents_registered ?? 0}
          sub={stats ? `${stats.incidents_resolved} resolved` : '—'}
        />
        <StatCard
          icon={Network}
          label="Services known"
          value={stats?.services_known ?? 0}
          sub={stats ? `${stats.rename_chain_size} renames tracked` : '—'}
        />
        <StatCard
          icon={Database}
          label="Log templates"
          value={stats?.log_templates ?? 0}
          sub={stats ? 'Drain-style clustering' : '—'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-ocean" />
            <p className="panel-title">Health</p>
          </div>
          {health ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Row label="Status" value={health.status} ok={health.status === 'ok'} />
              <Row label="Stale" value={String(health.is_stale)} ok={!health.is_stale} />
              <Row label="WS clients" value={health.ws_clients} />
              <Row label="Dry run" value={String(health.dry_run)} />
              <Row label="Uptime" value={`${Math.round(health.uptime_s)}s`} />
              <Row label="Events" value={stats?.events ?? 0} />
            </dl>
          ) : (
            <p className="mt-3 text-xs text-slate">Loading…</p>
          )}
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-ocean" />
            <p className="panel-title">Where to go</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <NavLine to="/benchmark" icon={Timer} title="Benchmark" sub="Run a live end-to-end scoring trace" />
            <NavLine to="/incidents" icon={AlertTriangle} title="Incidents" sub="Past incidents the engine has indexed" />
            <NavLine to="/memory" icon={Database} title="Memory" sub="Log templates, renames, identity graph" />
            <NavLine to="/actions" icon={Activity} title="Actions" sub="Historical remediation events" />
          </ul>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  sub: string
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-ocean" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate">{label}</p>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-slate">{sub}</p>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-haze/40 px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-widest text-slate">{label}</span>
      <span className={`font-mono text-xs font-semibold ${ok === false ? 'text-ember' : ok ? 'text-moss' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}

function NavLine({
  to,
  icon: Icon,
  title,
  sub,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  sub: string
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 rounded-lg border border-haze bg-white/70 px-3 py-2 transition hover:border-ocean/40 hover:bg-ocean/5"
      >
        <Icon className="h-4 w-4 text-ocean" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="text-[11px] text-slate">{sub}</div>
        </div>
        <span className="text-slate">→</span>
      </Link>
    </li>
  )
}
