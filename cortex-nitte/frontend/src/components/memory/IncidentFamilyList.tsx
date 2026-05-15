import { MemoryIncidentFamily } from '../../types'
import ConfidenceBar from '../shared/ConfidenceBar'

interface IncidentFamilyListProps {
  families: MemoryIncidentFamily[]
}

export default function IncidentFamilyList({
  families,
}: IncidentFamilyListProps) {
  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between">
        <p className="panel-title">Incident families</p>
        <span className="text-xs text-slate">{families.length} families</span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="py-2 pr-4">Family</th>
              <th className="py-2 pr-4">Count</th>
              <th className="py-2 pr-4">Avg resolve</th>
              <th className="py-2 pr-4">Top remediation</th>
            </tr>
          </thead>
          <tbody className="text-slate">
            {families.map((family) => (
              <tr key={family.id} className="border-t border-haze/70">
                <td className="py-3 pr-4 font-semibold text-ink">
                  {family.name}
                </td>
                <td className="py-3 pr-4">{family.count}</td>
                <td className="py-3 pr-4">
                  {Math.round(family.avg_resolution_time_minutes)} min
                </td>
                <td className="py-3 pr-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-ink">
                      {family.top_remediation}
                    </p>
                    <ConfidenceBar value={family.top_remediation_confidence} />
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
