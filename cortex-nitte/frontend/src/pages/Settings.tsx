import { useEffect, useState } from 'react'
import { Cpu, GitBranch, Settings as Cog, Zap } from 'lucide-react'

interface Config {
  dry_run: boolean
  confidence_threshold: number
  prediction_horizon_minutes: number
  graph_update_interval_seconds: number
  k8s_namespace: string
}

interface Health {
  status: string
  uptime_s: number
  ws_clients: number
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function Settings() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [c, h] = await Promise.all([
          fetch(`${API_BASE}/api/config`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/health`).then((r) => (r.ok ? r.json() : null)),
        ])
        setCfg(c)
        setHealth(h)
      } catch { /* ignore */ }
    }
    load()
    const i = setInterval(load, 4000)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <p className="panel-title">Settings</p>
        <h2 className="mt-1 text-2xl font-display font-semibold text-ink">Runtime configuration</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          The PCE engine is a retrospective memory engine — no live tunables.
          What you see here is the server's current config and health snapshot.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Engine config" icon={Cog}>
          {cfg ? (
            <dl className="space-y-1.5 text-sm">
              <Row k="dry_run" v={String(cfg.dry_run)} />
              <Row k="confidence_threshold" v={cfg.confidence_threshold} />
              <Row k="prediction_horizon_minutes" v={cfg.prediction_horizon_minutes} />
              <Row k="graph_update_interval_seconds" v={cfg.graph_update_interval_seconds} />
              <Row k="k8s_namespace" v={cfg.k8s_namespace} />
            </dl>
          ) : (
            <p className="text-xs text-slate">Loading…</p>
          )}
        </Section>

        <Section title="Health" icon={Zap}>
          {health ? (
            <dl className="space-y-1.5 text-sm">
              <Row k="status" v={health.status} ok={health.status === 'ok'} />
              <Row k="uptime" v={`${Math.round(health.uptime_s)}s`} />
              <Row k="ws_clients" v={health.ws_clients} />
            </dl>
          ) : (
            <p className="text-xs text-slate">Loading…</p>
          )}
        </Section>

        <Section title="LLM layer" icon={Cpu}>
          <p className="text-sm text-ink">
            The Benchmark page narrates via a local <code>Ollama</code>{' '}
            instance at <code>localhost:11434</code>. Primary model is{' '}
            <code>gemma4:e2b</code>, with <code>codegemma:2b</code> as a fallback.
          </p>
          <p className="mt-2 text-xs text-slate">
            Override via <code>OLLAMA_URL</code> and <code>OLLAMA_MODEL</code>{' '}
            env vars on the server. If Ollama is unreachable, the SSE stream
            falls back to a deterministic narrator.
          </p>
        </Section>

        <Section title="Persistence" icon={GitBranch}>
          <p className="text-sm text-ink">
            Set <code>PCE_PERSIST_PATH</code> to a JSONL path to persist every
            ingested event. The engine replays the file on startup so memory
            survives restarts.
          </p>
          <p className="mt-2 text-xs text-slate">
            Set <code>PCE_AUTOLOAD</code> to a JSONL file to preload sample
            data at startup (defaults to{' '}
            <code>bench/samples/recurring_family.jsonl</code>).
          </p>
        </Section>
      </div>
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
    <div className="panel p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-ocean" />
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Row({ k, v, ok }: { k: string; v: string | number; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-haze/40 px-3 py-1.5">
      <span className="font-mono text-[11px] text-slate">{k}</span>
      <span className={`font-mono text-xs font-semibold ${ok === false ? 'text-ember' : ok ? 'text-moss' : 'text-ink'}`}>
        {v}
      </span>
    </div>
  )
}
