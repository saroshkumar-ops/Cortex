import { ArrowRight, GitMerge } from 'lucide-react'
import { CausalEdge } from '../../types'
import EmptyState from '../shared/EmptyState'
import ConfidenceBar from '../shared/ConfidenceBar'

interface CausalChainProps {
  chain: CausalEdge[]
}

export default function CausalChain({ chain }: CausalChainProps) {
  if (!chain.length) {
    return (
      <EmptyState
        icon={GitMerge}
        title="No causal chain yet"
        subtitle="Cortex is still reconstructing the causal evidence."
      />
    )
  }

  return (
    <div className="flex items-center gap-4 overflow-x-auto py-2">
      {chain.map((edge, index) => (
        <div key={`${edge.cause_id}-${edge.effect_id}`} className="flex items-center gap-4">
          <div className="panel min-w-[180px] space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
              {edge.cause_id}
            </p>
            <p className="text-xs text-slate">{edge.evidence}</p>
            <ConfidenceBar value={edge.confidence} size="sm" />
          </div>
          <div className="flex flex-col items-center text-xs text-slate">
            <ArrowRight className="h-4 w-4" />
            <span>{edge.delta_minutes} min later</span>
          </div>
          {index === chain.length - 1 ? (
            <div className="panel min-w-[180px] space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                {edge.effect_id}
              </p>
              <p className="text-xs text-slate">Impact confirmed</p>
              <ConfidenceBar value={edge.confidence} size="sm" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
