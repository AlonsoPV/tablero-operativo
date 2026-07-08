import { Heart, Sparkles } from 'lucide-react'
import { ENVIARDIAN_MANIFESTO } from '@/constants/enviardianManifesto'
import { cn } from '@/lib/utils'

type LoginManifestoProps = {
  variant?: 'panel' | 'compact'
  className?: string
}

export function LoginManifesto({ variant = 'panel', className }: LoginManifestoProps) {
  if (variant === 'compact') {
    return (
      <blockquote
        className={cn(
          'relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-background to-primary/[0.04] px-5 py-5 text-center shadow-sm',
          className
        )}
      >
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl"
          aria-hidden
        />
        <p className="relative text-[15px] font-medium leading-relaxed tracking-tight text-foreground/90">
          <span className="block">{ENVIARDIAN_MANIFESTO.line1}</span>
          <span className="block">{ENVIARDIAN_MANIFESTO.line2}</span>
        </p>
        <div className="relative mx-auto my-3 h-px w-12 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <p className="relative text-lg font-semibold tracking-wide text-primary">
          {ENVIARDIAN_MANIFESTO.title}
        </p>
      </blockquote>
    )
  }

  return (
    <div className={cn('relative max-w-lg space-y-8', className)}>
      <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/90">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {ENVIARDIAN_MANIFESTO.tagline}
      </div>

      <div className="space-y-5">
        <p className="text-3xl font-light leading-[1.35] tracking-tight text-primary-foreground xl:text-[2rem]">
          <span className="block font-medium">Más que un envío,</span>
          <span className="block bg-gradient-to-r from-primary-foreground to-primary-foreground/75 bg-clip-text text-transparent">
            una vida.
          </span>
        </p>
        <p className="text-3xl font-light leading-[1.35] tracking-tight text-primary-foreground xl:text-[2rem]">
          <span className="block font-medium">Más que logística,</span>
          <span className="block bg-gradient-to-r from-primary-foreground to-primary-foreground/75 bg-clip-text text-transparent">
            humanidad.
          </span>
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-primary-foreground/40 to-transparent" />
        <Heart className="h-4 w-4 shrink-0 text-primary-foreground/80" aria-hidden />
        <div className="h-px flex-1 bg-gradient-to-l from-primary-foreground/40 to-transparent" />
      </div>

      <p className="text-4xl font-semibold tracking-tight text-primary-foreground sm:text-[2.35rem]">
        {ENVIARDIAN_MANIFESTO.title.split(' ')[0]}{' '}
        <span className="bg-gradient-to-r from-white via-primary-foreground to-primary-foreground/80 bg-clip-text font-bold text-transparent">
          {ENVIARDIAN_MANIFESTO.title.split(' ').slice(1).join(' ')}
        </span>
      </p>
    </div>
  )
}
