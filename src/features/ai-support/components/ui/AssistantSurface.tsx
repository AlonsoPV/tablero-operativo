import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const ASSISTANT_SURFACE_SHADOW = 'shadow-[0_28px_70px_-40px_hsl(var(--foreground)/0.45)]'

type AssistantSurfaceProps = {
  children: ReactNode
  className?: string
  /** Agrega el halo azul superior del asistente. */
  glow?: boolean
}

export function AssistantSurface({ children, className, glow = false }: AssistantSurfaceProps) {
  return (
    <div
      className={cn(
        'relative min-h-0 overflow-hidden rounded-[1.75rem] ring-1 ring-border/50',
        ASSISTANT_SURFACE_SHADOW,
        glow &&
          'bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--primary)/0.12),transparent_55%),linear-gradient(180deg,hsl(var(--primary)/0.035)_0%,hsl(var(--background))_46%)]',
        className
      )}
    >
      {glow ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.1),transparent_70%)]"
          aria-hidden
        />
      ) : null}
      {children}
    </div>
  )
}
