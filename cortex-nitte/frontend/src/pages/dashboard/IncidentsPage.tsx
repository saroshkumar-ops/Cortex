import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, AlertTriangle, ShieldAlert, Clock, BrainCircuit, Zap } from 'lucide-react'
import { useCortexStore } from '../../store/cortex'
import { Badge } from '../../components/ui/Badge'
import { ArcGauge } from '../../components/ui/ArcGauge'
import { formatRelative, formatETF, formatPct, probToColor } from '../../lib/format'

const ACTION_ICONS: Record<string, React.ReactNode> = {
  scale_up:        <Zap size={12} />,
  circuit_breaker: <ShieldAlert size={12} />,
  alert:           <AlertTriangle size={12} />,
}

export function IncidentsPage() {
  const { actionPlans, dryRun } = useCortexStore()

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Incidents</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {actionPlans.length} action plan{actionPlans.length !== 1 ? 's' : ''} recorded this session
          </p>
        </div>
        {dryRun && (
          <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
            DRY-RUN mode — no real actions executed
          </span>
        )}
      </div>

      {actionPlans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
          <AlertTriangle size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No incidents yet</p>
          <p className="text-sm mt-1">Action plans will appear here when the model detects a risk ≥ 30%</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {actionPlans.map((plan, i) => (
              <motion.div
                key={plan.prediction_id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-white rounded-2xl border shadow-sm p-5 ${
                  plan.severity === 'critical'
                    ? 'border-red-200 glow-critical'
                    : plan.severity === 'high'
                    ? 'border-amber-200'
                    : 'border-slate-200'
                }`}
              >
                {/* Plan header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Badge severity={plan.severity} size="md" />
                    <div>
                      <p className="font-bold text-slate-800 text-base">{plan.service}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{plan.prediction_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {plan.is_suppressed && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        Suppressed
                      </span>
                    )}
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={11} />
                      {formatRelative(plan.created_at)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-[auto_1fr] gap-6">
                  {/* Gauges */}
                  <div className="flex gap-4">
                    <ArcGauge
                      value={plan.failure_prob}
                      label="Fail Prob"
                      colorOverride={probToColor(plan.failure_prob)}
                      size={88}
                    />
                    <ArcGauge
                      value={plan.confidence}
                      label="Confidence"
                      colorOverride="#3b5bdb"
                      size={88}
                    />
                  </div>

                  {/* Right col */}
                  <div className="space-y-3">
                    {/* Stats row */}
                    <div className="flex gap-6 text-sm">
                      <div>
                        <p className="text-xs text-slate-400">Time to Failure</p>
                        <p className="font-bold text-slate-800">{formatETF(plan.time_to_failure_minutes)} min</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Tick #</p>
                        <p className="font-bold text-slate-800">{plan.tick_id}</p>
                      </div>
                    </div>

                    {/* Cascade path */}
                    {plan.cascade_path.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Cascade Path</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {plan.cascade_path.map((svc, idx) => (
                            <React.Fragment key={svc}>
                              <span className="text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                                {svc}
                              </span>
                              {idx < plan.cascade_path.length - 1 && (
                                <ArrowRight size={10} className="text-slate-400" />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reasoning */}
                    <div className="flex items-start gap-1.5">
                      <BrainCircuit size={12} className="text-indigo-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-500">{plan.reasoning}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {plan.actions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Planned Actions</p>
                    <div className="flex flex-wrap gap-2">
                      {plan.actions.map((action, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                        >
                          <span className="text-slate-500">{ACTION_ICONS[action.type] ?? <Zap size={12} />}</span>
                          <span className="font-medium text-slate-700">
                            {action.type === 'scale_up'
                              ? `Scale ${action.service} → ${action.target_replicas} replicas`
                              : action.type === 'circuit_breaker'
                              ? `Circuit-breaker ${action.mode} on ${action.service}`
                              : action.message ?? action.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
