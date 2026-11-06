{% raw %}
# Landing `/agente` — código completo para replicar

Documento generado desde el código fuente de `src/pages/agent/` y dependencias compartidas con `/producto`.
Ruta pública: `/agente` → `AgentLandingPage`.

## Índice de archivos

| Archivo | Rol |
|---|---|
| `AgentLandingPage.tsx` | Orquestador de la página |
| `AgentHero.tsx` | Nav + hero (WhatsApp + agente) |
| `AgentSections.tsx` | Problema, cultura, CTAs, capacidades, cierre |
| `AgentDemos.tsx` | Demos (WhatsApp, propuestas, canales) |
| `agentSeo.ts` + `AgentSeoHead.tsx` | SEO / JSON-LD |
| `ProductUI` / `ProductVisual` / `DemoRequest*` / tokens | Compartido con `/producto` |

## Stack y dependencias npm

- React + TypeScript + Tailwind CSS
- `react-router-dom` (ruta lazy `/agente`)
- `lucide-react` (iconos)
- `react-hook-form` + `zod` + `@hookform/resolvers` (formulario demo compartido)
- `clsx` + `tailwind-merge` (`cn`)
- `class-variance-authority` + Radix (`Button`, `Badge`, `Dialog`, `Input`, `Label`, `Select`)

## Ruta

```tsx
{
  path: '/agente',
  lazy: async () => {
    const { AgentLandingPage } = await import('@/pages/agent/AgentLandingPage')
    return { Component: AgentLandingPage }
  },
},
```

## Árbol de composición

```
DemoRequestProvider
├── AgentSeoHead
├── AgentHero (AgentNav + HeroAgentPreview)
├── AgentProblemSection
├── AgentCultureShiftSection
├── WhatsAppInAction       (AgentDemos)
├── AgentProposalsDemo     (AgentDemos)
├── AgentMidPageCTA
├── AgentChannelsDemo      (AgentDemos)
├── AgentCapabilitiesSection
├── AgentCloseSection
└── Footer
```

---

## Código fuente — `src/pages/agent/`

### `src/pages/agent/AgentDemos.tsx`

```tsx
/**
 * Demos locales de la landing del agente.
 * Estado en memoria: no llama APIs, no escribe en Supabase ni WhatsApp real.
 */
import { useState } from 'react'
import {
  Bot,
  Check,
  CheckCircle2,
  Clock,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Eyebrow,
  LandingCard,
  LandingSection,
  LandingShell,
  SectionLead,
  SectionTitle,
} from '@/pages/product/ProductUI'
import { ModuleMetaBadge, StatusPill } from '@/pages/product/ProductVisual'
import { AGENT_LANDING_SEO } from './agentSeo'

const FLOW_STEPS = [
  {
    eyebrow: 'Asignar',
    title: 'La acción llega por WhatsApp',
    copy: 'Al crear o asignar, el responsable recibe el compromiso con contexto.',
  },
  {
    eyebrow: 'Seguir',
    title: 'Follow-ups con botones',
    copy: 'Checkpoints programados: realizada, en progreso o bloqueada.',
  },
  {
    eyebrow: 'Evidencia',
    title: 'Resultado en el mismo hilo',
    copy: 'Texto, foto o archivo quedan como comentario de la acción.',
  },
  {
    eyebrow: 'Agente',
    title: 'Texto libre con confirmación',
    copy: 'El agente propone; tú confirmas antes de escribir en el tablero.',
  },
] as const

type WaMessage =
  | { id: string; kind: 'in'; text: string; time: string }
  | { id: string; kind: 'out'; text: string; time: string }
  | { id: string; kind: 'buttons'; options: string[] }
  | { id: string; kind: 'system'; text: string }

const initialThread: WaMessage[] = [
  {
    id: '1',
    kind: 'out',
    time: '09:02',
    text: 'SCRUMBAN · Nueva acción AC-1042\nValidar propuesta con Finanzas\nPrioridad Alta · Hoy 18:00',
  },
  {
    id: '2',
    kind: 'buttons',
    options: ['Recibida', 'Ver detalle'],
  },
  {
    id: '3',
    kind: 'in',
    time: '09:05',
    text: 'Recibida ✓',
  },
  {
    id: '4',
    kind: 'out',
    time: '12:00',
    text: 'Seguimiento AC-1042\n¿Cómo va Validar propuesta con Finanzas?',
  },
  {
    id: '5',
    kind: 'buttons',
    options: ['Realizada', 'En progreso', 'Bloqueada'],
  },
]

export function WhatsAppInAction() {
  const [thread, setThread] = useState<WaMessage[]>(initialThread)
  const [pressed, setPressed] = useState<string | null>(null)

  const onButton = (label: string) => {
    setPressed(label)
    setThread((current) => [
      ...current,
      { id: `in-${Date.now()}`, kind: 'in', time: '12:01', text: label },
      {
        id: `sys-${Date.now()}`,
        kind: 'system',
        text:
          label === 'Realizada'
            ? 'Estado actualizado · Se solicita evidencia de cierre'
            : label === 'Bloqueada'
              ? 'Marcada en retraso · El agente puede ayudar a desbloquear'
              : 'Queda en seguimiento · Próximo checkpoint programado',
      },
    ])
  }

  return (
    <LandingSection
      id="como-funciona"
      surface="depth"
      spacing="standard"
      withGrid
      seoDescription={AGENT_LANDING_SEO.sections.producto.description}
    >
      <LandingShell>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow tokenColor="green">WhatsApp en acción</Eyebrow>
          <SectionTitle>El compromiso vive en el canal donde el equipo ya responde.</SectionTitle>
          <SectionLead className="mx-auto">
            Asignación, follow-ups, evidencia y agente IA — con la misma trazabilidad del tablero.
          </SectionLead>
        </div>

        <div id="agente" className="mt-9 lg:mt-11">
          <div className="mx-auto grid max-w-6xl gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW_STEPS.map((step, index) => (
              <div key={step.eyebrow} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                    0{index + 1}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {step.eyebrow}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold leading-snug text-foreground">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.copy}</p>
              </div>
            ))}
          </div>

          <LandingCard className="mx-auto mt-6 max-w-lg overflow-hidden shadow-lg ring-1 ring-border/40">
            <div className="flex items-center gap-3 border-b border-border/50 bg-[#075E54] px-4 py-3 text-white">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15">
                <Bot className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">SCRUMBAN</p>
                <p className="text-[11px] text-white/75">Agente operativo · en línea</p>
              </div>
              <ModuleMetaBadge code="WA·DEMO" className="border-white/20 bg-white/10 text-white" />
            </div>

            <div className="max-h-[420px] space-y-2.5 overflow-y-auto bg-[#ECE5DD] p-4 dark:bg-muted/40">
              {thread.map((msg) => {
                if (msg.kind === 'system') {
                  return (
                    <div
                      key={msg.id}
                      className="mx-auto max-w-[90%] rounded-lg bg-background/90 px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground shadow-sm"
                    >
                      {msg.text}
                    </div>
                  )
                }
                if (msg.kind === 'buttons') {
                  return (
                    <div key={msg.id} className="flex flex-wrap justify-start gap-2 pl-1">
                      {msg.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          disabled={Boolean(pressed)}
                          onClick={() => onButton(option)}
                          className={cn(
                            'rounded-full border border-emerald-600/30 bg-card px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-200',
                            pressed === option && 'bg-emerald-600 text-white hover:bg-emerald-600'
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )
                }
                const inbound = msg.kind === 'in'
                return (
                  <div key={msg.id} className={cn('flex', inbound ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[82%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed shadow-sm',
                        inbound
                          ? 'rounded-br-sm bg-[#DCF8C6] text-foreground dark:bg-emerald-700 dark:text-white'
                          : 'rounded-bl-sm bg-card text-foreground'
                      )}
                    >
                      {msg.text}
                      <span className="mt-1 block text-right text-[9px] text-muted-foreground">
                        {msg.time}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2 border-t border-border/50 bg-card px-3 py-2.5">
              <Input
                readOnly
                value=""
                placeholder="Escribe un mensaje… (demo)"
                className="h-10 rounded-full border-border/60 bg-muted/30 text-sm"
              />
              <Button type="button" size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="border-t border-border/40 bg-muted/20 px-4 py-2 text-center text-[10px] text-muted-foreground">
              Solo demo · No envía WhatsApp real
            </p>
          </LandingCard>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

type ProposalStatus = 'pending' | 'confirmed' | 'cancelled'

export function AgentProposalsDemo() {
  const [status, setStatus] = useState<ProposalStatus>('pending')

  return (
    <LandingSection
      id="propuestas"
      surface="inverse"
      spacing="standard"
      seoDescription={AGENT_LANDING_SEO.sections.indicadores.description}
    >
      <LandingShell>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow dark tokenColor="green">
            Control humano
          </Eyebrow>
          <SectionTitle dark>El agente propone. Tú decides.</SectionTitle>
          <SectionLead dark className="mx-auto">
            Antes de crear o actualizar una acción, ves el resumen y confirmas o cancelas — en web o
            con botones de WhatsApp.
          </SectionLead>
        </div>

        <div className="mx-auto mt-7 flex max-w-4xl flex-wrap justify-center gap-2">
          {[
            ['Consultar', 'Lee el tablero sin escribir.'],
            ['Proponer', 'Arma la operación con campos claros.'],
            ['Confirmar', 'Un tap ejecuta o cancela.'],
          ].map(([title, copy], index) => (
            <div
              key={title}
              className="flex items-center gap-2 rounded-full border border-background/15 bg-background/[0.06] px-3.5 py-2 backdrop-blur-sm"
            >
              <span className="grid h-5 w-5 place-items-center rounded-md bg-emerald-400/15 text-[9px] font-bold text-emerald-300">
                0{index + 1}
              </span>
              <h3 className="text-xs font-semibold text-background">{title}</h3>
              <span className="hidden text-[11px] text-background/55 md:inline">· {copy}</span>
            </div>
          ))}
        </div>

        <LandingCard className="mx-auto mt-8 max-w-2xl overflow-hidden bg-card text-foreground shadow-xl">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/12 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Propuesta del agente</p>
                <p className="text-[11px] text-muted-foreground">Crear acción · pendiente de confirmación</p>
              </div>
            </div>
            <StatusPill
              tone={status === 'confirmed' ? 'green' : status === 'cancelled' ? 'neutral' : 'amber'}
            >
              {status === 'pending' ? 'Pendiente' : status === 'confirmed' ? 'Confirmada' : 'Cancelada'}
            </StatusPill>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl bg-muted/30 px-4 py-3 ring-1 ring-border/50">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
                Crear acción
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                Validar propuesta con Finanzas — responsable Ana Martínez, prioridad Alta, evidencia
                requerida, vencimiento hoy 18:00.
              </p>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  ['Título', 'Validar propuesta con Finanzas'],
                  ['Responsable', 'Ana Martínez'],
                  ['Prioridad', 'Alta'],
                  ['Evidencia', 'Correo de validación'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border/50 bg-background/70 px-3 py-2">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {status === 'pending' ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="h-11 flex-1 gap-2 rounded-full"
                  onClick={() => setStatus('confirmed')}
                >
                  <Check className="h-4 w-4" />
                  Confirmar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 gap-2 rounded-full"
                  onClick={() => setStatus('cancelled')}
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            ) : (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium',
                  status === 'confirmed'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : 'border-border/60 bg-muted/40 text-muted-foreground'
                )}
              >
                {status === 'confirmed' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <X className="h-4 w-4 shrink-0" />
                )}
                {status === 'confirmed'
                  ? 'Operación ejecutada en el tablero (demo local).'
                  : 'Propuesta descartada. El tablero no cambió.'}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-8 rounded-lg text-xs"
                  onClick={() => setStatus('pending')}
                >
                  Reiniciar demo
                </Button>
              </div>
            )}
            <p className="text-center text-[10px] text-muted-foreground">
              En WhatsApp: botones <code className="rounded bg-muted px-1">aiop:</code> o respuestas sí/no
            </p>
          </div>
        </LandingCard>
      </LandingShell>
    </LandingSection>
  )
}

const channelAnswers: Record<string, string> = {
  'Qué acciones rojas tengo abiertas?':
    'Tienes 2 rojas: AC-1042 Validar propuesta con Finanzas y AC-1038 Renovar contrato. ¿Quieres un plan para la primera?',
  'Prepara un seguimiento para Ana':
    'Listo. Propongo enviar follow-up AC-1042 a Ana con botones Realizada / En progreso / Bloqueada. ¿Confirmas?',
  'Qué quedó pendiente de evidencia?':
    'AC-1051 Revisar evidencia de entrega espera archivo o correo de validación antes de verificar.',
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export function AgentChannelsDemo() {
  const [channel, setChannel] = useState<'web' | 'whatsapp'>('web')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hola, soy tu asesor operativo. Puedo consultar el tablero y proponer escrituras con tu confirmación. ¿Qué atacamos?',
    },
  ])
  const [input, setInput] = useState('')

  const ask = (prompt: string) => {
    const answer =
      channelAnswers[prompt] ??
      'Con el contexto del tablero: te propongo el siguiente paso y espero tu confirmación antes de ejecutar.'
    setMessages((current) => [
      ...current,
      { role: 'user', content: prompt },
      { role: 'assistant', content: answer },
    ])
    setInput('')
  }

  return (
    <LandingSection
      id="canales"
      surface="depth"
      spacing="standard"
      withGrid
      seoDescription={AGENT_LANDING_SEO.sections.canales.description}
    >
      <LandingShell>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tokenColor="blue">Dos canales · un tablero</Eyebrow>
          <SectionTitle>Mismo agente en el asistente web y en WhatsApp.</SectionTitle>
          <SectionLead className="mx-auto">
            Elige el canal: la lógica de consulta, propuesta y confirmación es la misma.
          </SectionLead>
        </div>

        <div className="mx-auto mt-8 flex max-w-md rounded-full border border-border/60 bg-muted/30 p-1">
          {(
            [
              ['web', 'Asistente web', Bot],
              ['whatsapp', 'WhatsApp', MessageCircle],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setChannel(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition',
                channel === id
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <LandingCard className="mx-auto mt-6 max-w-3xl overflow-hidden shadow-lg ring-1 ring-border/40">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {channel === 'web' ? 'Asistente IA O2C' : 'WhatsApp · SCRUMBAN Agente'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {channel === 'web' ? 'Ruta /asistente-ia · contexto del tablero' : 'Cloud API · confirmación aiop'}
              </p>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Sparkles className="h-3 w-3 text-primary" />
              Demo
            </Badge>
          </div>

          <div className="flex min-h-[320px] flex-col bg-card">
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    message.role === 'user'
                      ? channel === 'whatsapp'
                        ? 'ml-auto rounded-br-md bg-emerald-600 text-white'
                        : 'ml-auto rounded-br-md bg-foreground text-background'
                      : 'mr-auto rounded-bl-md bg-muted text-foreground'
                  )}
                >
                  {message.content}
                </div>
              ))}
            </div>

            <div className="border-t border-border/50 bg-muted/10 px-4 py-3 sm:px-5">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {Object.keys(channelAnswers).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => ask(prompt)}
                    className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10px] font-medium text-foreground transition hover:bg-muted/60"
                  >
                    {prompt.length > 40 ? `${prompt.slice(0, 38)}…` : prompt}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={channel === 'web' ? 'Pregunta al asistente…' : 'Escribe por WhatsApp…'}
                  className="h-10 rounded-xl border-border/60 bg-background text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && input.trim()) ask(input.trim())
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  disabled={!input.trim()}
                  onClick={() => input.trim() && ask(input.trim())}
                  aria-label="Enviar"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Solo demo · No llama al asistente ni a Meta
              </p>
            </div>
          </div>
        </LandingCard>
      </LandingShell>
    </LandingSection>
  )
}
```

### `src/pages/agent/AgentHero.tsx`

```tsx
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
```

### `src/pages/agent/AgentLandingPage.tsx`

```tsx
import { DemoRequestProvider } from '@/pages/product/DemoRequestContext'
import { LandingShell, Logo } from '@/pages/product/ProductUI'
import { AgentChannelsDemo, AgentProposalsDemo, WhatsAppInAction } from './AgentDemos'
import { AgentHero } from './AgentHero'
import {
  AgentCapabilitiesSection,
  AgentCloseSection,
  AgentCultureShiftSection,
  AgentMidPageCTA,
  AgentProblemSection,
} from './AgentSections'
import { AgentSeoHead } from './AgentSeoHead'

export function AgentLandingPage() {
  return (
    <DemoRequestProvider>
      <AgentSeoHead />
      <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/20">
        <AgentHero />
        <main className="overflow-x-hidden">
          <AgentProblemSection />
          <AgentCultureShiftSection />
          <WhatsAppInAction />
          <AgentProposalsDemo />
          <AgentMidPageCTA />
          <AgentChannelsDemo />
          <AgentCapabilitiesSection />
          <AgentCloseSection />
        </main>
        <footer className="border-t border-border/60 bg-foreground py-8 text-background">
          <LandingShell className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Logo light />
            <p className="text-xs text-background/60">
              Agente IA operativo · WhatsApp con confirmación humana.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="/producto"
                className="text-xs font-semibold text-background/70 transition-colors hover:text-background"
              >
                Producto
              </a>
              <a
                href="/login"
                className="text-xs font-semibold text-background/70 transition-colors hover:text-background"
              >
                Iniciar sesión
              </a>
            </div>
          </LandingShell>
        </footer>
      </div>
    </DemoRequestProvider>
  )
}
```

### `src/pages/agent/AgentSections.tsx`

```tsx
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
```

### `src/pages/agent/agentSeo.ts`

```ts
/** Metadescripciones de la landing Agente IA + WhatsApp — fuente única para `<head>` y JSON-LD. */
export const AGENT_LANDING_SEO = {
  siteName: 'SCRUMBAN',
  title: 'SCRUMBAN Agente | IA operativa en web y WhatsApp',
  description:
    'Agente IA conectado al tablero y a WhatsApp: consulta, propone operaciones, pide confirmación y da seguimiento a compromisos sin perder trazabilidad.',
  keywords:
    'agente IA, WhatsApp operativo, asistente SCRUMBAN, seguimiento WhatsApp, confirmación de operaciones, chatbot operacional, bandeja WhatsApp',
  path: '/agente',
  sections: {
    inicio: {
      id: 'inicio',
      name: 'Agente operativo en WhatsApp',
      description:
        'Opera desde WhatsApp o el chat web con un agente que entiende el tablero: consulta, propone y confirma antes de ejecutar.',
    },
    problema: {
      id: 'problema',
      name: 'El costo de operar solo por chat',
      description:
        'Seguimientos manuales, respuestas perdidas y decisiones fuera de contexto. El agente convierte WhatsApp en canal operativo con trazabilidad.',
    },
    cultura: {
      id: 'cultura',
      name: 'De chat informal a canal con confirmación',
      description:
        'Pasa de mensajes sueltos a propuestas claras, botones de confirmación, evidencia y seguimiento programado en el mismo hilo.',
    },
    producto: {
      id: 'como-funciona',
      name: 'WhatsApp en acción',
      description:
        'Asignación, follow-ups con botones, evidencia y respuestas del agente IA en el flujo real de WhatsApp Cloud API.',
    },
    indicadores: {
      id: 'propuestas',
      name: 'Propuestas con control humano',
      description:
        'El agente propone crear o actualizar acciones; tú confirmas o cancelas. Nada se escribe en el tablero sin tu visto bueno.',
    },
    diagnostico: {
      id: 'diagnostico',
      name: 'Demo del agente',
      description:
        'Agenda una demo personalizada del agente IA en web y WhatsApp aplicada a tu operación.',
    },
    canales: {
      id: 'canales',
      name: 'Dos canales, un mismo tablero',
      description:
        'Chat web en /asistente-ia y WhatsApp bidireccional con la misma lógica operativa y el mismo contexto del tablero.',
    },
    capacidades: {
      id: 'capacidades',
      name: 'Capacidades del agente',
      description:
        'Consulta del tablero, propuestas con confirmación, seguimientos WhatsApp, bandeja unificada y evidencia adjunta.',
    },
    cierre: {
      id: 'cierre',
      name: 'Resultado para operación y dirección',
      description:
        'Seguimiento continuo sin perseguir pendientes: el agente ayuda a ejecutar y WhatsApp mantiene el compromiso vivo.',
    },
  },
} as const

export type AgentLandingSectionSeoKey = keyof typeof AGENT_LANDING_SEO.sections

export function getAgentLandingCanonicalUrl(path = AGENT_LANDING_SEO.path) {
  const base = import.meta.env.VITE_APP_URL?.replace(/\/$/, '') ?? 'https://scrumbanemx.vercel.app'
  return `${base}${path}`
}

export function getAgentLandingSectionUrl(sectionId: string) {
  return `${getAgentLandingCanonicalUrl()}#${sectionId}`
}
```

### `src/pages/agent/AgentSeoHead.tsx`

```tsx
import { useEffect } from 'react'
import {
  AGENT_LANDING_SEO,
  getAgentLandingCanonicalUrl,
  getAgentLandingSectionUrl,
} from './agentSeo'

const JSON_LD_ID = 'scrumban-agent-landing-jsonld'

function upsertMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = create()
    document.head.appendChild(element)
  }
  element.content = content
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }
  element.href = href
}

function buildJsonLd() {
  const url = getAgentLandingCanonicalUrl()
  const sections = Object.values(AGENT_LANDING_SEO.sections)

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: AGENT_LANDING_SEO.siteName,
        url,
        description: AGENT_LANDING_SEO.description,
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: AGENT_LANDING_SEO.title,
        description: AGENT_LANDING_SEO.description,
        isPartOf: { '@id': `${url}#website` },
        about: {
          '@type': 'SoftwareApplication',
          name: `${AGENT_LANDING_SEO.siteName} Agente`,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: AGENT_LANDING_SEO.description,
        },
        hasPart: sections.map((section) => ({
          '@type': 'WebPageElement',
          name: section.name,
          description: section.description,
          url: getAgentLandingSectionUrl(section.id),
        })),
      },
    ],
  }
}

/** Metadatos globales de la landing del agente (`<head>` + JSON-LD). */
export function AgentSeoHead() {
  useEffect(() => {
    const previousTitle = document.title
    const canonical = getAgentLandingCanonicalUrl()

    document.title = AGENT_LANDING_SEO.title

    upsertMeta(
      'meta[name="description"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'description'
        return meta
      },
      AGENT_LANDING_SEO.description
    )

    upsertMeta(
      'meta[name="keywords"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'keywords'
        return meta
      },
      AGENT_LANDING_SEO.keywords
    )

    upsertMeta(
      'meta[property="og:title"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:title')
        return meta
      },
      AGENT_LANDING_SEO.title
    )

    upsertMeta(
      'meta[property="og:description"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:description')
        return meta
      },
      AGENT_LANDING_SEO.description
    )

    upsertMeta(
      'meta[property="og:type"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:type')
        return meta
      },
      'website'
    )

    upsertMeta(
      'meta[property="og:url"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:url')
        return meta
      },
      canonical
    )

    upsertMeta(
      'meta[name="twitter:card"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:card'
        return meta
      },
      'summary_large_image'
    )

    upsertMeta(
      'meta[name="twitter:title"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:title'
        return meta
      },
      AGENT_LANDING_SEO.title
    )

    upsertMeta(
      'meta[name="twitter:description"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:description'
        return meta
      },
      AGENT_LANDING_SEO.description
    )

    upsertLink('canonical', canonical)

    let jsonLd = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null
    if (!jsonLd) {
      jsonLd = document.createElement('script')
      jsonLd.id = JSON_LD_ID
      jsonLd.type = 'application/ld+json'
      document.head.appendChild(jsonLd)
    }
    jsonLd.textContent = JSON.stringify(buildJsonLd())

    return () => {
      document.title = previousTitle
    }
  }, [])

  return null
}

/** Metadescripción accesible por sección. */
export function AgentSectionSeo({ description }: { description: string }) {
  return <p className="sr-only">{description}</p>
}
```

---

## Dependencias compartidas de `src/pages/product/`

### `src/pages/product/ProductUI.tsx`

```tsx
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
export type LandingSurface = 'base' | 'muted' | 'depth' | 'inverse'

const SURFACE_CLASS: Record<LandingSurface, string> = {
  base: 'bg-background',
  muted: 'border-y border-border/50 bg-muted/40',
  depth: 'bg-gradient-to-b from-muted/50 via-muted/20 to-background',
  inverse: 'border-y border-border/50 bg-foreground text-background',
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
```

### `src/pages/product/ProductVisual.tsx`

```tsx
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Rejilla sutil de fondo (producto vivo, estilo SaaS premium). */
export function LandingGridPattern({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage: `
          linear-gradient(to right, hsl(var(--border) / 0.35) 1px, transparent 1px),
          linear-gradient(to bottom, hsl(var(--border) / 0.35) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse 85% 70% at 50% 40%, black 20%, transparent 75%)',
      }}
      aria-hidden
    />
  )
}

/** Anillos orbitales decorativos (hub de módulos). */
export function LandingOrbitRings({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center', className)} aria-hidden>
      <div className="h-[min(520px,90vw)] w-[min(520px,90vw)] rounded-full border border-primary/10" />
      <div className="absolute h-[min(380px,70vw)] w-[min(380px,70vw)] rounded-full border border-primary/15" />
      <div className="absolute h-[min(240px,50vw)] w-[min(240px,50vw)] rounded-full border border-dashed border-primary/20" />
    </div>
  )
}

/** Etiqueta técnica de módulo (OPS·KPI·001). */
export function ModuleMetaBadge({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/[0.07] px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300',
        className
      )}
    >
      {code}
    </span>
  )
}

/** Núcleo operativo SCRUMBAN (motivo tipo “elemento” anclado al semáforo). */
export function OperationalCoreBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex aspect-square w-28 flex-col items-center justify-center rounded-2xl',
        'border border-emerald-500/30 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg shadow-emerald-900/25',
        className
      )}
    >
      <span className="absolute left-2.5 top-2.5 text-[10px] font-bold opacity-80">OPS</span>
      <span className="text-3xl font-black tracking-tight">SB</span>
      <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] opacity-90">
        SCRUMBAN
      </span>
      <span className="absolute bottom-2.5 flex gap-1">
        <i className="h-1.5 w-1.5 rounded-full bg-red-400" />
        <i className="h-1.5 w-1.5 rounded-full bg-amber-300" />
        <i className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
      </span>
    </div>
  )
}

export function ModuleFeatureCard({
  icon: Icon,
  code,
  title,
  description,
  footer,
  className,
}: {
  icon: LucideIcon
  code: string
  title: string
  description: string
  footer?: ReactNode
  className?: string
}) {
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col rounded-2xl border border-emerald-500/20 bg-card p-5',
        'shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-emerald-500/35 hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <ModuleMetaBadge code={code} />
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      {footer ? <div className="mt-4 border-t border-border/50 pt-4">{footer}</div> : null}
    </article>
  )
}

/** Pills de etapas de flujo (Kanban / pipeline). */
export function WorkflowStagePills({
  stages,
}: {
  stages: readonly { step: string; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {stages.map((stage) => (
        <span
          key={stage.step}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-2 py-1 text-[10px] font-semibold text-foreground"
        >
          <span className="text-emerald-600 dark:text-emerald-400">{stage.step}</span>
          {stage.label}
        </span>
      ))}
    </div>
  )
}

/** Panel CTA premium (gradiente oscuro, estilo referencia Nexo). */
export function PremiumCtaPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-emerald-800/40 sm:rounded-[2rem]',
        'bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950',
        'px-6 py-12 text-center shadow-2xl shadow-emerald-950/30 sm:px-10 sm:py-14',
        className
      )}
    >
      <LandingGridPattern className="opacity-[0.18]" />
      <div
        className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  )
}

/** Badge de estado en listas (ROJO / BLOQUEADO / EN CURSO). */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'red' | 'amber' | 'green' | 'neutral'
  children: ReactNode
}) {
  const tones = {
    red: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
    neutral: 'border-border/60 bg-muted/50 text-muted-foreground',
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tones[tone]
      )}
    >
      {children}
    </span>
  )
}
```

### `src/pages/product/DemoRequestContext.tsx`

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DemoRequestDialog } from './DemoRequestDialog'

type DemoRequestContextValue = {
  openDemoRequest: () => void
}

const DemoRequestContext = createContext<DemoRequestContextValue | null>(null)

export function DemoRequestProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openDemoRequest = useCallback(() => setOpen(true), [])

  const value = useMemo(() => ({ openDemoRequest }), [openDemoRequest])

  return (
    <DemoRequestContext.Provider value={value}>
      {children}
      <DemoRequestDialog open={open} onOpenChange={setOpen} />
    </DemoRequestContext.Provider>
  )
}

export function useDemoRequest() {
  const context = useContext(DemoRequestContext)
  if (!context) {
    throw new Error('useDemoRequest debe usarse dentro de DemoRequestProvider')
  }
  return context
}
```

### `src/pages/product/DemoRequestDialog.tsx`

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  buildDemoMailto,
  demoNeedOptions,
  demoRequestSchema,
  demoTeamSizeOptions,
  type DemoRequestValues,
} from './demoRequest.types'

async function submitDemoRequest(values: DemoRequestValues) {
  const response = await fetch('/api/demo-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  if (!response.ok) {
    throw new Error('submit_failed')
  }
}

export function DemoRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [success, setSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm<DemoRequestValues>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      company: '',
      teamSize: '16-50',
      need: 'visibilidad',
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = form

  const teamSize = watch('teamSize')
  const need = watch('need')

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      window.setTimeout(() => {
        setSuccess(false)
        setSubmitError(null)
        reset()
      }, 200)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      await submitDemoRequest(values)
      setSuccess(true)
    } catch {
      try {
        window.location.href = buildDemoMailto(values)
        setSuccess(true)
      } catch {
        setSubmitError('No pudimos enviar la solicitud. Escríbenos a demo@scrumban.mx')
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="border-b border-border/60 bg-gradient-to-br from-muted/40 via-background to-primary/[0.04] px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Solicitar demo
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Cuatro datos. Te contactamos en menos de 24 h.
            </DialogDescription>
          </DialogHeader>
        </div>

        {success ? (
          <div className="space-y-4 px-5 py-8 text-center sm:px-6">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <p className="text-base font-semibold text-foreground">Solicitud recibida</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Un asesor revisará tu caso y te escribirá pronto para agendar la demo.
              </p>
            </div>
            <Button
              type="button"
              className="w-full rounded-full"
              onClick={() => handleOpenChange(false)}
            >
              Entendido
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 px-5 py-5 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="demo-name">Nombre</Label>
                <Input
                  id="demo-name"
                  autoComplete="name"
                  placeholder="Ana Martínez"
                  className="h-10 rounded-lg"
                  {...register('name')}
                />
                {errors.name ? (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="demo-email">Email corporativo</Label>
                <Input
                  id="demo-email"
                  type="email"
                  autoComplete="email"
                  placeholder="ana@empresa.com"
                  className="h-10 rounded-lg"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="demo-company">Empresa</Label>
              <Input
                id="demo-company"
                autoComplete="organization"
                placeholder="Nombre de la organización"
                className="h-10 rounded-lg"
                {...register('company')}
              />
              {errors.company ? (
                <p className="text-xs text-destructive">{errors.company.message}</p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tamaño del equipo</Label>
                <Select
                  value={teamSize}
                  onValueChange={(value) =>
                    setValue('teamSize', value as DemoRequestValues['teamSize'], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {demoTeamSizeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>¿Qué necesitas?</Label>
                <Select
                  value={need}
                  onValueChange={(value) =>
                    setValue('need', value as DemoRequestValues['need'], { shouldValidate: true })
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {demoNeedOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}

            <Button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'h-11 w-full gap-2 rounded-full text-sm font-semibold shadow-lg shadow-primary/20'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Enviando…
                </>
              ) : (
                <>
                  Enviar solicitud
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Sin compromiso · Demo personalizada · Respuesta en 24 h
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

### `src/pages/product/demoRequest.types.ts`

```ts
import { z } from 'zod'

export const demoTeamSizeOptions = [
  { value: '1-15', label: '1–15 personas' },
  { value: '16-50', label: '16–50 personas' },
  { value: '51-200', label: '51–200 personas' },
  { value: '200+', label: '200+ personas' },
] as const

export const demoNeedOptions = [
  { value: 'visibilidad', label: 'Visibilidad para dirección' },
  { value: 'seguimiento', label: 'Seguimiento de compromisos' },
  { value: 'indicadores', label: 'Indicadores / OKRs' },
  { value: 'comunicacion', label: 'Comunicación entre equipos' },
] as const

export const demoRequestSchema = z.object({
  name: z.string().trim().min(2, 'Indica tu nombre'),
  email: z.string().trim().email('Email corporativo válido'),
  company: z.string().trim().min(2, 'Indica tu empresa'),
  teamSize: z.enum(['1-15', '16-50', '51-200', '200+']),
  need: z.enum(['visibilidad', 'seguimiento', 'indicadores', 'comunicacion']),
})

export type DemoRequestValues = z.infer<typeof demoRequestSchema>

export function demoNeedLabel(value: DemoRequestValues['need']) {
  return demoNeedOptions.find((option) => option.value === value)?.label ?? value
}

export function demoTeamSizeLabel(value: DemoRequestValues['teamSize']) {
  return demoTeamSizeOptions.find((option) => option.value === value)?.label ?? value
}

export function buildDemoMailto(values: DemoRequestValues) {
  const subject = encodeURIComponent(`Demo SCRUMBAN — ${values.company}`)
  const body = encodeURIComponent(
    [
      'Hola, me gustaría conocer SCRUMBAN.',
      '',
      `Nombre: ${values.name}`,
      `Email: ${values.email}`,
      `Empresa: ${values.company}`,
      `Tamaño del equipo: ${demoTeamSizeLabel(values.teamSize)}`,
      `Necesidad principal: ${demoNeedLabel(values.need)}`,
    ].join('\n')
  )
  return `mailto:demo@scrumban.mx?subject=${subject}&body=${body}`
}
```

### `src/pages/product/StatusToken.tsx`

```tsx
import { cn } from '@/lib/utils'

export type StatusColor = 'red' | 'yellow' | 'green' | 'blue'

interface StatusTokenProps {
  color?: StatusColor
  label?: string
  size?: 'sm' | 'md'
  /** Marca de agua sutil (nav / decoración). */
  watermark?: boolean
  className?: string
  pulse?: boolean
}

const COLOR_MAP: Record<StatusColor, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  blue: 'bg-blue-600',
}

/** Semáforo operativo — motivo visual recurrente de la landing SCRUMBAN. */
export function StatusToken({
  color = 'blue',
  label,
  size = 'sm',
  watermark = false,
  className,
  pulse = true,
}: StatusTokenProps) {
  const dimension = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2',
        watermark && 'pointer-events-none select-none opacity-40',
        className
      )}
    >
      <span
        className={cn(
          'shrink-0 rounded-full',
          dimension,
          COLOR_MAP[color],
          pulse && 'animate-pulse'
        )}
        aria-hidden
      />
      {label ? (
        <span
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wider',
            watermark ? 'text-muted-foreground' : 'text-primary'
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  )
}

/** Trio semáforo como marca de agua (rojo · amarillo · verde). */
export function StatusTokenMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      aria-hidden
      title="Semáforo operativo"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500/70" />
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
    </span>
  )
}
```

### `src/pages/product/RevealSection.tsx`

```tsx
import type { ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/utils'

export function RevealSection({
  children,
  className,
  threshold = 0.15,
}: {
  children: ReactNode
  className?: string
  threshold?: number
}) {
  const { ref, inView } = useInView(threshold)

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
        inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        className
      )}
    >
      {children}
    </div>
  )
}
```

### `src/pages/product/CountUpValue.tsx`

```tsx
import { cn } from '@/lib/utils'
import { useCountUp, useCountUpDecimal } from '@/hooks/useCountUp'

export function CountUpInteger({
  target,
  suffix = '',
  className,
}: {
  target: number
  suffix?: string
  className?: string
}) {
  const { ref, value } = useCountUp(target)
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {value}
      {suffix}
    </span>
  )
}

export function CountUpDecimal({
  target,
  suffix = '',
  className,
}: {
  target: number
  suffix?: string
  className?: string
}) {
  const { ref, value } = useCountUpDecimal(target)
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}
```

---

## Dependencias mínimas (hooks / spacing / utils)

### `src/hooks/useInView.ts`

```ts
import { useEffect, useRef, useState } from 'react'

/** Observa entrada al viewport una sola vez (para reveals de scroll). */
export function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, inView }
}
```

### `src/hooks/useCountUp.ts`

```ts
import { useEffect, useState } from 'react'
import { useInView } from './useInView'

export function useCountUp(target: number, duration = 1200, threshold = 0.4) {
  const { ref, inView } = useInView(threshold)
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(target * eased))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [inView, target, duration])

  return { ref, value, inView }
}

/** Contador con un decimal (ej. 4.2 días). */
export function useCountUpDecimal(target: number, duration = 1200, threshold = 0.4) {
  const { ref, inView } = useInView(threshold)
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(target * eased * 10) / 10)
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [inView, target, duration])

  return { ref, value, inView }
}
```

### `src/lib/spacing.ts`

```ts
/** Escala de ritmo vertical de la landing — una sola sección usa `climax`. */
export const SECTION_SPACING = {
  tight: 'py-12 md:py-16',
  standard: 'py-16 md:py-20',
  hero: 'pt-20 pb-16 md:pt-28 md:pb-20',
  climax: 'py-24 md:py-32',
} as const

export type SectionSpacing = keyof typeof SECTION_SPACING
```

### `src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## Componentes UI y theme

### `src/components/ui/button.tsx`

```tsx
import * as React from "react"

import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

### `src/components/ui/badge.tsx`

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
        success:
          "border-transparent bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/25 dark:text-emerald-950",
        muted:
          "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

### `src/components/ui/dialog.tsx`

```tsx
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showClose?: boolean
  }
>(({ className, children, showClose = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      {showClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, id: _id, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
```

### `src/components/ui/input.tsx`

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
```

### `src/components/ui/label.tsx`

```tsx
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
```

### `src/components/ui/select.tsx`

```tsx
import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-[100] max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}
```

### `src/styles/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Modo claro */
    --background: 220 20% 97%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;
    --primary: 221 83% 53%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 14% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted: 220 14% 96%;
    --muted-foreground: 220 9% 46%;
    --accent: 221 83% 53%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 221 83% 53%;
    --radius: 0.5rem;
    --card-radius: calc(var(--radius) - 2px);

    /* Semáforo KPI */
    --semaforo-verde: 142 71% 45%;
    --semaforo-amarillo: 38 92% 50%;
    --semaforo-rojo: 0 84% 60%;

    /* Estados de acciones */
    --status-pendiente: 220 9% 46%;
    --status-hoy: 217 91% 60%;
    --status-ejecucion: 262 83% 58%;
    --status-bloqueado: 0 84% 60%;
    --status-hecho: 142 71% 45%;
    --status-verificado: 158 64% 52%;

    /* Gradientes (stops para usar con linear-gradient) */
    --gradient-primary: linear-gradient(
      135deg,
      hsl(221 83% 53%),
      hsl(262 83% 58%)
    );
    --gradient-success: linear-gradient(
      135deg,
      hsl(142 71% 45%),
      hsl(158 64% 52%)
    );
    --gradient-warning: linear-gradient(
      135deg,
      hsl(38 92% 50%),
      hsl(48 96% 53%)
    );
    --gradient-danger: linear-gradient(
      135deg,
      hsl(0 84% 60%),
      hsl(350 84% 65%)
    );
    --gradient-dark: linear-gradient(
      180deg,
      hsl(222 47% 8%),
      hsl(222 47% 4%)
    );

    /* Sidebar (Dark Premium) */
    --sidebar-background: 222 47% 11%;
    --sidebar-foreground: 220 14% 96%;
    --sidebar-primary: 221 83% 53%;
    --sidebar-accent: 220 26% 18%;
  }

  .dark {
    --background: 222 47% 8%;
    --foreground: 220 14% 96%;
    --card: 222 47% 11%;
    --card-foreground: 220 14% 96%;
    --popover: 222 47% 11%;
    --popover-foreground: 220 14% 96%;
    --primary: 217 91% 60%;
    --primary-foreground: 222 47% 11%;
    --secondary: 220 26% 14%;
    --secondary-foreground: 220 14% 96%;
    --muted: 220 26% 14%;
    --muted-foreground: 220 9% 60%;
    --accent: 220 26% 18%;
    --accent-foreground: 220 14% 96%;
    --destructive: 0 62% 50%;
    --destructive-foreground: 220 14% 96%;
    --border: 220 26% 18%;
    --input: 220 26% 18%;
    --ring: 217 91% 60%;

    /* Sidebar en dark mantiene el mismo estilo premium */
    --sidebar-background: 222 47% 11%;
    --sidebar-foreground: 220 14% 96%;
    --sidebar-primary: 217 91% 60%;
    --sidebar-accent: 220 26% 18%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}

@layer components {
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] input,
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] textarea:not([data-accion-field-editable='true']),
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] select,
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] [role='combobox'],
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] [role='radio'],
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] [role='button'],
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] button:not([aria-expanded]) {
    pointer-events: none;
    cursor: default;
  }

  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] input,
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] textarea:not([data-accion-field-editable='true']),
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] [role='combobox'],
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] button:not([aria-expanded]) {
    opacity: 0.7;
  }
}
```

---

## Notas de réplica

1. Los demos (`AgentDemos`) son 100% locales: no llaman Meta, Gemini ni Supabase.
2. Los CTAs reutilizan `DemoRequestProvider` / `DemoRequestDialog` de `/producto`.
3. El shell visual (`LandingShell`, `Eyebrow`, `PrimaryCTA`, etc.) vive en `ProductUI`.
4. Alias `@/` → `src/`.
5. Endpoint opcional del formulario: `POST /api/demo-request` (fallback `mailto:demo@scrumban.mx`).
6. Enlace cruzado en nav/footer hacia `/producto`.
{% endraw %}
