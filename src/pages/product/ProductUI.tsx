import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { ArrowRight, Check, ChevronRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SECTION_SPACING, type SectionSpacing } from '@/lib/spacing'
import { RevealSection } from './RevealSection'
import { LandingSectionSeo } from './LandingSeoHead'
import { useDemoRequest } from './DemoRequestContext'
import { StatusToken, type StatusColor } from './StatusToken'

/** @deprecated Usar el formulario de demo integrado. */
export const demoHref = 'mailto:demo@scrumban.mx?subject=Quiero%20conocer%20SCRUMBAN'

/** Variantes de fondo: nunca dos secciones consecutivas iguales. */
export type LandingSurface = 'base' | 'muted' | 'depth' | 'inverse' | 'transparent'

const SURFACE_CLASS: Record<LandingSurface, string> = {
  base: 'bg-background',
  muted: 'border-y border-border/50 bg-muted/40',
  depth: 'bg-gradient-to-b from-muted/50 via-muted/20 to-background',
  inverse: 'border-y border-border/50 bg-foreground text-background',
  /** Campo compartido sticky (p. ej. /agente): sin fill de sección. */
  transparent: 'bg-transparent',
}

/** Contenedor de página alineado al tablero (`max-w-7xl` + padding). */
export function LandingShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  )
}

/** Sección con ritmo vertical, superficie y reveal al scroll. */
export function LandingSection({
  id,
  children,
  className,
  surface = 'base',
  spacing = 'standard',
  seoDescription,
  /** @deprecated Prefer `surface="muted"`. */
  muted = false,
  reveal = true,
  withGrid = false,
}: {
  id?: string
  children: ReactNode
  className?: string
  surface?: LandingSurface
  spacing?: SectionSpacing
  seoDescription?: string
  muted?: boolean
  reveal?: boolean
  withGrid?: boolean
}) {
  const resolvedSurface: LandingSurface = muted && surface === 'base' ? 'muted' : surface
  const content = reveal ? <RevealSection>{children}</RevealSection> : children

  return (
    <section
      id={id}
      className={cn('relative', SECTION_SPACING[spacing], SURFACE_CLASS[resolvedSurface], className)}
    >
      {seoDescription ? <LandingSectionSeo description={seoDescription} /> : null}
      {withGrid ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--border) / 0.3) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--border) / 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '44px 44px',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
          }}
          aria-hidden
        />
      ) : null}
      <div className="relative">{content}</div>
    </section>
  )
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#inicio" className="inline-flex items-center gap-2.5" aria-label="SCRUMBAN, inicio">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[10px] font-black text-primary-foreground shadow-sm">
        SB
      </span>
      <span
        className={cn(
          'text-sm font-semibold tracking-[0.14em]',
          light ? 'text-primary-foreground' : 'text-foreground'
        )}
      >
        SCRUMBAN
      </span>
    </a>
  )
}

export function Eyebrow({
  children,
  dark = false,
  className,
  tokenColor = 'blue',
}: {
  children: ReactNode
  dark?: boolean
  className?: string
  tokenColor?: StatusColor
}) {
  const label = typeof children === 'string' ? children : undefined

  return (
    <div className={cn('mb-4', className)}>
      <StatusToken
        color={tokenColor}
        label={label}
        className={cn(dark && '[&>span:last-child]:text-background/75')}
      />
      {!label ? (
        <span
          className={cn(
            'ml-2 text-[11px] font-semibold uppercase tracking-wider',
            dark ? 'text-background/75' : 'text-primary'
          )}
        >
          {children}
        </span>
      ) : null}
    </div>
  )
}

export function SectionTitle({
  children,
  dark = false,
  className = '',
}: {
  children: ReactNode
  dark?: boolean
  className?: string
}) {
  return (
    <h2
      className={cn(
        'text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl',
        dark ? 'text-background' : 'text-foreground',
        className
      )}
    >
      {children}
    </h2>
  )
}

export function SectionLead({
  children,
  dark = false,
  className,
}: {
  children: ReactNode
  dark?: boolean
  className?: string
}) {
  return (
    <p
      className={cn(
        'mt-4 max-w-2xl text-sm leading-relaxed sm:text-base',
        dark ? 'text-background/70' : 'text-muted-foreground',
        className
      )}
    >
      {children}
    </p>
  )
}

/** Card del tablero: `rounded-2xl border-border/60 bg-card shadow-sm`. */
export function LandingCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Hero / panel con gradiente como TeamHub / dashboard control center. */
export function LandingPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 p-5 shadow-sm sm:p-7',
        className
      )}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  )
}

export function PrimaryCTA({
  children = 'Solicitar demo',
  dark = false,
  glow = false,
  className,
}: {
  children?: ReactNode
  dark?: boolean
  glow?: boolean
  className?: string
}) {
  const { openDemoRequest } = useDemoRequest()

  return (
    <Button
      type="button"
      size="lg"
      variant={dark ? 'secondary' : 'default'}
      onClick={openDemoRequest}
      className={cn(
        'h-11 min-h-11 gap-2 rounded-full px-6 text-sm font-semibold shadow-sm',
        dark && 'bg-background text-foreground hover:bg-background/90',
        glow &&
          !dark &&
          'shadow-lg shadow-primary/25 ring-1 ring-primary/20 hover:shadow-primary/30',
        className
      )}
    >
      {glow && !dark ? <Sparkles className="h-4 w-4" aria-hidden /> : null}
      {children}
      <ArrowRight className="h-4 w-4" />
    </Button>
  )
}

/** CTA secundario que abre el mismo formulario de demo. */
export function DemoAdvisorCTA({
  children = 'Hablar con un asesor',
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const { openDemoRequest } = useDemoRequest()

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      onClick={openDemoRequest}
      className={cn(
        'h-11 min-h-11 rounded-full border-border/70 bg-background px-6 text-sm font-semibold',
        className
      )}
    >
      {children}
    </Button>
  )
}

/** Trust-bullets bajo CTAs principales (hero / cierre). */
export function CtaTrustRow({
  dark = false,
  className,
  items = ['Demo personalizada', 'Sin fricción para tu equipo', 'Implementación guiada'],
}: {
  dark?: boolean
  className?: string
  items?: readonly [string, string, string]
}) {
  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
        dark ? 'text-background/65' : 'text-muted-foreground',
        className
      )}
    >
      {items.map((item, index) => (
        <Fragment key={item}>
          {index > 0 ? <span aria-hidden>·</span> : null}
          <span>{item}</span>
        </Fragment>
      ))}
    </div>
  )
}

export function SecondaryCTA({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Button
      asChild
      size="lg"
      variant="outline"
      className={cn(
        'h-11 min-h-11 rounded-full border-border/70 bg-background px-6 text-sm font-semibold',
        className
      )}
    >
      <a href={href}>{children}</a>
    </Button>
  )
}

export function DemoWindow({
  children,
  title = 'Operación · Hoy',
  className = '',
}: {
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <LandingCard className={cn('min-w-0', className)}>
      <div className="flex h-11 items-center justify-between border-b border-border/50 bg-muted/20 px-4">
        <div className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <i className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <i className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <span className="text-[10px] font-semibold text-muted-foreground">{title}</span>
        <span className="h-5 w-5 rounded-full bg-muted" />
      </div>
      {children}
    </LandingCard>
  )
}

export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Check className="h-3 w-3" />
      </span>
      {children}
    </div>
  )
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
    >
      {children}
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </a>
  )
}

export function FeatureIcon({
  icon: Icon,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary',
        className
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
  )
}
