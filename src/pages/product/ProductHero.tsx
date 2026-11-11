import { ArrowDown, ChevronRight, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { AccionPriorityBadge } from '@/features/operations/components/AccionPriorityBadge'
import { LandingShell, Logo, PrimaryCTA } from './ProductUI'
import { LANDING_SEO } from './landingSeo'
import { LandingSectionSeo } from './LandingSeoHead'
import { PRODUCT_STORY, PRODUCT_STORY_DEMO_LABEL } from './productStory'
import { useDemoRequest } from './DemoRequestContext'

const nav = [
  ['Coordinación', '#coordinacion'],
  ['Ejecución', '#ejecucion'],
  ['Visibilidad', '#visibilidad'],
  ['Enviardián', '#enviardian'],
] as const

function DemoPillButton({
  full = false,
  onNavigate,
}: {
  full?: boolean
  onNavigate?: () => void
}) {
  const { openDemoRequest } = useDemoRequest()

  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.()
        openDemoRequest()
      }}
      className={cn(
        'group inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98]',
        full && 'w-full'
      )}
    >
      <span>Solicitar demostración</span>
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-px" aria-hidden />
    </button>
  )
}

export function ProductNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-5 sm:px-6 lg:px-8">
        <Logo light />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Navegación principal">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              {label}
            </a>
          ))}
          <a
            href="/agente"
            className="text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            Enviardián
          </a>
        </nav>
        <div className="hidden md:block">
          <DemoPillButton />
        </div>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white md:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <div className="mx-auto max-w-7xl space-y-2 px-3 pb-4 sm:px-6 md:hidden lg:px-8">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
            >
              {label}
            </a>
          ))}
          <a
            href="/agente"
            onClick={() => setOpen(false)}
            className="block rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
          >
            Enviardián
          </a>
          <DemoPillButton full onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </header>
  )
}

function HeroExecutiveComposition() {
  const { objective, initiative, action, owner } = PRODUCT_STORY

  const steps = [
    {
      key: 'objetivo',
      label: 'Objetivo',
      id: objective.id,
      title: objective.title,
      meta: objective.progressLabel,
    },
    {
      key: 'iniciativa',
      label: 'Iniciativa',
      id: initiative.id,
      title: initiative.title,
      meta: initiative.status,
    },
    {
      key: 'accion',
      label: 'Acción',
      id: action.id,
      title: action.title,
      meta: `${action.dueLabel} · ${action.state}`,
      priority: action.priority,
      accent: true,
    },
    {
      key: 'responsable',
      label: 'Responsable',
      id: owner.area,
      title: owner.fullName,
      meta: `Checklist ${action.checklist.completed}/${action.checklist.total}`,
      initials: owner.initials,
    },
  ]

  return (
    <div className="liquid-glass w-full max-w-md rounded-2xl p-3.5 sm:p-4 lg:max-w-lg">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Sistema de ejecución
        </p>
        <p className="text-[9px] font-semibold text-white/40">{PRODUCT_STORY_DEMO_LABEL}</p>
      </div>
      <ol className="space-y-0">
        {steps.map((step, index) => (
          <li key={step.key} className="relative">
            {index < steps.length - 1 ? (
              <div
                className="absolute left-[0.95rem] top-9 flex h-[calc(100%-0.75rem)] flex-col items-center"
                aria-hidden
              >
                <span className="w-px flex-1 bg-white/15" />
                <ArrowDown className="my-0.5 h-3 w-3 text-white/40" />
                <span className="w-px flex-1 bg-white/15" />
              </div>
            ) : null}
            <div
              className={cn(
                'relative flex gap-3 rounded-xl border p-2.5 sm:p-3',
                step.accent
                  ? 'border-white/25 bg-white/[0.08]'
                  : 'border-white/10 bg-white/[0.03]'
              )}
            >
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                  step.accent || step.initials
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white'
                )}
              >
                {step.initials ?? String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    {step.label}
                  </p>
                  <span className="text-[9px] font-semibold tabular-nums text-white/40">
                    {step.id}
                  </span>
                  {step.priority ? <AccionPriorityBadge prioridad={step.priority} compact /> : null}
                </div>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-white">{step.title}</p>
                <p className="mt-0.5 text-xs text-white/60">{step.meta}</p>
              </div>
            </div>
            {index < steps.length - 1 ? <div className="h-1.5" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function ProductHero() {
  return (
    <>
      <ProductNav />
      <section
        id="inicio"
        className={cn(
          'home-hero-stage relative overflow-hidden bg-transparent',
          'pt-24 pb-16',
          'lg:flex lg:min-h-screen lg:items-center lg:pb-10 lg:pt-20'
        )}
      >
        <LandingSectionSeo description={LANDING_SEO.sections.inicio.description} />
        <LandingShell wide className="w-full">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-16 xl:gap-20">
            <div className="relative max-w-md lg:max-w-lg">
              <div
                className="pointer-events-none absolute -inset-x-6 -inset-y-8 -z-10 rounded-[2rem] bg-gradient-to-r from-black/55 via-black/35 to-transparent blur-2xl"
                aria-hidden
              />
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.65)]"
                  aria-hidden
                />
                Plataforma de ejecución empresarial
              </p>
              <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white [text-shadow:0_2px_28px_rgba(0,0,0,0.45)] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                Convierte la estrategia en resultados.
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/80 [text-shadow:0_1px_18px_rgba(0,0,0,0.4)]">
                Conecta objetivos, equipos y compromisos en un sistema que permite ejecutar, dar
                seguimiento y medir avances.
              </p>
              <div className="mt-8">
                <PrimaryCTA dark className="bg-white text-black shadow-lg shadow-black/30 hover:bg-white/90">
                  Solicitar demostración
                </PrimaryCTA>
              </div>
            </div>
            <div className="flex items-center justify-center lg:justify-end">
              <HeroExecutiveComposition />
            </div>
          </div>
        </LandingShell>
      </section>
    </>
  )
}
