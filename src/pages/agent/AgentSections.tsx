import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  CtaTrustRow,
  Eyebrow,
  LandingSection,
  LandingShell,
  PrimaryCTA,
  SectionLead,
  SectionTitle,
} from '@/pages/product/ProductUI'
import { AGENT_STORY, AGENT_STORY_DEMO_LABEL } from './agentStory'
import { AGENT_LANDING_SEO } from './agentSeo'

type VerifyPhase = 'hecho' | 'verificado'

export function AgentControlSection() {
  const [phase, setPhase] = useState<VerifyPhase>('hecho')

  return (
    <LandingSection
      id="verificacion"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={AGENT_LANDING_SEO.sections.verificacion.description}
    >
      <LandingShell>
        <div className="max-w-3xl">
          <Eyebrow dark tokenColor="red">
            05 · Verifica
          </Eyebrow>
          <SectionTitle dark>No solo sabes qué se reportó. Sabes qué se cumplió.</SectionTitle>
          <SectionLead dark>
            Evidencias, historial y validación autorizada. Hecho no cierra el cumplimiento.
          </SectionLead>
        </div>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex flex-wrap gap-2 sm:flex-col sm:flex-nowrap">
            <button
              type="button"
              onClick={() => setPhase('hecho')}
              className={cn(
                'agent-chip rounded-2xl px-4 py-3 text-left text-sm font-semibold transition',
                phase === 'hecho' ? 'agent-chip--active' : undefined
              )}
            >
              Reportada como Hecho
            </button>
            <button
              type="button"
              onClick={() => setPhase('verificado')}
              className={cn(
                'agent-chip rounded-2xl px-4 py-3 text-left text-sm font-semibold transition',
                phase === 'verificado' ? 'agent-chip--active' : undefined
              )}
            >
              Verificada por quien tiene permiso
            </button>
          </div>

          <div className="liquid-glass rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  {AGENT_STORY.actionId} · {AGENT_STORY_DEMO_LABEL}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">{AGENT_STORY.proposal.title}</h3>
              </div>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                  phase === 'verificado'
                    ? 'border-white/40 bg-white text-black'
                    : 'border-amber-200/40 bg-amber-400/15 text-amber-100'
                )}
              >
                {phase === 'verificado' ? 'Verificado' : 'Hecho'}
              </span>
            </div>

            <ul className="mt-5 space-y-2 text-sm text-white/80">
              <li>Responsable: {AGENT_STORY.owner.fullName}</li>
              <li>Evidencia: {AGENT_STORY.evidenceFile}</li>
              <li>Checkpoints: no solicitados en esta acción</li>
              <li>
                {phase === 'hecho'
                  ? 'Reportada como Hecho · cumplimiento aún sin validar.'
                  : 'Validada por un usuario autorizado · cumplimiento cerrado.'}
              </li>
            </ul>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Historial
              </p>
              <ul className="mt-2 space-y-1.5">
                {AGENT_STORY.verification.history.map((line) => (
                  <li key={line} className="text-xs leading-relaxed text-white/60">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {phase === 'hecho' ? (
              <Button
                type="button"
                className="mt-4 h-10 rounded-full bg-white text-black hover:bg-white/90"
                onClick={() => setPhase('verificado')}
              >
                Verificar
              </Button>
            ) : (
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-white underline-offset-2 hover:underline"
                onClick={() => setPhase('hecho')}
              >
                Volver a Hecho
              </button>
            )}
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

type AssistantTab = 'chat' | 'pdf' | 'compartir'

export function AgentAssistantSection() {
  const [tab, setTab] = useState<AssistantTab>('chat')

  return (
    <LandingSection
      id="asistente"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={AGENT_LANDING_SEO.sections.asistente.description}
    >
      <LandingShell>
        <div className="max-w-3xl">
          <Eyebrow dark tokenColor="blue">
            06 · Conserva
          </Eyebrow>
          <SectionTitle dark>Habla de tu empresa. Conserva cada acuerdo.</SectionTitle>
          <SectionLead dark>
            Chat, resumen de sesión e informe PDF. Distinto al emulador del inicio: aquí queda el
            registro.
          </SectionLead>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {(
            [
              ['chat', 'Chat'],
              ['pdf', 'Resumen PDF'],
              ['compartir', 'Compartir'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'agent-chip rounded-full px-3 py-2 text-sm font-semibold',
                tab === id ? 'agent-chip--active' : undefined
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="liquid-glass mt-6 overflow-hidden rounded-2xl">
          {tab === 'chat' ? (
            <div className="space-y-3 px-5 py-6 sm:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Chat · {AGENT_STORY_DEMO_LABEL}
              </p>
              {AGENT_STORY.assistant.chat.map((msg) => (
                <div
                  key={msg.text}
                  className={cn(
                    'max-w-[92%] rounded-2xl px-4 py-3 text-sm',
                    msg.role === 'user'
                      ? 'ml-auto rounded-br-md bg-white text-black'
                      : 'rounded-bl-md border border-white/10 bg-white/[0.04] text-white/85'
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                      Enviardián
                    </p>
                  ) : null}
                  {msg.text}
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'pdf' ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <p className="text-sm font-semibold text-white">Informe de sesión</p>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                  PDF · historial
                </span>
              </div>
              <div className="space-y-3 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Caso · {AGENT_STORY.actionId}
                </p>
                <p className="text-sm leading-relaxed text-white/80">
                  {AGENT_STORY.assistant.sessionSummary}
                </p>
              </div>
            </>
          ) : null}

          {tab === 'compartir' ? (
            <div className="space-y-3 px-5 py-6 sm:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                WhatsApp · cuando esté permitido
              </p>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/80">
                {AGENT_STORY.assistant.shareNote}
              </div>
              <p className="text-xs text-white/45">
                Simulación. No envía mensajes reales desde la landing.
              </p>
            </div>
          ) : null}
        </div>
      </LandingShell>
    </LandingSection>
  )
}

export function AgentIntegrationsSection() {
  const [mailState, setMailState] = useState<'pending' | 'ready' | 'cancelled'>('pending')
  const [calState, setCalState] = useState<'pending' | 'ready' | 'cancelled'>('pending')

  return (
    <LandingSection
      id="integraciones"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={AGENT_LANDING_SEO.sections.integraciones.description}
    >
      <LandingShell>
        <div className="max-w-3xl">
          <Eyebrow dark tokenColor="green">
            07 · Prepara
          </Eyebrow>
          <SectionTitle dark>De la conversación a tener el siguiente paso listo.</SectionTitle>
          <SectionLead dark>
            Gmail y Calendar con cuenta conectada. Borradores y propuestas; nada se envía ni se crea
            solo.
          </SectionLead>
        </div>

        <div className="mt-8 grid items-start gap-4 lg:grid-cols-2">
          <div className="liquid-glass rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Gmail · borrador
              </p>
              <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                {mailState === 'ready' ? 'Listo' : 'Sin enviar'}
              </span>
            </div>
            <p className="mt-4 text-sm font-semibold text-white">Para: {AGENT_STORY.mailDraft.to}</p>
            <p className="mt-1 text-sm text-white/80">Asunto: {AGENT_STORY.mailDraft.subject}</p>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/55">
              {AGENT_STORY.mailDraft.body}
            </p>
            {mailState === 'pending' ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-10 rounded-full bg-white text-black hover:bg-white/90"
                  onClick={() => setMailState('ready')}
                >
                  Dejar borrador listo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
                  onClick={() => setMailState('cancelled')}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/70">
                {mailState === 'ready'
                  ? 'Borrador pendiente de tu revisión. No se envía solo.'
                  : 'Cancelado. No se preparó el correo.'}{' '}
                <button
                  type="button"
                  className="font-semibold text-white underline-offset-2 hover:underline"
                  onClick={() => setMailState('pending')}
                >
                  Reiniciar
                </button>
              </p>
            )}
          </div>

          <div className="liquid-glass rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                Calendar · propuesta
              </p>
              <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                {calState === 'ready' ? 'Lista' : 'Sin crear'}
              </span>
            </div>
            <p className="mt-4 text-lg font-semibold text-white">{AGENT_STORY.calendarDraft.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>{AGENT_STORY.calendarDraft.when}</li>
              <li>Asistentes: {AGENT_STORY.calendarDraft.attendees}</li>
            </ul>
            <p className="mt-3 text-xs text-white/45">{AGENT_STORY.calendarDraft.note}</p>
            {calState === 'pending' ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-10 rounded-full bg-white text-black hover:bg-white/90"
                  onClick={() => setCalState('ready')}
                >
                  Confirmar propuesta
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
                  onClick={() => setCalState('cancelled')}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-white/70">
                {calState === 'ready'
                  ? 'Propuesta confirmada en este ejemplo. En producto el evento no existe hasta tu sí.'
                  : 'Cancelado. No se creó el evento.'}{' '}
                <button
                  type="button"
                  className="font-semibold text-white underline-offset-2 hover:underline"
                  onClick={() => setCalState('pending')}
                >
                  Reiniciar
                </button>
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-white/45">
          Requiere Google Workspace conectado y permisos. {AGENT_STORY_DEMO_LABEL}.
        </p>
      </LandingShell>
    </LandingSection>
  )
}

/** @deprecated Prefer AgentAssistantSection + AgentIntegrationsSection */
export function AgentContinuitySection() {
  return <AgentAssistantSection />
}

export function AgentCloseSection() {
  return (
    <LandingSection
      id="demostracion"
      surface="transparent"
      className="home-post__section"
      spacing="tight"
      reveal
      seoDescription={AGENT_LANDING_SEO.sections.demostracion.description}
    >
      <LandingShell className="max-w-4xl">
        <div className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 text-center md:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
            Demostración
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
            Más claridad para decidir. Más seguimiento para ejecutar.
          </h2>
          <SectionLead dark className="mx-auto mt-4 max-w-2xl text-white/60">
            Descubre cómo conectar dirección, responsables y seguimiento en tu empresa.
          </SectionLead>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCTA dark glow className="bg-white text-black hover:bg-white/90">
              Solicitar demostración
            </PrimaryCTA>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 min-h-11 rounded-full border-white/25 bg-transparent px-6 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
            >
              <a href="#visibilidad">Probar Enviardián</a>
            </Button>
          </div>
          <CtaTrustRow
            dark
            className="mt-5 justify-center text-white/45"
            items={['Demo con tu operación', 'Sin compromiso', 'Datos de ejemplo, no los tuyos']}
          />
        </div>
      </LandingShell>
    </LandingSection>
  )
}
