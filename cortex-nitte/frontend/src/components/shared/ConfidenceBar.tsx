import clsx from 'clsx'

interface ConfidenceBarProps {
  value: number
  showLabel?: boolean
  size?: 'sm' | 'md'
}

const sizeMap = {
  sm: 'h-1.5',
  md: 'h-2.5',
}

function getConfidenceColor(value: number) {
  if (value >= 0.8) {
    return 'bg-green-500'
  }
  if (value >= 0.5) {
    return 'bg-yellow-500'
  }
  return 'bg-red-500'
}

export default function ConfidenceBar({
  value,
  showLabel = true,
  size = 'md',
}: ConfidenceBarProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const percent = Math.round(clamped * 100)

  return (
    <div className="flex items-center gap-3">
      <div className={clsx('w-full rounded-full bg-haze/70', sizeMap[size])}>
        <div
          className={clsx('rounded-full transition-all', sizeMap[size], getConfidenceColor(clamped))}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel ? (
        <span className="text-xs font-semibold text-slate">{percent}%</span>
      ) : null}
    </div>
  )
}
