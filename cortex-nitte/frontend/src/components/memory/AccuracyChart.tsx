import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { RemediationAccuracyPoint } from '../../types'

interface AccuracyChartProps {
  data: RemediationAccuracyPoint[]
}

export default function AccuracyChart({ data }: AccuracyChartProps) {
  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between">
        <p className="panel-title">Remediation accuracy</p>
        <span className="text-xs text-slate">Learning curve</span>
      </div>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e7ecf5" strokeDasharray="4 4" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(value: number) => `${Math.round(value * 100)}%`}
              labelStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="accuracy"
              stroke="#1f7a8c"
              strokeWidth={3}
              dot={{ r: 3, fill: '#1f7a8c' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
