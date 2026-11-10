import { useEffect, useState } from 'react'
import { LiveOrb } from '@/components/ui/live-orb'
import { cn } from '@/lib/utils'

/** Blue / foam / lilac wash, tuned to the product primary. */
export const GUIDE_WASH = ['#5B7CFA', '#7DD3C7', '#C4B5FD']

export type GuideMood = 'idle' | 'connecting' | 'listening' | 'speaking' | 'thinking' | 'muted'

const MOOD_COPY: Record<GuideMood, string> = {
  idle: 'Lista cuando tú lo estés',
  connecting: 'Conectando con Guía…',
  listening: 'Te escucha. Habla con naturalidad.',
  speaking: 'Guía está hablando',
  thinking: 'Guía está pensando…',
  muted: 'Micrófono en silencio',
}

type GuidePresenceProps = {
  mood?: GuideMood
  /** Edge length of the orb in CSS pixels. */
  size?: number
  caption?: string
  showCaption?: boolean
  /** When false, the mood is not announced to assistive tech. Use on a secondary orb. */
  announce?: boolean
  className?: string
}

export function useStageOrbSize(small = 176, large = 232) {
  const query = '(max-width: 640px)'
  const [size, setSize] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches ? small : large
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const sync = () => setSize(media.matches ? small : large)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [small, large])

  return size
}

export function GuidePresence({
  mood = 'idle',
  size = 220,
  caption,
  showCaption = false,
  announce = true,
  className,
}: GuidePresenceProps) {
  const alive = mood === 'idle' || mood === 'listening' || mood === 'speaking' || mood === 'connecting'
  const framed = size >= 96
  const pad = !framed ? 0 : mood === 'connecting' || mood === 'speaking' ? 16 : 6
  const label = caption ?? MOOD_COPY[mood]

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div
        className="relative grid place-items-center"
        style={{ width: size + pad * 2, height: size + pad * 2 }}
      >
        {framed ? (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute rounded-full blur-2xl transition-all duration-700',
              mood === 'speaking' && 'bg-primary/50 motion-safe:animate-pulse',
              mood === 'listening' && 'bg-cyan-400/30',
              mood === 'connecting' && 'bg-primary/35',
              mood === 'thinking' && 'bg-violet-400/35 motion-safe:animate-pulse',
              mood === 'muted' && 'bg-slate-400/25',
              mood === 'idle' && 'bg-primary/30'
            )}
            style={{ width: size * 0.86, height: size * 0.86 }}
          />
        ) : null}

        {framed && (mood === 'connecting' || mood === 'speaking') ? (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute rounded-full',
              mood === 'connecting' && 'motion-safe:animate-spin'
            )}
            style={{
              width: size + (mood === 'speaking' ? 18 : 14),
              height: size + (mood === 'speaking' ? 18 : 14),
              background:
                mood === 'speaking'
                  ? 'conic-gradient(from 140deg, transparent 0%, hsl(var(--primary) / 0.05) 28%, hsl(var(--primary)) 58%, transparent 80%)'
                  : 'conic-gradient(from 0deg, transparent 0%, hsl(var(--primary)) 36%, transparent 70%)',
              WebkitMask:
                'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 1.5px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 1.5px))',
              animationDuration: '1.7s',
            }}
          />
        ) : null}

        {framed && mood === 'listening' ? (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-full border border-primary/30"
            style={{ width: size + 16, height: size + 16 }}
          />
        ) : null}

        <LiveOrb
          className="relative z-10"
          size={size}
          variant={alive ? 'webgl' : 'custom'}
          colors={alive ? GUIDE_WASH : undefined}
          color={mood === 'muted' ? '#1E293B' : '#3B6EF5'}
          eyeColor="#F8FAFC"
          ariaLabel="Guía"
        />
      </div>

      {showCaption ? (
        <p
          className="mt-2 max-w-[16rem] text-center text-sm font-medium tracking-tight text-foreground"
          aria-live={announce ? 'polite' : undefined}
        >
          {label}
        </p>
      ) : announce ? (
        <span className="sr-only" aria-live="polite">
          {label}
        </span>
      ) : null}
    </div>
  )
}
