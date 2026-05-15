import React from 'react'

interface ArcGaugeProps {
  value: number        // 0–1
  label: string
  colorOverride?: string
  size?: number
}

export function ArcGauge({ value, label, colorOverride, size = 120 }: ArcGaugeProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const startAngle = 145
  const endAngle = 395
  const angle = startAngle + (endAngle - startAngle) * clamped
  const rad = (angle * Math.PI) / 180

  const color =
    colorOverride ??
    (clamped > 0.8 ? '#10B981' : clamped > 0.5 ? '#F59E0B' : '#EF4444')

  const r = size * 0.375
  const cx = size / 2
  const cy = size / 2
  const x = cx + r * Math.cos(rad)
  const y = cy + r * Math.sin(rad)
  const startX = cx + r * Math.cos((startAngle * Math.PI) / 180)
  const startY = cy + r * Math.sin((startAngle * Math.PI) / 180)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth={size * 0.065} opacity={0.4} />
      <path
        d={`M ${startX} ${startY} A ${r} ${r} 0 ${angle - startAngle > 180 ? 1 : 0} 1 ${x} ${y}`}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.065}
        strokeLinecap="round"
      />
      <text x={cx} y={cy + size * 0.085} textAnchor="middle" fontSize={size * 0.13} fontWeight="700" fill="#172033">
        {(clamped * 100).toFixed(0)}%
      </text>
      <text x={cx} y={cy + size * 0.23} textAnchor="middle" fontSize={size * 0.087} fill="#55627C">
        {label}
      </text>
    </svg>
  )
}
