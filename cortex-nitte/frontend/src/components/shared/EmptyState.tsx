import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  subtitle?: string
}

export default function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-haze bg-white/60 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-haze/60 text-slate">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {subtitle ? <p className="text-xs text-slate">{subtitle}</p> : null}
      </div>
    </div>
  )
}
