import {
  Bot,
  CheckCircle2,
  Inbox,
  MessageCircle,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/utils'
import {
  CtaTrustRow,
  DemoAdvisorCTA,
  Eyebrow,
  LandingCard,
  LandingSection,
  LandingShell,
  PrimaryCTA,
  SectionLead,
  SectionTitle,
} from '@/pages/product/ProductUI'
import { CountUpInteger } from '@/pages/product/CountUpValue'
import { PremiumCtaPanel } from '@/pages/product/ProductVisual'
import { StatusToken } from '@/pages/product/StatusToken'
import { AGENT_LANDING_SEO } from './agentSeo'
import { AgentSectionSeo } from './AgentSeoHead'

function ChaosToAgentVisual() {
  const { ref, inView } = useInView(0.35)

  const chaosMessages = [
    {
      channel: 'WhatsApp personal',
      tint: 'border-emerald-500/30 bg-emerald-500/[0.07]',
      rotate: '-rotate-2',
      offset: 'translate-x-1 -translate-y-1',
      text: '¿Ya le diste seguimiento a Ana?',
      meta: 'Hoy · 09:14',
    },
    {
      channel: 'Grupo ops',
      tint: 'border-sky-500/30 bg-sky-500/[0.07]',
      rotate: 'rotate-1',
      offset: 'translate-x-3 translate-y-2',
      text: 'Nadie respondió el recordatorio de ayer…',
      meta: 'Ayer · 18:42',
    },
    {
      channel: 'DM dirección',
      tint: 'border-violet-500/30 bg-violet-500/[0.07]',
      rotate: 'rotate-2',
      offset: '-translate-x-1 translate-y-4',
      text: '¿En qué quedó el bloqueo de Finanzas?',
      meta: 'Hoy · 10:02',
    },
  ] as const

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md lg:mx-0">
      <div
        className={cn(
          'relative min-h-[280px] transition-all duration-700 ease-out',
          inView ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'
        )}
        aria-hidden={inView}
      >
        {chaosMessages.map((msg, index) => (
          <div
            key={msg.channel}
            className={cn(
              'absolute left-0 right-0 rounded-xl border p-3 shadow-sm backdrop-blur-sm transition-all duration-500',
              msg.tint,
              msg.rotate,
              msg.offset
            )}
            style={{ top: `${index * 4.25}rem`, zIndex: index + 1 }}
          >
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" />
              {msg.channel}
              <span className="ml-auto font-medium normal-case tracking-normal">{msg.meta}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-snug text-foreground">{msg.text}</p>
          </div>
        ))}
      </div>

      <div
        className={cn(
          'absolute inset-0 flex items-center transition-all duration-700 ease-out',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        )}
      >
        <LandingCard className="w-full border-primary/25 p-0 shadow-md ring-1 ring-primary/10">
          <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-2.5">
            <StatusToken color="green" label="Agente activo" />
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">WA · AI</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug text-foreground">
                  Seguimiento listo para Ana · AC-1042
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Botones · Confirmar / En progreso / Bloqueado
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
                <p className="font-semibold text-foreground">Canal</p>
                <p className="mt-0.5 text-muted-foreground">WhatsApp</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
                <p className="font-semibold text-foreground">Control</p>
                <p className="mt-0.5 text-muted-foreground">Confirmación</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
                <p className="font-semibold text-foreground">Tablero</p>
                <p className="mt-0.5 text-muted-foreground">Actualizado</p>
              </div>
            </div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              De chat disperso → canal operativo con IA
            </p>
          </div>
        </LandingCard>
      </div>
    </div>
  )
}

export function AgentProblemSection() {
  const items = [
    ['Seguimiento manual', 'Cada recordatorio vive en un chat distinto y se pierde el hilo.', 'Compromisos sin dueño visible'],
    ['Respuestas sin contexto', 'El equipo contesta sin ver estado, evidencia ni prioridad.', 'Decisiones a ciegas'],
    ['IA sin control', 'Automatizar sin confirmación genera miedo a “que escriba solo”.', 'Nadie adopta el canal'],
  ]

  return (
    <LandingSection
      id="problema"
      surface="muted"
      spacing="standard"
      withGrid
      seoDescription={AGENT_LANDING_SEO.sections.problema.description}
    >
      <LandingShell>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tokenColor="red">El costo de operar solo por chat</Eyebrow>
          <SectionTitle>
            WhatsApp ya es el canal del equipo. El problema es que no está conectado a la operación.
          </SectionTitle>
          <SectionLead className="mx-auto">
            Sin agente, el seguimiento depende de memoria. Sin confirmación humana, nadie confía en
            que una IA toque el tablero.
          </SectionLead>
        </div>

        <LandingCard className="mx-auto mt-9 max-w-6xl p-5 shadow-md ring-1 ring-border/30 sm:p-7">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-12">
            <div className="order-2 lg:order-1">
              <ChaosToAgentVisual />
            </div>
            <div className="order-1 lg:order-2">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Lo que parece “estar en WhatsApp” termina afectando la ejecución
              </p>
              <ul className="grid gap-2.5">
                {items.map(([title, copy, impact], index) => (
                  <li key={title} className="flex gap-3 rounded-xl border border-border/50 bg-muted/20 p-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-[10px] font-bold tabular-nums text-red-600">
                      0{index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{copy}</p>
                      <p className="mt-1.5 text-[11px] font-semibold text-red-600">Impacto: {impact}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Lo que cambia con el agente SCRUMBAN
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground sm:text-base">
                  El mismo WhatsApp, pero con contexto del tablero, propuestas claras y un paso de
                  confirmación antes de ejecutar cualquier escritura.
                </p>
              </div>
            </div>
          </div>
        </LandingCard>
      </LandingShell>
    </LandingSection>
  )
}

const cultureBefore = [
  'Recordatorios sueltos sin dueño',
  'Respuestas que no actualizan el tablero',
  'Dirección preguntando “¿en qué quedó?”',
  'Miedo a que la IA “haga de más”',
]

const cultureAfter = [
  'Follow-ups con botones y jobs',
  'Respuestas ligadas a la acción',
  'Bandeja unificada para operar',
  'Propuestas con confirmar / cancelar',
]

export function AgentCultureShiftSection() {
  return (
    <LandingSection
      id="cultura"
      surface="base"
      spacing="tight"
      seoDescription={AGENT_LANDING_SEO.sections.cultura.description}
    >
      <LandingShell className="max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tokenColor="green">Cambio de canal</Eyebrow>
          <SectionTitle>De chat informal a canal operativo con control humano.</SectionTitle>
          <SectionLead className="mx-auto">
            El agente no reemplaza al equipo: acelera el seguimiento y deja la decisión en quien
            opera.
          </SectionLead>
        </div>
        <div className="mt-9 grid overflow-hidden rounded-2xl border border-border/60 shadow-md md:grid-cols-2">
          <div className="bg-muted/35 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Antes</p>
            <div className="mt-5 space-y-3">
              {cultureBefore.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-foreground p-6 text-background sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
              Con el agente
            </p>
            <div className="mt-5 space-y-3">
              {cultureAfter.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-base font-semibold text-foreground">
          Cuando WhatsApp habla el idioma del tablero, el seguimiento deja de ser persecución.
        </p>
      </LandingShell>
    </LandingSection>
  )
}

export function AgentMidPageCTA() {
  return (
    <section id="diagnostico" className="border-b border-border/60 bg-foreground py-8 text-background">
      <AgentSectionSeo description={AGENT_LANDING_SEO.sections.diagnostico.description} />
      <LandingShell className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Demo del agente en tu operación
          </p>
          <h2 className="mt-2 text-balance text-xl font-semibold sm:text-2xl">
            Mira cómo se ve un follow-up con IA y confirmación humana.
          </h2>
        </div>
        <PrimaryCTA dark className="shrink-0">
          Agendar demo del agente
        </PrimaryCTA>
      </LandingShell>
    </section>
  )
}

const extraCapabilities = [
  {
    icon: MessageCircle,
    code: 'WA·001',
    title: 'WhatsApp operativo',
    copy: 'Asignación, follow-ups y cierre en el canal donde el equipo ya responde.',
  },
  {
    icon: Bot,
    code: 'AI·002',
    title: 'Agente con contexto',
    copy: 'Consulta acciones, prioridades y bloqueos con el mismo criterio del tablero.',
  },
  {
    icon: ShieldCheck,
    code: 'CTL·003',
    title: 'Confirmación humana',
    copy: 'Nada se escribe sin tu sí. Propuestas claras con confirmar o cancelar.',
  },
  {
    icon: Inbox,
    code: 'INB·004',
    title: 'Bandeja unificada',
    copy: 'Hilos, estados y respuesta manual cuando el operador necesita intervenir.',
  },
  {
    icon: Smartphone,
    code: 'EVD·005',
    title: 'Evidencia por chat',
    copy: 'Texto, foto o archivo quedan ligados a la acción como comentario.',
  },
] as const

export function AgentCapabilitiesSection() {
  return (
    <LandingSection
      id="capacidades"
      surface="muted"
      spacing="tight"
      withGrid
      seoDescription={AGENT_LANDING_SEO.sections.capacidades.description}
    >
      <LandingShell className="max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tokenColor="green">Capacidades del agente</Eyebrow>
          <SectionTitle>
            Un canal, un asistente y el mismo ciclo de ejecución.
          </SectionTitle>
          <SectionLead className="mx-auto">
            WhatsApp y el chat web no son módulos aparte: alimentan el tablero con control humano.
          </SectionLead>
        </div>

        <div className="relative mt-9 -mx-3 sm:mx-0">
          <div
            className="flex gap-3 overflow-x-auto scroll-smooth px-3 pb-2 snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible md:snap-none md:px-0 lg:grid-cols-5"
            aria-label="Capacidades del agente"
          >
            {extraCapabilities.map((cap) => {
              const Icon = cap.icon
              return (
                <div
                  key={cap.code}
                  className="w-[260px] shrink-0 snap-start rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md md:w-auto"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="mt-4 min-w-0">
                    <p className="text-sm font-semibold leading-snug text-foreground">{cap.title}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{cap.copy}</p>
                    <p className="mt-3 text-[9px] font-semibold tabular-nums tracking-wide text-muted-foreground">
                      {cap.code}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

const closeStats = [
  { value: 24, prefix: '', suffix: ' h', label: 'Ventana Meta respetada con plantillas' },
  { value: 1, prefix: '', suffix: ' tap', label: 'Para confirmar una propuesta del agente' },
  { value: 2, prefix: '', suffix: ' canales', label: 'Web + WhatsApp con la misma lógica' },
] as const

export function AgentCloseSection() {
  return (
    <>
      <LandingSection
        id="cierre"
        surface="inverse"
        spacing="standard"
        reveal
        seoDescription={AGENT_LANDING_SEO.sections.cierre.description}
      >
        <LandingShell className="max-w-6xl text-center">
          <div className="flex justify-center">
            <Eyebrow dark tokenColor="green">
              El resultado para operación
            </Eyebrow>
          </div>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-background sm:text-4xl lg:text-5xl">
            Seguimiento continuo,
            <br />
            <span className="text-primary">sin soltar el control.</span>
          </h2>
          <div className="mt-12 grid gap-10 border-t border-background/15 pt-10 sm:grid-cols-3 sm:gap-6">
            {closeStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl font-bold tabular-nums tracking-tight text-background sm:text-5xl">
                  {stat.prefix}
                  <CountUpInteger target={stat.value} suffix={stat.suffix} />
                </p>
                <p className="mt-3 text-sm leading-relaxed text-background/65">{stat.label}</p>
              </div>
            ))}
          </div>
        </LandingShell>
      </LandingSection>

      <LandingSection surface="base" spacing="tight" reveal withGrid>
        <LandingShell className="max-w-4xl">
          <PremiumCtaPanel>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
              Disponible · Demo del agente
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Tu equipo ya está en WhatsApp. Conecta el agente al tablero.
            </h2>
            <SectionLead dark className="mx-auto mt-4 max-w-2xl text-emerald-50/75">
              Consulta, propone, confirma y da seguimiento con la misma cultura de ejecución de
              SCRUMBAN.
            </SectionLead>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryCTA dark glow className="bg-foreground text-background hover:bg-foreground/90">
                Solicitar demo del agente
              </PrimaryCTA>
              <DemoAdvisorCTA className="border-white/20 bg-white text-foreground hover:bg-white/90" />
            </div>
            <CtaTrustRow
              dark
              className="mt-5 justify-center text-emerald-200/70"
              items={['Demo personalizada', 'Sin compromiso', 'Onboarding acompañado']}
            />
          </PremiumCtaPanel>
        </LandingShell>
      </LandingSection>
    </>
  )
}
