import { useState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { AccionPriorityBadge } from '@/features/operations/components/AccionPriorityBadge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CtaTrustRow,
  Eyebrow,
  LandingSection,
  LandingShell,
  PrimaryCTA,
  SecondaryCTA,
  SectionLead,
  SectionTitle,
} from './ProductUI'
import { LANDING_SEO } from './landingSeo'
import { PRODUCT_STORY, PRODUCT_STORY_DEMO_LABEL } from './productStory'

function CoordinationFlowDemo() {
  const { action, requester, owner, coordination } = PRODUCT_STORY
  const [active, setActive] = useState(0)

  const nodes = [
    {
      role: 'Área solicitante',
      name: requester.fullName,
      area: requester.area,
      initials: requester.initials,
      detail: 'Necesitamos validación formal antes de enviar la propuesta al cliente.',
    },
    {
      role: 'Área responsable',
      name: owner.fullName,
      area: owner.area,
      initials: owner.initials,
      detail: `Compromiso aceptado · ${action.dueLabel}`,
    },
    {
      role: 'Compromiso',
      name: action.title,
      area: action.id,
      initials: 'AC',
      detail: `Prioridad ${action.priority} · evidencia: ${action.evidenceExpected}`,
    },
    {
      role: 'Estado actual',
      name: action.state,
      area: PRODUCT_STORY.blocker.label,
      initials: '!',
      detail: PRODUCT_STORY.blocker.detail,
    },
  ]

  return (
    <div className="liquid-glass overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2 sm:px-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Flujo entre áreas
        </p>
        <span className="text-[9px] font-semibold text-white/40">{PRODUCT_STORY_DEMO_LABEL}</span>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="border-b border-white/10 p-3.5 sm:p-4 xl:border-b-0 xl:border-r">
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {nodes.map((node, index) => {
              const isActive = index === active
              return (
                <li key={node.role} className="relative">
                  {index < nodes.length - 1 ? (
                    <ArrowRight
                      className="absolute -right-1.5 top-1/2 z-10 hidden h-3.5 w-3.5 -translate-y-1/2 text-white/35 xl:block"
                      aria-hidden
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    className={cn(
                      'agent-chip flex h-full w-full flex-col rounded-xl p-2.5 text-left transition',
                      isActive && 'agent-chip--active'
                    )}
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">
                      {node.role}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={cn(
                          'grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold',
                          isActive ? 'bg-white text-black' : 'bg-white/10 text-white'
                        )}
                      >
                        {node.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white">{node.name}</p>
                        <p className="truncate text-[11px] text-white/50">{node.area}</p>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
              {nodes[active]?.role}
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{nodes[active]?.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/65">{nodes[active]?.detail}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full border-white/20 bg-transparent px-3 text-xs text-white hover:bg-white/10 hover:text-white"
                disabled={active === 0}
                onClick={() => setActive((value) => Math.max(0, value - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full bg-white px-3 text-xs text-black hover:bg-white/90"
                disabled={active === nodes.length - 1}
                onClick={() => setActive((value) => Math.min(nodes.length - 1, value + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 p-3.5 sm:p-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold tabular-nums text-white/45">{action.id}</span>
              <AccionPriorityBadge prioridad={action.priority} compact />
              <span className="rounded-full border border-amber-200/40 bg-amber-400/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-100">
                {action.state}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold leading-snug text-white">{action.title}</p>
            <p className="mt-1 text-xs text-white/55">
              {requester.area} → {owner.area} · {action.dueLabel}
            </p>
          </div>
          <ol className="space-y-1.5">
            {coordination.flow.map((item, index) => (
              <li
                key={item.step}
                className={cn(
                  'flex gap-2 rounded-lg px-2 py-1.5 transition',
                  index === active ? 'bg-white/[0.08]' : 'bg-transparent'
                )}
              >
                <span className="text-[10px] font-bold tabular-nums text-white/50">0{index + 1}</span>
                <div>
                  <p className="text-xs font-semibold text-white">{item.step}</p>
                  <p className="text-[11px] text-white/55">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

export function CoordinationSection() {
  return (
    <LandingSection
      id="coordinacion"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={LANDING_SEO.sections.coordinacion.description}
    >
      <LandingShell wide>
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
          <div className="max-w-xl">
            <Eyebrow dark tokenColor="red">
              Coordinación entre áreas
            </Eyebrow>
            <SectionTitle dark>Todos saben qué hacer, quién responde y qué sigue.</SectionTitle>
            <SectionLead dark>
              Conecta áreas, responsables y solicitudes en un mismo flujo de trabajo.
            </SectionLead>
          </div>
          <p className="text-sm text-white/45 lg:text-right">
            Recorre el flujo · {PRODUCT_STORY.action.id} permanece visible en toda la landing
          </p>
        </div>
        <div className="mt-5">
          <CoordinationFlowDemo />
        </div>
      </LandingShell>
    </LandingSection>
  )
}

const improvementSteps = [
  {
    label: 'Indicador',
    value: PRODUCT_STORY.objective.gapLabel,
    detail: 'Cumplimiento operativo del periodo (ejemplo de demo).',
  },
  {
    label: 'Brecha',
    value: PRODUCT_STORY.improvement.chain[3].value,
    detail: 'Los bloqueos en validación Comercial-Finanzas frenan el avance.',
  },
  {
    label: 'Acción correctiva',
    value: PRODUCT_STORY.action.id + ' · ' + PRODUCT_STORY.action.title,
    detail: PRODUCT_STORY.blocker.supportAsk,
  },
  {
    label: 'Seguimiento',
    value: PRODUCT_STORY.action.nextStep,
    detail: 'El mismo compromiso alimenta la revisión de dirección.',
  },
] as const

function ImprovementChainDemo() {
  const [step, setStep] = useState(0)
  const active = improvementSteps[step]

  return (
    <div className="liquid-glass overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2 sm:px-4">
        <p className="text-xs font-semibold text-white">De indicador a decisión</p>
        <span className="text-[9px] font-semibold text-white/40">{PRODUCT_STORY_DEMO_LABEL}</span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ol className="divide-y divide-white/10 border-b border-white/10 lg:border-b-0 lg:border-r">
          {improvementSteps.map((item, index) => (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => setStep(index)}
                className={cn(
                  'flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition sm:px-4',
                  index === step ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold',
                    index === step
                      ? 'bg-white text-black'
                      : index < step
                        ? 'bg-white/25 text-white'
                        : 'bg-white/10 text-white/60'
                  )}
                >
                  {index < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : `0${index + 1}`}
                </span>
                <span>
                  <span className="block text-[9px] font-semibold uppercase tracking-wider text-white/40">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-white">{item.value}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="flex flex-col justify-between gap-3 p-3.5 sm:p-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
              {active.label}
            </p>
            <p className="mt-1 text-base font-semibold leading-snug text-white sm:text-lg">
              {active.value}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/65">{active.detail}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full border-white/20 bg-transparent px-3 text-xs text-white hover:bg-white/10 hover:text-white"
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full bg-white px-3 text-xs text-black hover:bg-white/90"
              disabled={step === improvementSteps.length - 1}
              onClick={() => setStep((value) => Math.min(improvementSteps.length - 1, value + 1))}
            >
              Siguiente
            </Button>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {PRODUCT_STORY.improvement.capabilities.map((cap) => (
              <li key={cap} className="flex items-start gap-1.5 text-xs text-white/80">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/70" />
                {cap}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function ContinuousImprovementSection() {
  return (
    <LandingSection
      id="mejora"
      surface="transparent"
      className="home-post__section"
      spacing="tight"
      seoDescription={LANDING_SEO.sections.mejora.description}
    >
      <LandingShell wide>
        <div className="max-w-xl">
          <Eyebrow dark tokenColor="green">
            Gestión y mejora continua
          </Eyebrow>
          <SectionTitle dark>No solo gestiones actividades. Mejora cómo opera tu empresa.</SectionTitle>
          <SectionLead dark>
            Convierte la información de ejecución en seguimiento, aprendizaje y mejores decisiones.
          </SectionLead>
        </div>
        <div className="mt-5">
          <ImprovementChainDemo />
        </div>
      </LandingShell>
    </LandingSection>
  )
}

export function CloseSection() {
  return (
    <LandingSection
      id="cierre"
      surface="transparent"
      className="home-post__section"
      spacing="tight"
      reveal
      seoDescription={LANDING_SEO.sections.cierre.description}
    >
      <LandingShell className="max-w-4xl">
        <div className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 text-center md:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Cierre</p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
            Tu estrategia necesita ejecución.
            <br />
            Tu ejecución necesita seguimiento.
          </h2>
          <SectionLead dark className="mx-auto mt-4 max-w-2xl text-white/60">
            Conecta objetivos, responsables y resultados en una misma plataforma.
          </SectionLead>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCTA dark glow className="bg-white text-black hover:bg-white/90">
              Solicitar demostración
            </PrimaryCTA>
            <SecondaryCTA
              href="#ejecucion"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Explorar Scrumban
            </SecondaryCTA>
          </div>
          <CtaTrustRow
            dark
            className="mt-5 justify-center text-white/45"
            items={['Demo personalizada', 'Sin compromiso', 'Onboarding acompañado']}
          />
          <p className="mt-4 text-[11px] text-white/40">
            Los indicadores de las demos son ejemplos, no resultados de clientes.
          </p>
        </div>
      </LandingShell>
    </LandingSection>
  )
}
