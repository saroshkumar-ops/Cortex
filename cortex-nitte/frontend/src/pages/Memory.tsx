import { useEffect, useState } from 'react'
import { Database, GitBranch, ScrollText } from 'lucide-react'

interface Stats {
  events: number
  services_known: number
  incidents_registered: number
  incidents_resolved: number
  rename_chain_size: number
  log_templates: number
  log_observations: number
  log_compression_ratio: number
}

interface Template {
  id: number
  pattern: string
  frequency: number
  first_seen: number
  last_seen: number
}

interface TemplatesResp {
  total: number
  shown: number
  templates: Template[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function Memory() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [templates, setTemplates] = useState<TemplatesResp | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [s, t] = await Promise.all([
          fetch(`${API_BASE}/api/pce/stats`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/api/pce/templates?limit=50`).then((r) => (r.ok ? r.json() : null)),
        ])
        setStats(s)
        setTemplates(t)
      } catch { /* ignore */ }
    }
    load()
    const i = setInterval(load, 4000)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <p className="panel-title">Operational memory</p>
        <h2 className="mt-1 text-2xl font-display font-semibold text-ink">Memory layer</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          What the engine remembers. Log templates compress repetitive lines, the
          identity registry tracks service renames, and behavioral fingerprints
          live in the incident memory.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Events ingested" value={stats?.events ?? 0} />
        <Stat label="Incidents indexed" value={stats?.incidents_registered ?? 0} sub={`${stats?.incidents_resolved ?? 0} resolved`} />
        <Stat label="Services known" value={stats?.services_known ?? 0} sub={`${stats?.rename_chain_size ?? 0} renames tracked`} />
        <Stat label="Log compression" value={stats ? `${stats.log_compression_ratio}×` : '—'} sub={`${stats?.log_observations ?? 0} obs → ${stats?.log_templates ?? 0} templates`} />
      </div>

      <div className="panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-ocean" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">
            Log templates ({templates?.total ?? 0})
          </h3>
        </div>
        {!templates || templates.templates.length === 0 ? (
          <p className="text-xs text-slate">
            No templates yet. Visit the Dashboard and load a sample, or run the Benchmark.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full font-mono text-[11px]">
              <thead className="text-[10px] uppercase tracking-widest text-slate">
                <tr>
                  <th className="px-2 py-1 text-left">id</th>
                  <th className="px-2 py-1 text-right">freq</th>
                  <th className="px-2 py-1 text-left">pattern</th>
                </tr>
              </thead>
              <tbody>
                {templates.templates.map((t) => (
                  <tr key={t.id} className="border-t border-haze/60">
                    <td className="px-2 py-1.5 text-slate">#{t.id}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-ink">{t.frequency}</td>
                    <td className="px-2 py-1.5 break-all">{t.pattern}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-ocean" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">How the engine remembers</h3>
        </div>
        <div className="grid gap-4 text-sm text-ink md:grid-cols-3">
          <Cell title="Log templating">
            Each log message is collapsed to a structural template (Drain-style).
            Lines like <code>timeout calling X (req_id=A)</code> and{' '}
            <code>...(req_id=B)</code> become the same template id — so the
            behavioral matcher sees structure, not noise.
          </Cell>
          <Cell title="Identity & renames">
            Every service name resolves to a stable integer id at ingest. A
            rename mid-stream re-files history under the new canonical name —
            it doesn't fragment the record.
          </Cell>
          <Cell title="Behavioral fingerprint">
            On incident close, the 40-min window is reduced to a role-token
            multiset (self/peer roles, time buckets, value tiers). 128-perm
            MinHash + LSH banding makes retrieval sublinear in memory size.
          </Cell>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-ocean" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate">{label}</p>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-slate">{sub}</p>}
    </div>
  )
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-haze bg-white/70 p-3">
      <p className="text-[10px] uppercase tracking-widest text-ocean">{title}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed">{children}</p>
    </div>
  )
}
