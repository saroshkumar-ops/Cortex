import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'

interface ActionRow {
  prediction_id: string
  service: string
  action_type: string
  result: string
  timestamp: number
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function Actions() {
  const [actions, setActions] = useState<ActionRow[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/actions`)
        const j = await r.json()
        setActions(j.actions || [])
      } catch { /* ignore */ }
    }
    load()
    const i = setInterval(load, 4000)
    return () => clearInterval(i)
  }, [])

  const ok = (r: string) => ['resolved', 'success', 'fixed', 'ok'].includes((r || '').toLowerCase())

  return (
    <div className="space-y-6">
      <div>
        <p className="panel-title">Remediation log</p>
        <h2 className="mt-1 text-2xl font-display font-semibold text-ink">
          Historical actions ({actions.length})
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          Every remediation event in the engine's append-only log. Each row is
          one past fix the engine can reuse when a similar incident fires.
        </p>
      </div>

      {actions.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-slate">
          <Activity className="mx-auto h-6 w-6 text-slate" />
          <p className="mt-2 text-ink">No remediations seen yet.</p>
          <p className="mt-1 text-xs">Load a sample from the Dashboard.</p>
        </div>
      ) : (
        <div className="panel p-4">
          <table className="min-w-full font-mono text-[11px]">
            <thead className="text-[10px] uppercase tracking-widest text-slate">
              <tr>
                <th className="px-3 py-2 text-left">incident</th>
                <th className="px-3 py-2 text-left">service</th>
                <th className="px-3 py-2 text-left">action</th>
                <th className="px-3 py-2 text-left">outcome</th>
                <th className="px-3 py-2 text-right">event #</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a, i) => (
                <tr key={i} className="border-t border-haze/60 hover:bg-haze/30">
                  <td className="px-3 py-2 font-semibold text-ink">{a.prediction_id}</td>
                  <td className="px-3 py-2">{a.service}</td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-moss/15 px-1.5 py-0.5 text-moss">{a.action_type}</code>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 ${ok(a.result) ? 'bg-moss/15 text-moss' : 'bg-haze/60 text-slate'}`}>
                      {a.result || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate">{Math.round(a.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
