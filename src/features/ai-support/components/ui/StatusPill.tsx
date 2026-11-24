import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { toneDotClass, toneSoftClass, type AssistantTone } from './tones'

type StatusPillProps = {
  tone?: AssistantTone
  children: ReactNode
  pulse?: boolean
  className?: string
}

export function StatusPill({ tone = 'neutral', children, pulse = false, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
        toneSoftClass[tone],
        className
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden>
        {pulse ? (
          <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', toneDotClass[tone])} />
        ) : null}
        <span className={cn('relative h-1.5 w-1.5 rounded-full', toneDotClass[tone])} />
      </span>
      <span className="truncate">{children}</span>
    </span>
  )
}
