import React from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Activity, ArrowRight, TrendingUp, Shield } from 'lucide-react'
import { useCortexStore } from '../../store/cortex'
import { ArcGauge } from '../../components/ui/ArcGauge'
import { StatusDot } from '../../components/ui/StatusDot'
import { Badge } from '../../components/ui/Badge'
import { Sparkline } from '../../components/ui/Sparkline'
import { formatETF, formatPct, formatMs, probToColor, statusColor } from '../../lib/format'
import { API_BASE } from '../../lib/api'

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </motion.div>
  )
}

export function OverviewPage() {
  const { graph, prediction, latestActionPlan, dryRun, connected } = useCortexStore()

  const healthy  = graph?.nodes.filter(n => n.status === 'healthy').length ?? 0
  const degraded = graph?.nodes.filter(n => n.status === 'degraded').length ?? 0
  const critical = graph?.nodes.filter(n => n.status === 'critical').length ?? 0

  async function handleInject(service: string, type: string) {
    await fetch(`${API_BASE}/api/inject/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, magnitude: 0.8 }),
    })
  }

  async function handleClear(service: string) {
    await fetch(`${API_BASE}/api/inject/${service}`, { method: 'DELETE' })
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Operations Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Live SRE intelligence — graph ticks every 2s
          {graph?.tick_id ? ` · tick #${graph.tick_id}` : ''}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Healthy" value={healthy} sub="services nominal" color="#10b981" />
        <StatCard label="Degraded" value={degraded} sub="degradation detected" color="#f59e0b" />
        <StatCard label="Critical" value={critical} sub="immediate attention" color="#ef4444" />
      </div>

      {/* Prediction panel */}
      {prediction ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-500" />
              <h2 className="font-semibold text-slate-800 text-sm">Current Prediction</h2>
            </div>
            {prediction.confidence_degraded && (
              <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                ⚠ Stale telemetry — confidence degraded
              </span>
            )}
          </div>

          <div className="flex items-center gap-8">
            {/* Gauges */}
            <div className="flex gap-6 shrink-0">
              <ArcGauge
                value={prediction.failure_prob}
                label="Failure Prob"
                colorOverride={probToColor(prediction.failure_prob)}
                size={110}
              />
              <ArcGauge
                value={prediction.confidence}
                label="Confidence"
                colorOverride="#3b5bdb"
                size={110}
              />
            </div>

            {/* Details */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-slate-400">Time to Failure</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatETF(prediction.time_to_failure_minutes)}
                    <span className="text-sm font-normal text-slate-400 ml-1">min</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Failure Probability</p>
                  <p className="text-xl font-bold" style={{ color: probToColor(prediction.failure_prob) }}>
                    {formatPct(prediction.failure_prob)}
                  </p>
                </div>
              </div>

              {/* Cascade path */}
              {prediction.cascade_path.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1.5">Predicted cascade path</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {prediction.cascade_path.map((svc, i) => (
                      <React.Fragment key={svc}>
                        <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                          {svc}
                        </span>
                        {i < prediction.cascade_path.length - 1 && (
                          <ArrowRight size={12} className="text-slate-400" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Latest action plan */}
            {latestActionPlan && (
              <div className="shrink-0 border-l border-slate-100 pl-6">
                <p className="text-xs text-slate-400 mb-2">Latest Action Plan</p>
                <Badge severity={latestActionPlan.severity} size="md" />
                {latestActionPlan.is_suppressed && (
                  <p className="text-[10px] text-amber-600 mt-1">Suppressed (warmup/shadow)</p>
                )}
                <p className="text-xs text-slate-500 mt-2 max-w-[200px]">{latestActionPlan.reasoning}</p>
              </div>
            )}
          </div>
        </motion.section>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-center gap-3 text-slate-400">
          <Activity size={18} className="animate-pulse" />
          <span className="text-sm">Waiting for first prediction…</span>
        </div>
      )}

      {/* Services grid */}
      <section>
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest mb-3">Services</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {(graph?.nodes ?? []).map((node) => (
            <motion.div
              key={node.id}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <StatusDot status={node.status} size={8} />
                  <span className="font-semibold text-slate-800 text-sm">{node.label}</span>
                </div>
                <Badge status={node.status} />
              </div>

              {/* Health bar */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Health</span>
                  <span>{(node.health * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${node.health * 100}%`,
                      background: statusColor(node.status),
                    }}
                  />
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div className="text-slate-400">P99 Latency</div>
                <div className="text-right font-medium text-slate-700">{formatMs(node.metrics.latency_p99)}</div>
                <div className="text-slate-400">Error Rate</div>
                <div className="text-right font-medium text-slate-700">{formatPct(node.metrics.error_rate)}</div>
                <div className="text-slate-400">CPU</div>
                <div className="text-right font-medium text-slate-700">{node.metrics.cpu_percent.toFixed(1)}%</div>
              </div>

              {/* Sparkline */}
              {node.history.latency_p99.length > 2 && (
                <div className="mt-3">
                  <Sparkline
                    data={node.history.latency_p99}
                    color={statusColor(node.status)}
                    height={32}
                  />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Topology edges */}
      {(graph?.edges ?? []).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest mb-3">Dependency Edges</h2>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Call Volume</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Error Rate</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Latency</th>
                </tr>
              </thead>
              <tbody>
                {graph!.edges.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-indigo-600">{e.source}</td>
                    <td className="px-5 py-3 text-slate-600">{e.target}</td>
                    <td className="px-5 py-3 text-slate-600">{e.metrics.call_volume.toFixed(1)} req/s</td>
                    <td className="px-5 py-3">
                      <span className={e.metrics.error_rate > 0.1 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                        {formatPct(e.metrics.error_rate)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatMs(e.metrics.latency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
