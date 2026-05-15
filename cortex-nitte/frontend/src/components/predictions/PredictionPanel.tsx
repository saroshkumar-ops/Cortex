import { Activity } from 'lucide-react'
import useCortexStore from '../../store/cortex'
import EmptyState from '../shared/EmptyState'
import SeverityBadge from '../shared/SeverityBadge'
import ConfidenceBar from '../shared/ConfidenceBar'

interface PredictionPanelProps {}

export default function PredictionPanel({}: PredictionPanelProps) {
  const prediction = useCortexStore((state) => state.prediction)

  if (!prediction) {
    return (
      <div className="panel h-full p-6">
        <EmptyState
          icon={Activity}
          title="No active prediction"
          subtitle="Waiting for Cortex to emit the next failure forecast."
        />
      </div>
    )
  }

  const failurePercent = Math.round(prediction.failure_prob * 100)

  return (
    <div className="panel h-full p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="panel-title">Failure probability</p>
          <div className="mt-2 flex items-end gap-3">
            <p className="text-5xl font-display font-semibold text-ink">
              {failurePercent}%
            </p>
            <SeverityBadge severity={prediction.severity} />
          </div>
          <p className="mt-2 text-xs text-slate">
            Time to failure: {prediction.time_to_failure_minutes} min
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
          Confidence
        </p>
        <ConfidenceBar value={prediction.confidence} />
      </div>

      {prediction.cascade_path.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            Cascade path
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {prediction.cascade_path.map((node) => (
              <span key={node} className="chip">
                {node}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
