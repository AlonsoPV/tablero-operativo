import { Link } from 'react-router-dom'
import type { ReportFollowUpItem } from '@/features/guide/reportViewModel'
import { cn } from '@/lib/utils'

const TONE: Record<
  ReportFollowUpItem['statusTone'],
  { border: string; badge: string; rail: string }
> = {
  pending: {
    border: 'border-[#D97706]/30',
    badge: 'border-[#D97706]/35 bg-[#D97706]/10 text-[#B45309]',
    rail: 'bg-[#D97706]',
  },
  proposal: {
    border: 'border-[#7C3AED]/25',
    badge: 'border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#7C3AED]',
    rail: 'bg-[#7C3AED]',
  },
  executed: {
    border: 'border-[#16A34A]/30',
    badge: 'border-[#16A34A]/30 bg-[#16A34A]/10 text-[#15803D]',
    rail: 'bg-[#16A34A]',
  },
  decision: {
    border: 'border-[#2563EB]/25',
    badge: 'border-[#2563EB]/30 bg-[#2563EB]/10 text-[#1D4ED8]',
    rail: 'bg-[#2563EB]',
  },
}

export function FollowUpCard({
  item,
  kindLabel,
}: {
  item: ReportFollowUpItem
  kindLabel: string
}) {
  const tone = TONE[item.statusTone]
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-white p-3.5 shadow-sm',
        tone.border
      )}
    >
      <div className={cn('absolute inset-y-0 left-0 w-1.5', tone.rail)} aria-hidden />
      <div className="space-y-2 pl-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
              {kindLabel}
            </p>
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          </div>
          <span
            className={cn(
              'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold',
              tone.badge
            )}
          >
            {item.statusLabel}
          </span>
        </div>
        {(item.ownerHint || item.dueDateHint) && (
          <p className="text-xs text-slate-500">
            {[item.ownerHint ? `Para: ${item.ownerHint}` : null, item.dueDateHint]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {item.href ? (
          <Link to={item.href} className="text-xs font-medium text-[#2563EB] hover:underline">
            Abrir en Scrumban
          </Link>
        ) : null}
      </div>
    </article>
  )
}
