import { Github, FileText, Slack } from 'lucide-react'
import clsx from 'clsx'
import { Action } from '../../types'

interface ActionLogProps {
  actions: Action[]
}

const statusStyles: Record<Action['status'], string> = {
  pending: 'bg-yellow-500/15 text-yellow-700',
  executed: 'bg-green-500/15 text-green-600',
  dry_run: 'bg-amber-500/15 text-amber-700',
  failed: 'bg-red-500/15 text-red-600',
}

const outcomeStyles: Record<Action['outcome'], string> = {
  resolved: 'bg-green-500/15 text-green-600',
  failed: 'bg-red-500/15 text-red-600',
  pending: 'bg-yellow-500/15 text-yellow-700',
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  return date.toLocaleString()
}

export default function ActionLog({ actions }: ActionLogProps) {
  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between">
        <p className="panel-title">Action log</p>
        <span className="text-xs text-slate">{actions.length} actions</span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="py-2 pr-4">Action</th>
              <th className="py-2 pr-4">Service</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Outcome</th>
              <th className="py-2 pr-4">Triggered</th>
              <th className="py-2 pr-4">Links</th>
            </tr>
          </thead>
          <tbody className="text-slate">
            {actions.map((action) => (
              <tr key={action.id} className="border-t border-haze/70">
                <td className="py-3 pr-4 font-semibold text-ink">
                  {action.action_type}
                </td>
                <td className="py-3 pr-4">{action.service}</td>
                <td className="py-3 pr-4">
                  <span
                    className={clsx(
                      'rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide',
                      statusStyles[action.status]
                    )}
                  >
                    {action.status}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={clsx(
                      'rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide',
                      outcomeStyles[action.outcome]
                    )}
                  >
                    {action.outcome}
                  </span>
                </td>
                <td className="py-3 pr-4 text-xs">
                  {formatTimestamp(action.triggered_at)}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    {action.slack_sent ? (
                      <Slack className="h-4 w-4 text-slate" />
                    ) : null}
                    {action.github_pr_url ? (
                      <a
                        href={action.github_pr_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate hover:text-ink"
                      >
                        <Github className="h-4 w-4" />
                      </a>
                    ) : null}
                    {action.notion_page_url ? (
                      <a
                        href={action.notion_page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate hover:text-ink"
                      >
                        <FileText className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
