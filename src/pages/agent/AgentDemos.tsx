/**
 * Demos locales de la landing comercial.
 * Narrativa CEO · escenario AC-1038 · liquid-glass oscuro.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Eyebrow,
  LandingSection,
  LandingShell,
  SectionLead,
  SectionTitle,
} from '@/pages/product/ProductUI'
import {
  AGENT_STORY,
  AGENT_STORY_DEMO_LABEL,
  agentStoryFridayLabel,
} from './agentStory'
import { AGENT_LANDING_SEO } from './agentSeo'

type Reply = 'proceso' | 'apoyo' | 'realizada' | 'evidencia'

const boardCopy: Record<
  Reply | 'inicial',
  { label: string; detail: string }
> = {
  inicial: {
    label: 'Avisada',
    detail:
      'Aviso autorizado enviado. Carlos aún no responde; el tablero ya muestra la acción pendiente.',
  },
  proceso: {
    label: 'En ejecución',
    detail: 'Carlos reportó avance en WhatsApp. Scrumban refleja el mismo estado para dirección.',
  },
  apoyo: {
    label: 'Requiere apoyo',
    detail: 'Carlos pidió apoyo. El bloqueo queda visible; la acción no se da por cerrada.',
  },
  realizada: {
    label: 'Hecho',
    detail: 'Reportada como Hecho. Todavía no está verificada: falta la evidencia.',
  },
  evidencia: {
    label: 'Por verificar',
    detail: 'La evidencia quedó en la acción. Verificar corresponde a quien tiene permiso.',
  },
}

export function TeamWhatsAppDemo() {
  const [reply, setReply] = useState<Reply | 'inicial'>('inicial')
  const board = boardCopy[reply]

  return (
    <LandingSection
      id="whatsapp"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={AGENT_LANDING_SEO.sections.whatsapp.description}
    >
      <LandingShell>
        <div className="max-w-3xl">
          <Eyebrow dark tokenColor="green">
            04 · Sigue
          </Eyebrow>
          <SectionTitle dark>El seguimiento sucede donde trabaja tu equipo.</SectionTitle>
          <SectionLead dark>
            Aviso autorizado, reportes, apoyo y evidencia por WhatsApp. El tablero refleja el cambio.
          </SectionLead>
        </div>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b141a] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.75)]">
            <div className="flex items-center gap-3 bg-[#075e54] px-3 py-2.5 text-white">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-[11px] font-bold tracking-wide">
                SB
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">SCRUMBAN</p>
                <p className="truncate text-[11px] text-white/75">
                  Aviso solicitado · {AGENT_STORY_DEMO_LABEL}
                </p>
              </div>
              <div className="flex items-center gap-3 pr-1 text-white/85" aria-hidden>
                <span className="text-lg leading-none">⋮</span>
              </div>
            </div>

            <div
              className="relative space-y-2.5 px-3 py-4"
              style={{
                backgroundColor: '#0b141a',
                backgroundImage:
                  'radial-gradient(rgba(255,255,255,0.045) 0.7px, transparent 0.7px)',
                backgroundSize: '14px 14px',
                minHeight: 220,
              }}
            >
              <div className="mx-auto mb-1 w-fit rounded-md bg-black/35 px-2.5 py-1 text-[10px] font-medium text-white/70 backdrop-blur-sm">
                Hoy
              </div>

              <div className="relative max-w-[88%] rounded-lg rounded-tl-sm bg-[#202c33] px-3 py-2 text-[13px] leading-relaxed text-[#e9edef] shadow-sm">
                <p className="mb-1 text-[11px] font-semibold text-[#53bdeb]">SCRUMBAN</p>
                <p>
                  {AGENT_STORY.actionId} · {AGENT_STORY.proposal.title}
                </p>
                <p className="mt-1 text-[#8696a0]">Responsable: {AGENT_STORY.owner.fullName}</p>
                <p className="text-[#8696a0]">Fecha: {agentStoryFridayLabel()}</p>
                <span className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-[#8696a0]">
                  09:02
                </span>
              </div>

              {reply === 'inicial' ? (
                <div className="ml-0 max-w-[88%] overflow-hidden rounded-lg border border-[#2a3942] bg-[#1f2c34]">
                  {(
                    [
                      ['proceso', 'En proceso'],
                      ['apoyo', 'Requiero apoyo'],
                      ['realizada', 'Realizada'],
                    ] as const
                  ).map(([id, label], i) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setReply(id)}
                      className={cn(
                        'block w-full px-3 py-2.5 text-center text-[13px] font-medium text-[#53bdeb] transition hover:bg-white/[0.04]',
                        i > 0 && 'border-t border-[#2a3942]'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              {reply !== 'inicial' ? (
                <div className="relative ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-[#005c4b] px-3 py-2 text-[13px] leading-relaxed text-[#e9edef] shadow-sm">
                  {reply === 'proceso'
                    ? 'En proceso'
                    : reply === 'apoyo'
                      ? 'Requiero apoyo'
                      : 'Realizada'}
                  <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#ffffff99]">
                    09:03
                    <svg viewBox="0 0 16 11" className="h-2.5 w-4 text-[#53bdeb]" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M11.071.5L4.857 6.714 2.429 4.286.5 6.214l4.357 4.357L13 2.429z"
                      />
                      <path
                        fill="currentColor"
                        d="M14.571.5L8.357 6.714 7.5 5.857l1.929-1.928L12.643.5z"
                        opacity=".9"
                      />
                    </svg>
                  </span>
                </div>
              ) : null}

              {reply === 'realizada' || reply === 'evidencia' ? (
                <div className="relative max-w-[88%] rounded-lg rounded-tl-sm bg-[#202c33] px-3 py-2 text-[13px] leading-relaxed text-[#e9edef] shadow-sm">
                  <p className="mb-1 text-[11px] font-semibold text-[#53bdeb]">SCRUMBAN</p>
                  Estado: Hecho. Envía el resultado para poder verificarla.
                  <span className="mt-1.5 flex justify-end text-[10px] text-[#8696a0]">09:03</span>
                </div>
              ) : null}

              {reply === 'realizada' ? (
                <div className="ml-0 max-w-[88%] overflow-hidden rounded-lg border border-[#2a3942] bg-[#1f2c34]">
                  <button
                    type="button"
                    onClick={() => setReply('evidencia')}
                    className="block w-full px-3 py-2.5 text-center text-[13px] font-medium text-[#53bdeb] transition hover:bg-white/[0.04]"
                  >
                    Enviar evidencia
                  </button>
                </div>
              ) : null}

              {reply === 'evidencia' ? (
                <div className="relative ml-auto max-w-[88%] overflow-hidden rounded-lg rounded-tr-sm bg-[#005c4b] shadow-sm">
                  <div className="flex items-center gap-2.5 bg-[#025144] px-2.5 py-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#128c7e]/40 text-[10px] font-bold text-[#e9edef]">
                      XLS
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-[#e9edef]">
                        {AGENT_STORY.evidenceFile}
                      </p>
                      <p className="text-[10px] text-[#ffffff99]">Documento · 128 KB</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 px-2.5 py-1 text-[10px] text-[#ffffff99]">
                    09:04
                    <svg viewBox="0 0 16 11" className="h-2.5 w-4 text-[#53bdeb]" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M11.071.5L4.857 6.714 2.429 4.286.5 6.214l4.357 4.357L13 2.429z"
                      />
                      <path
                        fill="currentColor"
                        d="M14.571.5L8.357 6.714 7.5 5.857l1.929-1.928L12.643.5z"
                        opacity=".9"
                      />
                    </svg>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-white/5 bg-[#1f2c34] px-2.5 py-2">
              <div className="flex items-center gap-2">
                <div className="flex min-h-9 flex-1 items-center rounded-full bg-[#2a3942] px-3.5 text-[13px] text-[#8696a0]">
                  Mensaje
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                    <path d="M1.5 21.5l21-9-21-9v7l15 2-15 2z" />
                  </svg>
                </div>
              </div>
              {reply !== 'inicial' ? (
                <button
                  type="button"
                  onClick={() => setReply('inicial')}
                  className="mt-2 w-full text-center text-[11px] font-medium text-[#8696a0] hover:text-[#e9edef]"
                >
                  Reiniciar conversación
                </button>
              ) : null}
            </div>
          </div>

          <div className="liquid-glass rounded-2xl p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              En Scrumban
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">
                {AGENT_STORY.actionId} · {AGENT_STORY.proposal.title}
              </h3>
              <span className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/80">
                {board.label}
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/60">{board.detail}</p>
            <ul className="mt-5 space-y-2 text-sm text-white/80">
              <li>Responsable: {AGENT_STORY.owner.fullName}</li>
              <li>Compromiso: {agentStoryFridayLabel()}</li>
              <li>Evidencia esperada: diferencias documentadas</li>
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-white/45">
              El aviso se envía solo cuando alguien lo solicita. Hecho no es verificado.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/40">
              {AGENT_STORY.whatsapp.secondaryNote}
            </p>
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

export function EnviardianDemo() {
  return (
    <LandingSection
      id="visibilidad"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={AGENT_LANDING_SEO.sections.visibilidad.description}
    >
      <LandingShell>
        <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
          <div className="max-w-md">
            <Eyebrow dark tokenColor="blue">
              02 · Atiende
            </Eyebrow>
            <SectionTitle dark>Lo que necesitas saber, en una conversación.</SectionTitle>
            <SectionLead dark>
              Enviardián conecta OKRs, operación y compromisos, y prioriza lo que requiere
              intervención.
            </SectionLead>
            <p className="mt-6 text-[11px] text-white/45">
              {AGENT_STORY_DEMO_LABEL}. Consultar no crea ni cierra nada.
            </p>
          </div>

          <div className="liquid-glass rounded-2xl p-5 sm:p-6">
            <p className="text-[11px] text-white/50">Consulta</p>
            <p className="mt-1 text-sm font-medium text-white/85">
              “{AGENT_STORY.visibility.ask}”
            </p>

            <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.06] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    Hallazgo principal
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-white">
                    {AGENT_STORY.visibility.findingTitle}
                  </h3>
                </div>
                <span className="shrink-0 rounded-full border border-white/25 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-black">
                  {AGENT_STORY.blockerLabel}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/75">
                {AGENT_STORY.visibility.findingDetail}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/50">
                {AGENT_STORY.visibility.whyItMatters}
              </p>
            </div>

            <ul className="mt-4 divide-y divide-white/10">
              {AGENT_STORY.visibility.dimensions.map((row) => (
                <li key={row.label} className="flex gap-3 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                    {row.label}
                  </span>
                  <span className="text-white/75">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

export function InstructionDemo() {
  const [decision, setDecision] = useState<'pending' | 'confirmed' | 'cancelled'>('pending')
  const friday = agentStoryFridayLabel()

  return (
    <LandingSection
      id="accion"
      surface="transparent"
      className="home-post__section"
      spacing="standard"
      seoDescription={AGENT_LANDING_SEO.sections.accion.description}
    >
      <LandingShell>
        <div className="max-w-3xl">
          <Eyebrow dark tokenColor="green">
            03 · Decide
          </Eyebrow>
          <SectionTitle dark>De una instrucción a un compromiso claro.</SectionTitle>
          <SectionLead dark>
            Lenguaje natural, propuesta editable y confirmación antes de crear. Sin llenar
            formularios uno a uno.
          </SectionLead>
        </div>

        <div className="mt-8 grid items-stretch gap-3 lg:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.2fr)] lg:gap-4">
          <div className="liquid-glass flex flex-col rounded-2xl p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
              Instrucción
            </p>
            <div className="mt-4 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <p className="text-lg font-semibold leading-snug text-white sm:text-xl">
                “{AGENT_STORY.instruction}”
              </p>
            </div>
            <p className="mt-4 text-sm text-white/55">{AGENT_STORY.proposal.relatedNote}</p>
          </div>

          <div className="flex items-center justify-center py-1 lg:flex-col lg:px-1" aria-hidden>
            <div className="hidden h-full w-px flex-1 bg-gradient-to-b from-transparent via-white/25 to-transparent lg:block" />
            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75 lg:my-3">
              Propone
            </div>
            <div className="hidden h-full w-px flex-1 bg-gradient-to-b from-transparent via-white/25 to-transparent lg:block" />
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/25 to-transparent lg:hidden" />
          </div>

          <div className="liquid-glass flex flex-col rounded-2xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                  Propuesta
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white">{AGENT_STORY_DEMO_LABEL}</p>
              </div>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
                  decision === 'confirmed'
                    ? 'border-white/35 bg-white text-black'
                    : 'border-white/15 text-white/80'
                )}
              >
                {decision === 'confirmed' ? 'Confirmada' : 'Pendiente'}
              </span>
            </div>

            <dl className="mt-4 flex-1 space-y-2.5 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                <dt className="text-[11px] text-white/45">Título</dt>
                <dd className="mt-1 font-semibold text-white">{AGENT_STORY.proposal.title}</dd>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                  <dt className="text-[11px] text-white/45">Responsable</dt>
                  <dd className="mt-1 font-semibold text-white">{AGENT_STORY.owner.fullName}</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                  <dt className="text-[11px] text-white/45">Prioridad</dt>
                  <dd className="mt-1 font-semibold text-white">{AGENT_STORY.proposal.priority}</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                  <dt className="text-[11px] text-white/45">Fecha</dt>
                  <dd className="mt-1 font-semibold text-white">{friday}</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                  <dt className="text-[11px] text-white/45">Hora</dt>
                  <dd className="mt-1 font-semibold text-white">
                    {AGENT_STORY.proposal.dueTime} · CDMX
                  </dd>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                <dt className="text-[11px] text-white/45">Descripción</dt>
                <dd className="mt-1 leading-relaxed text-white/85">
                  {AGENT_STORY.proposal.description}
                </dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                <dt className="text-[11px] text-white/45">Evidencia esperada</dt>
                <dd className="mt-1 text-white/85">{AGENT_STORY.proposal.evidenceExpected}</dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                <dt className="text-[11px] text-white/45">Checkpoints</dt>
                <dd className="mt-1 text-white/55">No solicitados en esta instrucción</dd>
              </div>
            </dl>

            {decision === 'pending' ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-10 rounded-full bg-white text-black hover:bg-white/90"
                  onClick={() => setDecision('confirmed')}
                >
                  Confirmar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
                  onClick={() => setDecision('cancelled')}
                >
                  Editar
                </Button>
              </div>
            ) : (
              <p className="mt-5 text-sm text-white/75">
                {decision === 'confirmed'
                  ? 'Confirmada en este ejemplo. La acción no existe hasta ese sí; el aviso de WhatsApp es un paso aparte.'
                  : 'Sin cambios. No se creó nada.'}{' '}
                <button
                  type="button"
                  className="font-semibold text-white underline-offset-2 hover:underline"
                  onClick={() => setDecision('pending')}
                >
                  Reiniciar
                </button>
              </p>
            )}
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}
