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
          <SectionTitle dark>Que se reporte no significa que esté resuelto.</SectionTitle>
          <SectionLead dark>
            Dirección distingue trabajo reportado de cumplimiento validado.
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
                    ? 'border-white/35 text-white'
                    : 'border-white/15 text-white/80'
                )}
              >
                {phase === 'verificado' ? 'Verificado' : 'Hecho'}
              </span>
            </div>

            <ul className="mt-5 space-y-2 text-sm text-white/80">
              <li>Responsable: {AGENT_STORY.owner.fullName}</li>
              <li>Evidencia recibida: {AGENT_STORY.evidenceFile}</li>
              <li>
                {phase === 'hecho'
                  ? 'Validación pendiente · Hecho aún no cierra el cumplimiento.'
                  : 'Validación realizada por un usuario autorizado.'}
              </li>
            </ul>

            <p className="mt-5 text-sm leading-relaxed text-white/50">
              {phase === 'hecho'
                ? 'La acción ya tiene evidencia. Todavía falta quien tiene permiso para verificar.'
                : 'Transición Hecho → Verificado. No es automática: alguien con permiso la confirma.'}
            </p>

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

type ContinuityTab = 'voz' | 'informe' | 'preparacion'

export function AgentContinuitySection() {
  const [tab, setTab] = useState<ContinuityTab>('preparacion')
  const [mailDecision, setMailDecision] = useState<'pending' | 'ready' | 'cancelled'>('pending')

  return (
    <LandingSection
      id="continuidad"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={AGENT_LANDING_SEO.sections.continuidad.description}
    >
      <LandingShell>
        <div className="max-w-3xl">
          <Eyebrow dark tokenColor="blue">
            06 · Continúa
          </Eyebrow>
          <SectionTitle dark>Habla de tu negocio. Prepara el siguiente paso.</SectionTitle>
          <SectionLead dark>
            Voz, informe y preparación en una misma continuidad. Gmail y Calendar solo con cuenta
            conectada.
          </SectionLead>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {(
            [
              ['voz', 'Voz'],
              ['informe', 'Informe'],
              ['preparacion', 'Preparación'],
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
          {tab === 'voz' ? (
            <div className="space-y-3 px-5 py-6 sm:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Entrevista por URL personal
              </p>
              <p className="text-sm leading-relaxed text-white/80">
                Conversación por voz sobre lo que esa persona puede ver. Al cerrar la sesión queda un
                resumen listo para el siguiente paso.
              </p>
              <p className="text-xs text-white/45">{AGENT_STORY_DEMO_LABEL} · sin llamada real.</p>
            </div>
          ) : null}

          {tab === 'informe' ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <p className="text-sm font-semibold text-white">Informe de la sesión de voz</p>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                  PDF · historial
                </span>
              </div>
              <div className="space-y-3 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Seguimiento · {AGENT_STORY.actionId}
                </p>
                <p className="text-sm leading-relaxed text-white/80">
                  {AGENT_STORY.owner.fullName} reportó el cierre de inventario. La evidencia quedó en
                  la acción. Pendiente: verificación de quien tiene permiso.
                </p>
              </div>
            </>
          ) : null}

          {tab === 'preparacion' ? (
            <div className="space-y-4 px-5 py-6 sm:px-6">
              <div className="ml-auto max-w-[95%] rounded-2xl rounded-br-md bg-white px-4 py-3 text-sm text-black">
                {AGENT_STORY.mailDraft.ask}
              </div>
              <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/85">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Enviardián
                </p>
                <p className="mt-2">{AGENT_STORY.mailDraft.reply}</p>
              </div>

              <div className="liquid-glass rounded-2xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Borrador · requiere Google Workspace conectado
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  Para: {AGENT_STORY.mailDraft.to}
                </p>
                <p className="mt-1 text-sm text-white/85">Asunto: {AGENT_STORY.mailDraft.subject}</p>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/55">
                  {AGENT_STORY.mailDraft.body}
                </p>
                {mailDecision === 'pending' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="h-10 rounded-full bg-white text-black hover:bg-white/90"
                      onClick={() => setMailDecision('ready')}
                    >
                      Dejar borrador listo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
                      onClick={() => setMailDecision('cancelled')}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-white/75">
                    {mailDecision === 'ready'
                      ? 'Borrador pendiente de tu revisión. No se envía solo.'
                      : 'Cancelado. No se preparó ningún correo.'}{' '}
                    <button
                      type="button"
                      className="font-semibold text-white underline-offset-2 hover:underline"
                      onClick={() => setMailDecision('pending')}
                    >
                      Reiniciar
                    </button>
                  </p>
                )}
              </div>
              <p className="text-xs text-white/45">
                Calendar y Gmail aparecen aquí solo como capacidades condicionadas a la conexión
                autorizada.
              </p>
            </div>
          ) : null}
        </div>
      </LandingShell>
    </LandingSection>
  )
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
            Conecta a dirección y a tu equipo en una misma dinámica de trabajo.
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
