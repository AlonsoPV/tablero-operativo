import type { ReactNode } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { APP_NAME } from '@/constants'
import { cn } from '@/lib/utils'

type GuideInviteShellProps = {
  children: ReactNode
  /** Right-side header meta (duration, status, etc.). */
  meta?: ReactNode
  /** Optional left header action (back button). */
  leading?: ReactNode
  className?: string
  contentClassName?: string
  /** Softer wash for call stage. */
  intensity?: 'landing' | 'stage'
}

export function GuideInviteShell({
  children,
  meta,
  leading,
  className,
  contentClassName,
  intensity = 'landing',
}: GuideInviteShellProps) {
  return (
    <main className={cn('relative flex min-h-dvh flex-col bg-background text-foreground', className)}>
      <div
        className={cn(
          'pointer-events-none fixed inset-0',
          intensity === 'landing'
            ? 'bg-[radial-gradient(88%_52%_at_50%_-8%,hsl(var(--primary)/0.24),transparent_58%),radial-gradient(42%_34%_at_92%_100%,hsl(174_48%_62%/0.14),transparent_68%),linear-gradient(180deg,hsl(var(--muted)/0.55),hsl(var(--background))_46%)]'
            : 'bg-[radial-gradient(76%_48%_at_50%_12%,hsl(var(--primary)/0.3),transparent_60%),radial-gradient(38%_32%_at_88%_92%,hsl(174_48%_62%/0.16),transparent_70%)]'
        )}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'28\' height=\'28\' viewBox=\'0 0 28 28\'%3E%3Cpath fill=\'%230f172a\' d=\'M0 14h28M14 0v28\'/%3E%3C/svg%3E")',
        }}
        aria-hidden
      />

      <header className="relative z-10 flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        {leading ?? (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <LayoutDashboard className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">{APP_NAME}</p>
              <p className="text-[11px] text-muted-foreground">Guía · conversación por voz</p>
            </div>
          </div>
        )}
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </header>

      <div className={cn('relative z-10 flex flex-1 flex-col', contentClassName)}>{children}</div>
    </main>
  )
}

export function GuideInviteMetaChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg bg-background/75 px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-border/70 backdrop-blur-sm',
        className
      )}
    >
      {children}
    </span>
  )
}
