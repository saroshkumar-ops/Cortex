import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Send, Timer } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function Demo() {
  const [signal, setSignal] = useState(
    JSON.stringify(
      {
        kind: 'incident_signal',
        ts: new Date().toISOString(),
        service: 'checkout-api',
        trigger: 'alert:checkout-api/error-rate>5%',
        incident_id: 'INC-DEMO-1',
      },
      null,
      2,
    ),
  )
  const [mode, setMode] = useState<'fast' | 'deep'>('fast')
  const [out, setOut] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    setOut('')
    try {
      const body = JSON.parse(signal)
      // Ingest the signal first so it lives in the engine, then reconstruct.
      await fetch(`${API_BASE}/api/pce/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [body] }),
      })
      const r = await fetch(`${API_BASE}/api/pce/reconstruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: body, mode }),
      })
      const j = await r.json()
      setOut(JSON.stringify(j, null, 2))
    } catch (e) {
      setOut(`Error: ${e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="panel-title">Demo / Playground</p>
        <h2 className="mt-1 text-2xl font-display font-semibold text-ink">
          Send a signal, reconstruct context
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          Hand-craft an <code>incident_signal</code> event, post it to the
          engine, and inspect the reconstructed <code>Context</code>. The
          engine works against whatever's currently loaded — load a sample
          first from the <Link to="/" className="text-ocean underline">Dashboard</Link>.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="panel p-5">
          <div className="mb-3 flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-ocean" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">Signal</h3>
            <div className="ml-auto flex gap-1">
              {(['fast', 'deep'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest transition ${
                    mode === m ? 'bg-ink text-white' : 'bg-haze/60 text-slate'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={signal}
            onChange={(e) => setSignal(e.target.value)}
            spellCheck={false}
            className="h-72 w-full resize-y rounded-xl border border-haze bg-white p-3 font-mono text-[11px] focus:border-ocean focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white shadow-glow hover:bg-ink/90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> {busy ? 'Reconstructing…' : 'Ingest + reconstruct'}
          </button>
        </div>

        <div className="panel p-5">
          <div className="mb-3 flex items-center gap-2">
            <Timer className="h-4 w-4 text-ocean" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">Response</h3>
          </div>
          {out ? (
            <pre className="max-h-[28rem] overflow-auto rounded-lg bg-haze/40 p-3 font-mono text-[11px] text-ink">
              {out}
            </pre>
          ) : (
            <p className="text-xs text-slate">No response yet. Send a signal.</p>
          )}
        </div>
      </div>

      <div className="panel p-4 text-xs text-slate">
        Tip: for the polished live trace with thinking + scoring + reasoning,
        use the <Link to="/benchmark" className="text-ocean underline">Benchmark</Link> page.
      </div>
    </div>
  )
}
