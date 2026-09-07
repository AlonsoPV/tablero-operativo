import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Contador que anima hacia el valor objetivo al montar o al cambiar. */
export function AnimatedNumber({
  value,
  className,
  durationMs = 700,
}: {
  value: number
  className?: string
  durationMs?: number
}) {
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      displayRef.current = value
      setDisplay(value)
      return
    }

    let frame = 0
    const start = performance.now()
    const from = displayRef.current
    const delta = value - from

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - t) ** 3
      const next = Math.round(from + delta * eased)
      displayRef.current = next
      setDisplay(next)
      if (t < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, durationMs])

  return <span className={className}>{display}</span>
}

export function StaggerItem({
  index,
  children,
  className,
}: {
  index: number
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'animate-challenge-fade-up motion-reduce:animate-none motion-reduce:opacity-100',
        className
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }}
    >
      {children}
    </div>
  )
}

export function AmbientOrbs({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl animate-challenge-float motion-reduce:animate-none" />
      <div
        className="absolute -bottom-16 left-8 h-44 w-44 rounded-full bg-primary/10 blur-3xl animate-challenge-float motion-reduce:animate-none"
        style={{ animationDelay: '-3s' }}
      />
      <div className="absolute right-1/3 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-emerald-400/10 blur-2xl animate-challenge-pulse-soft motion-reduce:animate-none" />
    </div>
  )
}
