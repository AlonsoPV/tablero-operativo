import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function HorizontalNavScroller({
  children,
  className,
  activeKey,
  label,
}: {
  children: ReactNode
  className?: string
  /** Cambia cuando la ruta activa cambia para centrar el pill seleccionado. */
  activeKey?: string
  label?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('[data-nav-active="true"]')
    if (!active) return
    const frame = window.requestAnimationFrame(() => {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeKey])

  return (
    <div className={cn('relative min-w-0', className)}>
      {label ? (
        <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-background via-background/80 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background via-background/80 to-transparent"
        aria-hidden
      />
      <div
        ref={scrollerRef}
        className={cn(
          'flex gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth px-0.5 pb-0.5 pt-0.5',
          'scroll-px-3 snap-x snap-mandatory touch-pan-x',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
      >
        {children}
      </div>
    </div>
  )
}
