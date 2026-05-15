import { useMemo } from 'react'
import { Database } from 'lucide-react'
import MemoryStats from '../components/memory/MemoryStats'
import AccuracyChart from '../components/memory/AccuracyChart'
import IncidentFamilyList from '../components/memory/IncidentFamilyList'
import EmptyState from '../components/shared/EmptyState'
import { useMemoryStats } from '../hooks/useMemoryStats'

interface MemoryProps {}

export default function Memory({}: MemoryProps) {
  const { data, isLoading } = useMemoryStats()

  const renamesHandled = useMemo(() => {
    return data?.topology_history.filter((entry) => entry.change === 'rename')
      .length ?? 0
  }, [data])

  const avgAccuracy = useMemo(() => {
    const points = data?.remediation_accuracy_over_time ?? []
    if (points.length === 0) {
      return 0
    }
    return points[points.length - 1].accuracy
  }, [data])

  if (isLoading || !data) {
    return (
      <EmptyState
        icon={Database}
        title="Loading memory stats"
        subtitle="Fetching incident families and accuracy signals."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="panel-title">Memory layer</p>
        <p className="text-xs text-slate">
          Behavioral fingerprints across incident families and topology changes.
        </p>
      </div>

      <MemoryStats
        totalIncidents={data.total_incidents}
        incidentFamilies={data.incident_families.length}
        renamesHandled={renamesHandled}
        avgAccuracy={avgAccuracy}
      />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <AccuracyChart data={data.remediation_accuracy_over_time} />
        <div className="panel p-6">
          <p className="panel-title">Topology history</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-slate">
                <tr>
                  <th className="py-2 pr-4">Timestamp</th>
                  <th className="py-2 pr-4">Change</th>
                  <th className="py-2 pr-4">From</th>
                  <th className="py-2 pr-4">To</th>
                </tr>
              </thead>
              <tbody className="text-slate">
                {data.topology_history.map((entry, index) => (
                  <tr key={`${entry.timestamp}-${index}`} className="border-t border-haze/70">
                    <td className="py-3 pr-4 text-xs">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-ink">
                      {entry.change}
                    </td>
                    <td className="py-3 pr-4">{entry.from}</td>
                    <td className="py-3 pr-4">{entry.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <IncidentFamilyList families={data.incident_families} />
    </div>
  )
}
