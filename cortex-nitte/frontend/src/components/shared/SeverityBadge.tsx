import clsx from 'clsx'
import { Severity } from '../../types'

interface SeverityBadgeProps {
  severity: Severity
}

const severityStyles: Record<Severity, string> = {
  critical: 'border-red-500/30 bg-red-500/15 text-red-600',
  high: 'border-orange-500/30 bg-orange-500/15 text-orange-600',
  medium: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-700',
  low: 'border-blue-400/30 bg-blue-400/15 text-blue-500',
  none: 'border-gray-300 bg-gray-100 text-gray-500',
}

export default function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
        severityStyles[severity]
      )}
    >
      {severity}
    </span>
  )
}
