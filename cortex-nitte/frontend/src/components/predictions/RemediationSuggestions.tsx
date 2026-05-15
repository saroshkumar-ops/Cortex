import { ShieldCheck } from 'lucide-react'
import { SuggestedRemediation } from '../../types'
import ConfidenceBar from '../shared/ConfidenceBar'
import EmptyState from '../shared/EmptyState'

interface RemediationSuggestionsProps {
  suggestions: SuggestedRemediation[]
}

export default function RemediationSuggestions({
  suggestions,
}: RemediationSuggestionsProps) {
  if (!suggestions.length) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No remediations suggested"
        subtitle="Cortex will propose actions when enough evidence is available."
      />
    )
  }

  return (
    <div className="space-y-4">
      {suggestions.map((suggestion) => (
        <div key={`${suggestion.action}-${suggestion.target}`} className="panel p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">
                {suggestion.action}
              </p>
              <p className="text-xs text-slate">Target: {suggestion.target}</p>
              <p className="mt-2 text-xs text-slate">
                Used {suggestion.times_used} times, {suggestion.times_succeeded}{' '}
                successful
              </p>
            </div>
            <div className="min-w-[160px]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                Confidence
              </p>
              <ConfidenceBar value={suggestion.confidence} />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate">
            Historical outcome: {suggestion.historical_outcome}
          </p>
        </div>
      ))}
    </div>
  )
}
