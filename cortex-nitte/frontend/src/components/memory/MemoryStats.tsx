import ConfidenceBar from '../shared/ConfidenceBar'

interface MemoryStatsProps {
  totalIncidents: number
  incidentFamilies: number
  renamesHandled: number
  avgAccuracy: number
}

export default function MemoryStats({
  totalIncidents,
  incidentFamilies,
  renamesHandled,
  avgAccuracy,
}: MemoryStatsProps) {
  const accuracyPercent = Math.round(avgAccuracy * 100)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="panel p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate">
          Total incidents
        </p>
        <p className="mt-2 text-2xl font-semibold text-ink">{totalIncidents}</p>
      </div>
      <div className="panel p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate">
          Incident families
        </p>
        <p className="mt-2 text-2xl font-semibold text-ink">{incidentFamilies}</p>
      </div>
      <div className="panel p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate">
          Renames handled
        </p>
        <p className="mt-2 text-2xl font-semibold text-ink">{renamesHandled}</p>
      </div>
      <div className="panel p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate">
          Avg accuracy
        </p>
        <p className="mt-2 text-2xl font-semibold text-ink">
          {accuracyPercent}%
        </p>
        <div className="mt-3">
          <ConfidenceBar value={avgAccuracy} />
        </div>
      </div>
    </div>
  )
}
