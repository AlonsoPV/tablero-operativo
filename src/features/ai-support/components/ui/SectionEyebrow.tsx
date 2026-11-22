import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SectionEyebrowProps = {
  children: ReactNode
  icon?: LucideIcon
  tone?: 'primary' | 'muted'
  className?: string
}

export function SectionEyebrow({ children, icon: Icon, tone = 'primary', className }: SectionEyebrowProps) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]',
        tone === 'primary' ? 'text-primary' : 'text-muted-foreground',
        className
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {children}
    </p>
  )
}
