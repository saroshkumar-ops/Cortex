import { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import ActionLog from '../components/actions/ActionLog'
import EmptyState from '../components/shared/EmptyState'
import { useActions } from '../hooks/useActions'

interface ActionsProps {}

const ranges = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
  { label: 'All', hours: null },
] as const

export default function Actions({}: ActionsProps) {
  const { data, isLoading } = useActions()
  const [range, setRange] = useState(ranges[0])

  const actions = useMemo(() => {
    const list = data?.actions ?? []
    if (!range.hours) {
      return list
    }
    const cutoff = Date.now() - range.hours * 60 * 60 * 1000
    return list.filter((action) => new Date(action.triggered_at).getTime() >= cutoff)
  }, [data, range])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="panel-title">Actions</p>
          <p className="text-xs text-slate">
            Remediations triggered by Cortex or dry-run recommendations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ranges.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setRange(item)}
              className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide ${
                range.label === item.label
                  ? 'bg-ink text-white'
                  : 'border border-haze text-slate'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <EmptyState
          icon={Activity}
          title="Loading action log"
          subtitle="Fetching remediation history from Cortex."
        />
      ) : actions.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No actions logged"
          subtitle="No remediations found in the selected range."
        />
      ) : (
        <ActionLog actions={actions} />
      )}
    </div>
  )
}
