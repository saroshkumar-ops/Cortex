import { Clock, Zap } from 'lucide-react'
import { useHealth } from '../../hooks/useHealth'
import useCortexStore from '../../store/cortex'
import StatusDot from '../shared/StatusDot'

interface TopBarProps {}

export default function TopBar({}: TopBarProps) {
  const { data: health } = useHealth()
  const graph = useCortexStore((state) => state.graph)
  const dryRun = useCortexStore((state) => state.dryRun)

  const status = health?.status ?? 'down'
  const warmupRemaining = health?.warmup_remaining ?? 0

  return (
    <header className="flex items-center justify-between border-b border-haze bg-white/80 px-6 py-4 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <StatusDot status={status === 'ok' ? 'healthy' : status} />
          <div>
            <p className="text-xs text-slate">System status</p>
            <p className="text-sm font-semibold text-ink">{status}</p>
          </div>
        </div>
        <div className="h-8 w-px bg-haze" />
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-slate" />
          <div>
            <p className="text-xs text-slate">Tick</p>
            <p className="text-sm font-semibold text-ink">
              {graph?.tick_id ?? '---'}
            </p>
          </div>
        </div>
        {warmupRemaining > 0 ? (
          <span className="chip border-yellow-500/40 bg-yellow-500/15 text-yellow-700">
            Warmup {warmupRemaining}s
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {dryRun ? (
          <span className="chip border-ember/40 bg-ember/20 text-ember">
            <Zap className="h-3.5 w-3.5" />
            Dry run active
          </span>
        ) : null}
      </div>
    </header>
  )
}
