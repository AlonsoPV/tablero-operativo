import { Bot, Check, Menu, MessageCircle, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SECTION_SPACING } from '@/lib/spacing'
import {
  CtaTrustRow,
  DemoWindow,
  Eyebrow,
  LandingShell,
  Logo,
  PrimaryCTA,
  SecondaryCTA,
  SectionLead,
} from '@/pages/product/ProductUI'
import { LandingGridPattern, LandingOrbitRings } from '@/pages/product/ProductVisual'
import { StatusToken, StatusTokenMark } from '@/pages/product/StatusToken'
import { AGENT_LANDING_SEO } from './agentSeo'
import { AgentSectionSeo } from './AgentSeoHead'

const nav = [
  ['Agente', '#como-funciona'],
  ['Propuestas', '#propuestas'],
  ['Canales', '#canales'],
  ['Capacidades', '#capacidades'],
] as const

export function AgentNav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <LandingShell className="flex h-14 items-center justify-between sm:h-16">
        <div className="flex items-center gap-3">
          <Logo />
          <StatusTokenMark className="hidden opacity-50 sm:inline-flex" />
        </div>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Navegación principal">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <a
            href="/producto"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Producto
          </a>
          <PrimaryCTA className="h-10 min-h-10" glow>
            Solicitar demo
          </PrimaryCTA>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl border-border/70 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </LandingShell>
      {open ? (
        <nav className="border-t border-border/50 bg-card p-4 md:hidden">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block border-b border-border/40 py-3 text-sm font-semibold text-foreground"
            >
              {label}
            </a>
          ))}
          <a
            href="/producto"
            onClick={() => setOpen(false)}
            className="block border-b border-border/40 py-3 text-sm font-semibold text-foreground"
          >
            Producto
          </a>
          <div className="mt-4">
            <PrimaryCTA className="w-full" />
          </div>
        </nav>
      ) : null}
    </header>
  )
}

function HeroAgentPreview() {
  const bubbles = [
    {
      side: 'in' as const,
      label: 'Ana · WhatsApp',
      text: '¿Qué acciones rojas tengo hoy?',
    },
    {
      side: 'out' as const,
      label: 'Agente SCRUMBAN',
      text: 'Tienes 2 rojas. La crítica: Validar propuesta con Finanzas (AC-1042). ¿Quieres que prepare un seguimiento?',
    },
    {
      side: 'system' as const,
      text: 'Propuesta lista · Confirmar o cancelar',
    },
  ]

  return (
    <div className="relative mx-auto w-full max-w-md lg:translate-x-2">
      <LandingOrbitRings className="-z-10 opacity-50" />
      <DemoWindow className="relative z-10 shadow-xl shadow-primary/5 ring-1 ring-border/50" title="WhatsApp · Agente">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-white">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">SCRUMBAN Agente</p>
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                En línea · canal WhatsApp
              </p>
            </div>
          </div>
          <Badge variant="outline" className="rounded-full text-[10px]">
            Demo
          </Badge>
        </div>

        <div className="space-y-3 bg-[linear-gradient(180deg,hsl(var(--muted)/0.35),hsl(var(--background)))] p-4">
          {bubbles.map((bubble) => {
            if (bubble.side === 'system') {
              return (
                <div
                  key={bubble.text}
                  className="mx-auto flex max-w-[90%] items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2 text-[11px] font-medium text-emerald-800 dark:text-emerald-200"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  {bubble.text}
                </div>
              )
            }
            const outbound = bubble.side === 'out'
            return (
              <div
                key={bubble.text}
                className={cn('flex', outbound ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm',
                    outbound
                      ? 'rounded-bl-md bg-card ring-1 ring-border/60'
                      : 'rounded-br-md bg-emerald-600 text-white'
                  )}
                >
                  <p
                    className={cn(
                      'text-[9px] font-semibold uppercase tracking-wide',
                      outbound ? 'text-primary' : 'text-emerald-100/90'
                    )}
                  >
                    {bubble.label}
                  </p>
                  <p className={cn('mt-1 text-sm leading-snug', outbound ? 'text-foreground' : 'text-white')}>
                    {bubble.text}
                  </p>
                </div>
              </div>
            )
          })}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm"
            >
              <Check className="h-3.5 w-3.5" />
              Confirmar
            </button>
            <button
              type="button"
              className="flex flex-1 items-center justify-center rounded-xl border border-border/70 bg-card px-3 py-2.5 text-xs font-semibold text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      </DemoWindow>

      <div className="absolute -bottom-6 -left-3 z-20 hidden w-44 rounded-xl border border-border/60 bg-card p-3 shadow-lg sm:block">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[9px] text-muted-foreground">Follow-ups activos</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">12</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 right-4 z-20 hidden items-center gap-2 rounded-full border border-border/60 bg-foreground px-3 py-2 text-background shadow-lg sm:flex">
        <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
        <span className="text-[9px] font-semibold">Propuesta confirmada</span>
        <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      </div>
    </div>
  )
}

export function AgentHero() {
  return (
    <>
      <AgentNav />
      <section
        id="inicio"
        className={cn(
          'relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30',
          SECTION_SPACING.hero
        )}
      >
        <AgentSectionSeo description={AGENT_LANDING_SEO.sections.inicio.description} />
        <LandingGridPattern className="opacity-50" />
        <div
          className="pointer-events-none absolute right-6 top-24 hidden opacity-[0.12] lg:block"
          aria-hidden
        >
          <div className="flex flex-col gap-3">
            <StatusToken color="green" size="md" pulse={false} />
            <StatusToken color="yellow" size="md" pulse={false} />
            <StatusToken color="blue" size="md" pulse={false} />
          </div>
        </div>
        <LandingShell>
          <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card to-emerald-500/[0.04] p-5 shadow-lg sm:p-7">
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
                aria-hidden
              />
              <div className="relative">
                <Eyebrow tokenColor="green">Agente IA · WhatsApp</Eyebrow>
                <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                  Un agente que opera contigo{' '}
                  <span className="bg-gradient-to-r from-emerald-600 to-primary bg-clip-text text-transparent">
                    en el chat donde ya trabajas.
                  </span>
                </h1>
                <SectionLead>
                  Consulta el tablero, propone acciones y pide confirmación por WhatsApp o en el
                  asistente web. Seguimiento con botones, evidencia y trazabilidad — sin perder el
                  control humano.
                </SectionLead>
                <div className="mt-7">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <PrimaryCTA glow>Solicitar demo del agente</PrimaryCTA>
                    <SecondaryCTA href="#como-funciona">Ver cómo funciona</SecondaryCTA>
                  </div>
                  <CtaTrustRow
                    items={['Confirmación humana', 'WhatsApp + web', 'Misma lógica del tablero']}
                  />
                </div>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {[
                    'Consulta operativa',
                    'Propuestas con sí/no',
                    'Follow-ups automáticos',
                    'Evidencia por chat',
                    'Bandeja unificada',
                  ].map((chip) => (
                    <Badge
                      key={chip}
                      variant="outline"
                      className="rounded-full border-border/60 bg-background/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {chip}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <HeroAgentPreview />
          </div>
        </LandingShell>
      </section>
    </>
  )
}
