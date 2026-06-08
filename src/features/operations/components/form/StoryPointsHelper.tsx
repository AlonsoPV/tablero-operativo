import { cn } from '@/lib/utils'
import {
  getStoryPointGuide,
  type StoryPointGuideTone,
} from '../../utils/storyPointsGuide'

const TONE_STYLES: Record<
  StoryPointGuideTone,
  { container: string; title: string }
> = {
  low: {
    container: 'border-emerald-500/25 bg-emerald-500/[0.06]',
    title: 'text-emerald-800 dark:text-emerald-300',
  },
  moderate: {
    container: 'border-amber-500/25 bg-amber-500/[0.06]',
    title: 'text-amber-900 dark:text-amber-300',
  },
  high: {
    container: 'border-orange-500/25 bg-orange-500/[0.06]',
    title: 'text-orange-900 dark:text-orange-300',
  },
  veryHigh: {
    container: 'border-red-500/25 bg-red-500/[0.06]',
    title: 'text-red-900 dark:text-red-300',
  },
  maximum: {
    container: 'border-rose-500/30 bg-rose-500/[0.08]',
    title: 'text-rose-900 dark:text-rose-300',
  },
}

type StoryPointsHelperProps = {
  points: number
  className?: string
}

/** Ayuda contextual debajo del selector de Story Points (solo valores Fibonacci 1–13). */
export function StoryPointsHelper({ points, className }: StoryPointsHelperProps) {
  const guide = getStoryPointGuide(points)
  if (!guide) return null

  const tone = TONE_STYLES[guide.tone]

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'rounded-lg border px-3 py-2.5 transition-colors duration-200 sm:px-3.5',
        tone.container,
        className
      )}
    >
      <p className={cn('text-sm font-semibold leading-snug', tone.title)}>
        <span className="mr-1.5" aria-hidden>
          {guide.icon}
        </span>
        <span>
          {guide.points} {guide.points === 1 ? 'punto' : 'puntos'} — {guide.title}
        </span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{guide.description}</p>
    </div>
  )
}
