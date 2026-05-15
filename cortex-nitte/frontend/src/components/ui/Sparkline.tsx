import React from 'react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  showTooltip?: boolean
}

export function Sparkline({ data, color = '#3b5bdb', height = 36, showTooltip = false }: SparklineProps) {
  const chartData = data.map((v, i) => ({ i, v }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showTooltip && <Tooltip
          contentStyle={{ fontSize: 10, padding: '2px 6px', background: '#1e293b', border: 'none', color: '#f1f5f9', borderRadius: 4 }}
          itemStyle={{ color: '#f1f5f9' }}
          formatter={(v: number) => [v.toFixed(2), '']}
          labelFormatter={() => ''}
        />}
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sg-${color.replace('#', '')})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
