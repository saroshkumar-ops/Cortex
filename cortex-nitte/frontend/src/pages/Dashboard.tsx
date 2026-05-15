import { AlertTriangle } from 'lucide-react'
import ServiceGraph from '../components/graph/ServiceGraph'
import PredictionPanel from '../components/predictions/PredictionPanel'
import IncidentCard from '../components/incidents/IncidentCard'
import EmptyState from '../components/shared/EmptyState'
import useCortexStore from '../store/cortex'

interface DashboardProps {}

export default function Dashboard({}: DashboardProps) {
  const activeIncidents = useCortexStore((state) => state.activeIncidents)

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <div>
          <p className="panel-title">Live topology</p>
          <p className="text-xs text-slate">
            Service dependency graph updated from WebSocket snapshots.
          </p>
        </div>
        <ServiceGraph />
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <p className="panel-title">Prediction</p>
          <p className="text-xs text-slate">
            Failure risk, time-to-failure, and confidence score.
          </p>
        </div>
        <PredictionPanel />

        <div>
          <p className="panel-title">Active incidents</p>
          <p className="text-xs text-slate">
            Live queue from Cortex predictions.
          </p>
        </div>
        <div className="space-y-4">
          {activeIncidents.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No active incidents"
              subtitle="Cortex is not seeing open incidents right now."
            />
          ) : (
            activeIncidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
