import React from 'react'
import { motion } from 'framer-motion'
import { useCortexStore } from '../../store/cortex'
import { ArcGauge } from '../../components/ui/ArcGauge'
import { StatusDot } from '../../components/ui/StatusDot'
import { Badge } from '../../components/ui/Badge'
import { Sparkline } from '../../components/ui/Sparkline'
import { formatMs, formatPct, statusColor } from '../../lib/format'
import { Server } from 'lucide-react'

const METRIC_ROWS = [
  { key: 'latency_p50' as const, label: 'Latency P50', fmt: (v: number) => formatMs(v) },
  { key: 'latency_p99' as const, label: 'Latency P99', fmt: (v: number) => formatMs(v) },
  { key: 'error_rate' as const,  label: 'Error Rate',  fmt: (v: number) => formatPct(v) },
  { key: 'request_rate' as const, label: 'Request Rate', fmt: (v: number) => `${v.toFixed(1)} r/s` },
  { key: 'cpu_percent' as const, label: 'CPU',         fmt: (v: number) => `${v.toFixed(1)}%` },
  { key: 'memory_percent' as const, label: 'Memory',   fmt: (v: number) => `${v.toFixed(1)}%` },
]

export function ServicesPage() {
  const { graph } = useCortexStore()
  const nodes = graph?.nodes ?? []

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Services</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {nodes.length} services · full metrics and history
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {nodes.map((node, i) => (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
          >
            {/* Service header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: statusColor(node.status) + '22' }}
                >
                  <Server size={16} style={{ color: statusColor(node.status) }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <StatusDot status={node.status} size={7} />
                    <span className="font-bold text-slate-800">{node.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">{node.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge status={node.status} size="md" />
                <ArcGauge value={node.health} label="Health" size={64} />
              </div>
            </div>

            {/* Metrics table */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {METRIC_ROWS.map(({ key, label, fmt }) => (
                <div key={key} className="bg-slate-50 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-bold text-slate-700 mt-0.5">
                    {fmt(node.metrics[key])}
                  </p>
                  {/* Mini progress bar for %-based metrics */}
                  {(key === 'cpu_percent' || key === 'memory_percent') && (
                    <div className="h-1 rounded-full bg-slate-200 mt-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, node.metrics[key])}%`,
                          background: node.metrics[key] > 80 ? '#ef4444' : node.metrics[key] > 60 ? '#f59e0b' : '#10b981',
                        }}
                      />
                    </div>
                  )}
                  {key === 'error_rate' && (
                    <div className="h-1 rounded-full bg-slate-200 mt-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, node.metrics[key] * 100)}%`,
                          background: node.metrics[key] > 0.1 ? '#ef4444' : node.metrics[key] > 0.02 ? '#f59e0b' : '#10b981',
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Sparklines */}
            <div className="grid grid-cols-2 gap-3">
              {node.history.latency_p99.length > 2 && (
                <div className="bg-slate-50 rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-400 mb-1 font-medium">Latency P99</p>
                  <Sparkline
                    data={node.history.latency_p99}
                    color={statusColor(node.status)}
                    height={40}
                    showTooltip
                  />
                </div>
              )}
              {node.history.error_rate.length > 2 && (
                <div className="bg-slate-50 rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-400 mb-1 font-medium">Error Rate</p>
                  <Sparkline
                    data={node.history.error_rate.map(v => v * 100)}
                    color={node.metrics.error_rate > 0.1 ? '#ef4444' : '#3b5bdb'}
                    height={40}
                    showTooltip
                  />
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {nodes.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <Server size={32} className="mx-auto mb-3 opacity-40" />
          <p>Waiting for service data…</p>
        </div>
      )}
    </div>
  )
}
