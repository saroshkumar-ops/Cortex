import React from 'react'
import { statusColor } from '../../lib/format'

interface StatusDotProps {
  status: string
  size?: number
  pulse?: boolean
}

export function StatusDot({ status, size = 8, pulse = true }: StatusDotProps) {
  const color = statusColor(status)

  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        minWidth: size,
        borderRadius: '50%',
        backgroundColor: color,
        animation: pulse ? 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' : 'none',
      }}
    />
  )
}
