import { NavLink } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Database,
  FlaskConical,
  LayoutDashboard,
  Settings,
} from 'lucide-react'
import clsx from 'clsx'
import useCortexStore from '../../store/cortex'

interface SidebarProps {}

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/memory', label: 'Memory', icon: Database },
  { to: '/actions', label: 'Actions', icon: Activity },
  { to: '/demo', label: 'Demo', icon: FlaskConical },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({}: SidebarProps) {
  const activeIncidents = useCortexStore((state) => state.activeIncidents)
  const openCount = activeIncidents.filter((incident) =>
    ['open', 'investigating'].includes(incident.status)
  ).length

  return (
    <aside className="flex h-screen w-64 flex-col gap-6 border-r border-haze bg-white/70 px-6 py-6 backdrop-blur">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate">
          Cortex
        </p>
        <h1 className="text-2xl font-display font-semibold text-ink">
          SRE Control
        </h1>
        <p className="text-xs text-slate">
          Predict failures, reconstruct context, and fire remediations.
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-ink text-white shadow-glow'
                    : 'text-slate hover:bg-haze/70'
                )
              }
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.label === 'Incidents' && openCount > 0 ? (
                <span className="rounded-full bg-ember px-2 py-0.5 text-xs font-semibold text-white">
                  {openCount}
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>

      <div className="rounded-2xl border border-haze bg-white px-4 py-3 text-xs text-slate">
        <p className="font-semibold text-ink">Memory Layer</p>
        <p className="mt-1">
          Neo4j + ChromaDB keeps a behavioral fingerprint of every incident.
        </p>
      </div>
    </aside>
  )
}
