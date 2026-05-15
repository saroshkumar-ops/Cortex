import React from 'react'
import { severityToColor } from '../../lib/format'

interface BadgeProps {
  severity?: string
  status?: string
  label?: string
  size?: 'sm' | 'md'
}

const SEVERITY_CLASSES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high:     'bg-amber-100 text-amber-800 border-amber-200',
  medium:   'bg-yellow-50 text-yellow-800 border-yellow-200',
  low:      'bg-blue-50 text-blue-800 border-blue-200',
  none:     'bg-gray-100 text-gray-600 border-gray-200',
}

const STATUS_CLASSES: Record<string, string> = {
  healthy:  'bg-green-100 text-green-800 border-green-200',
  degraded: 'bg-amber-100 text-amber-800 border-amber-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
}

export function Badge({ severity, status, label, size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  let cls = `inline-flex items-center rounded-full font-semibold border ${sizeClass} `

  if (severity && SEVERITY_CLASSES[severity]) {
    cls += SEVERITY_CLASSES[severity]
  } else if (status && STATUS_CLASSES[status]) {
    cls += STATUS_CLASSES[status]
  } else {
    cls += 'bg-gray-100 text-gray-600 border-gray-200'
  }

  return <span className={cls}>{label ?? severity ?? status}</span>
}
