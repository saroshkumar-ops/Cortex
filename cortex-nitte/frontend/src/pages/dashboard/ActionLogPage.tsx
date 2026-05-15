import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, ListChecks, CheckCircle, XCircle, Clock } from 'lucide-react'
import { useCortexStore, ActionRecord } from '../../store/cortex'
import { Badge } from '../../components/ui/Badge'
import { formatTime } from '../../lib/format'
import { API_BASE } from '../../lib/api'

function ActionTypePill({ type }: { type: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    scale_up:        { label: 'Scale Up', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    circuit_breaker: { label: 'Circuit Break', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
    alert:           { label: 'Alert', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const { label, cls } = cfg[type] ?? { label: type, cls: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex text-[10px] font-semibold border rounded-full px-2 py-0.5 uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

export function ActionLogPage() {
  const { actionLog, actionPlans, setActionLog } = useCortexStore()
  const [loading, setLoading] = useState(false)
  const plannedRecords = actionPlans.flatMap((plan) =>
    plan.actions.map((action, i) => ({
      prediction_id: `${plan.prediction_id}-${i}`,
      severity: plan.severity,
      service: action.service,
      action_type: action.type,
      action,
      result: plan.is_suppressed ? `Suppressed: ${plan.reasoning}` : `Planned: ${plan.reasoning}`,
      dry_run: true,
      duration_ms: 0,
      timestamp: plan.created_at,
    }))
  )
  const rows = actionLog.length > 0 ? actionLog : plannedRecords

  async function fetchLog() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/actions?limit=100`)
      const data = await res.json()
      setActionLog(data.actions as ActionRecord[])
    } catch (e) {
      console.error('Failed to fetch action log', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLog() }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Action Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Raw execution records from <code className="text-indigo-600 text-xs bg-indigo-50 px-1 rounded">GET /api/actions</code>
          </p>
        </div>
        <button
          onClick={fetchLog}
          disabled={loading}
          className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-xl transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
          <ListChecks size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No actions logged yet</p>
          <p className="text-sm mt-1">Actions appear after the policy engine fires a plan</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Time', 'Service', 'Severity', 'Action Type', 'Result', 'Mode', 'Duration'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((rec, i) => (
                <motion.tr
                  key={`${rec.prediction_id}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className="text-slate-300" />
                      {formatTime(rec.timestamp)}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-indigo-600">{rec.service}</td>
                  <td className="px-4 py-3">
                    <Badge severity={rec.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <ActionTypePill type={rec.action_type} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs max-w-[260px]">
                    <span className="truncate block" title={rec.result}>{rec.result}</span>
                  </td>
                  <td className="px-4 py-3">
                    {rec.dry_run ? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                        <XCircle size={12} /> Dry-run
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                        <CheckCircle size={12} /> Live
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {rec.duration_ms.toFixed(1)}ms
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
