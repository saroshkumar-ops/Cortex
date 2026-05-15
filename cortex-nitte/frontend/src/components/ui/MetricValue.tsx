import React from 'react'
import { useCountAnimation } from '../../hooks/useCountAnimation'

// ─── MetricValue ───────────────────────────────────────────────
// Renders an animated number or "--" for null/0/undefined.
// Always uses JetBrains Mono.

interface MetricValueProps {
  value: number | null | undefined
  unit?: string
  decimals?: number
  fontSize?: number
  color?: string
  style?: React.CSSProperties
}

export function MetricValue({
  value,
  unit,
  decimals = 0,
  fontSize = 12,
  color,
  style,
}: MetricValueProps) {
  const isNull = value === null || value === undefined || value === 0
  const animatedValue = useCountAnimation(isNull ? 0 : value!, 300)

  if (isNull) {
    return (
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize,
          color: '#1e2d45',
          ...style,
        }}
      >
        --
      </span>
    )
  }

  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize,
        color: color ?? 'inherit',
        ...style,
      }}
    >
      {animatedValue.toFixed(decimals)}
      {unit && (
        <span style={{ fontSize: fontSize * 0.75, color: '#1a2236', marginLeft: 1 }}>
          {unit}
        </span>
      )}
    </span>
  )
}
