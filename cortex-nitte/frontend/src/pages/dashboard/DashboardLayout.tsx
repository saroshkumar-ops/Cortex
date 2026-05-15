import React from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Server, AlertTriangle, ListChecks, Settings,
  Wifi, WifiOff, Zap, ChevronRight, Brain,
} from 'lucide-react'
import { useCortexStore } from '../../store/cortex'
import { StatusDot } from '../../components/ui/StatusDot'
import { Outlet } from 'react-router-dom'

const NAV = [
  { to: 'context',    label: 'Memory',      icon: Brain },
  { to: 'overview',   label: 'Overview',    icon: LayoutDashboard },
  { to: 'services',   label: 'Services',    icon: Server },
  { to: 'incidents',  label: 'Incidents',   icon: AlertTriangle },
  { to: 'actions',    label: 'Remediations', icon: ListChecks },
  { to: 'settings',   label: 'Settings',    icon: Settings },
]

export function DashboardLayout() {
  const { connected, graph, prediction, dryRun, wsError } = useCortexStore()
  const navigate = useNavigate()
  const location = useLocation()

  const criticalCount = graph?.nodes.filter(n => n.status === 'critical').length ?? 0

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg, #f0f4ff)' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-60 flex flex-col shrink-0 bg-white border-r border-slate-200 shadow-sm">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 leading-tight text-base tracking-tight">Cortex</p>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Memory Engine</p>
            </div>
          </div>
        </div>

        {/* Live status */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {connected
                ? <Wifi size={13} className="text-emerald-500" />
                : <WifiOff size={13} className="text-red-400" />}
              <span className={`text-xs font-semibold ${connected ? 'text-emerald-600' : 'text-red-500'}`}>
                {connected ? 'Live' : 'Disconnected'}
              </span>
            </div>
            {dryRun && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                DRY-RUN
              </span>
            )}
          </div>
          {wsError && (
            <p className="text-[10px] text-red-500 mt-1 truncate">{wsError}</p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'} />
                  <span className="flex-1">{label}</span>
                  {to === 'incidents' && criticalCount > 0 && (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-px min-w-[16px] text-center">
                      {criticalCount}
                    </span>
                  )}
                  {isActive && <ChevronRight size={12} className="text-indigo-400" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* System summary */}
        <div className="px-4 py-4 border-t border-slate-100 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System</p>
          <div className="flex gap-3">
            {(['healthy', 'degraded', 'critical'] as const).map(s => {
              const count = graph?.nodes.filter(n => n.status === s).length ?? 0
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <StatusDot status={s} size={6} pulse={s !== 'healthy'} />
                  <span className="text-xs text-slate-500 font-medium">{count}</span>
                </div>
              )
            })}
          </div>
          {prediction && prediction.confidence > 0 && (
            <div className="mt-1">
              <p className="text-[10px] text-slate-400">Last reconstruction</p>
              <p className="text-sm font-bold" style={{
                color: prediction.confidence > 0.75 ? '#10b981' : prediction.confidence > 0.5 ? '#f59e0b' : '#94a3b8'
              }}>
                {(prediction.confidence * 100).toFixed(1)}% confidence
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
