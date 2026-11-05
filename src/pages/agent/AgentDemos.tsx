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
