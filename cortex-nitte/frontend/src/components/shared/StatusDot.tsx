import clsx from 'clsx'

interface StatusDotProps {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown' | 'ok' | 'down'
  size?: 'sm' | 'md'
}

const statusColor: Record<StatusDotProps['status'], string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  critical: 'bg-red-500',
  unknown: 'bg-gray-400',
  ok: 'bg-green-500',
  down: 'bg-red-500',
}

const sizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
}

export default function StatusDot({ status, size = 'md' }: StatusDotProps) {
  return (
    <span
      className={clsx(
        'relative flex items-center justify-center',
        sizeClasses[size]
      )}
    >
      <span
        className={clsx(
          'absolute inline-flex h-full w-full animate-ping rounded-full opacity-40',
          statusColor[status]
        )}
      />
      <span
        className={clsx(
          'relative inline-flex h-full w-full rounded-full',
          statusColor[status]
        )}
      />
    </span>
  )
}
