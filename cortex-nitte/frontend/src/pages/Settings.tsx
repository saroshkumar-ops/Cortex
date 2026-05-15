import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, Cpu, GitBranch, Zap } from 'lucide-react'
import { fetchNotificationsStatus } from '../api/notifications'
import EmptyState from '../components/shared/EmptyState'
import { useConfig } from '../hooks/useConfig'
import { Config } from '../types'

interface SettingsProps {}

export default function Settings({}: SettingsProps) {
  const { data: config, isLoading, updateConfig } = useConfig()
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotificationsStatus,
  })

  const [formState, setFormState] = useState<Config | null>(null)

  useEffect(() => {
    if (config) {
      setFormState(config)
    }
  }, [config])

  if (isLoading || !formState) {
    return (
      <EmptyState
        icon={Zap}
        title="Loading settings"
        subtitle="Pulling config values from Cortex."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="panel-title">Settings</p>
        <p className="text-xs text-slate">
          Adjust prediction behavior and notification integrations.
        </p>
      </div>

      <div className="panel p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl border border-haze bg-white/70 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Dry run</p>
              <p className="text-xs text-slate">
                Simulate remediations without executing.
              </p>
            </div>
            <input
              type="checkbox"
              checked={formState.dry_run}
              onChange={(event) =>
                setFormState({ ...formState, dry_run: event.target.checked })
              }
              className="h-4 w-4"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-haze bg-white/70 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Shadow mode</p>
              <p className="text-xs text-slate">
                Observe prediction without alerting.
              </p>
            </div>
            <input
              type="checkbox"
              checked={formState.shadow_mode}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  shadow_mode: event.target.checked,
                })
              }
              className="h-4 w-4"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-semibold text-slate">
            Confidence threshold
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={formState.confidence_threshold}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  confidence_threshold: Number(event.target.value),
                })
              }
              className="rounded-lg border border-haze bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold text-slate">
            Prediction horizon (minutes)
            <input
              type="number"
              min={1}
              value={formState.prediction_horizon_minutes}
              onChange={(event) =>
                setFormState({
                  ...formState,
                  prediction_horizon_minutes: Number(event.target.value),
                })
              }
              className="rounded-lg border border-haze bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => updateConfig.mutate(formState)}
          className="rounded-full bg-ink px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
        >
          Save changes
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-slate">
            <Bell className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.2em]">Slack</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">
            {notifications?.slack.connected ? 'Connected' : 'Not connected'}
          </p>
          <p className="text-xs text-slate">
            {notifications?.slack.channel ?? 'No channel configured'}
          </p>
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-slate">
            <GitBranch className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.2em]">GitHub</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">
            {notifications?.github.connected ? 'Connected' : 'Not connected'}
          </p>
          <p className="text-xs text-slate">
            {notifications?.github.repo ?? 'No repo configured'}
          </p>
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2 text-slate">
            <Cpu className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.2em]">Notion</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">
            {notifications?.notion.connected ? 'Connected' : 'Not connected'}
          </p>
          <p className="text-xs text-slate">
            {notifications?.notion.database_id ?? 'No database configured'}
          </p>
        </div>
      </div>
    </div>
  )
}
