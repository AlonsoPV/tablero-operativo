import {
  AlertTriangle,
  ClipboardList,
  Lightbulb,
  Scale,
  Target,
  TrendingUp,
} from 'lucide-react'
import type { CopilotProposal } from '@/features/ai-support/copilot/types'
import { GuideCommunicationsSection } from '@/features/guide/components/GuideCommunicationsSection'
import { EvidenceTag } from '@/features/guide/components/report/EvidenceTag'
import { FollowUpCard } from '@/features/guide/components/report/FollowUpCard'
import { RecommendationCard } from '@/features/guide/components/report/RecommendationCard'
import { ReportBlock } from '@/features/guide/components/report/ReportBlock'
import { SessionStat } from '@/features/guide/components/report/SessionStat'
import type { GuideCreatedWork } from '@/features/guide/types'
import {
  buildReportViewModel,
  hasFollowUpContent,
} from '@/features/guide/reportViewModel'

type ReportCommunicationOp = CopilotProposal & {
  status?: string
  errorMessage?: string | null
  deliveryStatus?: string | null
}
import {
  REPORT_PALETTE,
  toneClasses,
  toneForEvidence,
  toneForRisk,
} from '@/features/guide/reportVisualTheme'
import { cn } from '@/lib/utils'

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-[#0D9488]">
        {value}
      </p>
    </div>
  )
}

export function GuideReportBody({
  executiveReport,
  summary,
  topic,
  createdAt,
  sessionId,
  createdWork,
  communications,
  communicationsReadOnly = false,
  boardReadOnly = communicationsReadOnly,
  confirmOp,
  cancelOp,
  disableEditCommunications = false,
  showLoginCta = false,
  onCommunicationUpdated,
  onCommunicationResolved,
  agentInferences: _agentInferences,
  learning: _learning,
  intention: _intention,
  reflectionQuestion: _reflectionQuestion,
}: {
  executiveReport?: string | null
  summary?: string | null
  topic?: string | null
  createdAt?: string | null
  sessionId?: string | null
  createdWork?: GuideCreatedWork[] | null
  communications?: ReportCommunicationOp[] | null
  communicationsReadOnly?: boolean
  boardReadOnly?: boolean
  confirmOp?: (opId: string) => Promise<{ result?: { href?: string } | null }>
  cancelOp?: (opId: string) => Promise<void>
  disableEditCommunications?: boolean
  /** Liga pública: CTA de login junto a borradores en solo lectura. */
  showLoginCta?: boolean
  onCommunicationUpdated?: (proposal: CopilotProposal) => void
  onCommunicationResolved?: (id: string, status: 'confirmed' | 'cancelled') => void
  agentInferences?: string | null
  learning?: string | null
  intention?: string | null
  reflectionQuestion?: string | null
}) {
  const vm = buildReportViewModel({
    executiveReport,
    summary,
    topic,
    createdAt,
    sessionId,
    createdWork,
    communications: (communications ?? []).map((op) => ({
      id: op.id,
      tool: op.tool,
      title: op.title,
      status: op.status,
      errorMessage: op.errorMessage,
      deliveryStatus: op.deliveryStatus,
      workspace: op.workspace
        ? {
            needsInfo: op.workspace.needsInfo,
            incomplete: op.workspace.incomplete,
            recipientName: op.workspace.recipientName,
            to: op.workspace.to,
            phone: op.workspace.phone,
          }
        : null,
    })),
  })

  if (!vm) {
    return (
      <section
        className="space-y-2 rounded-2xl border border-slate-200 p-5"
        style={{ background: REPORT_PALETTE.surface }}
        aria-label="Informe ejecutivo"
      >
        <h2 className="text-base font-semibold tracking-tight text-slate-900">Informe ejecutivo</h2>
        <p className="text-sm text-slate-600">Todavia no hay contenido suficiente para mostrar el informe.</p>
      </section>
    )
  }

  const { hero, stats, block1, block2, block3, document: doc } = vm
  const showFollowUp = hasFollowUpContent(vm)

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm"
      style={{ background: REPORT_PALETTE.surface }}
      aria-label="Informe ejecutivo"
    >
      <header
        className="relative space-y-4 px-5 py-6 text-white sm:px-7 sm:py-7"
        style={{ background: REPORT_PALETTE.navy }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(80% 60% at 90% -10%, rgba(37,99,235,0.45), transparent 55%), radial-gradient(50% 40% at 0% 100%, rgba(13,148,136,0.25), transparent 60%)',
          }}
          aria-hidden
        />
        <div className="relative space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-100/90">
            Scrumban · Enviardian
          </p>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{hero.topic}</h2>
            <p className="max-w-3xl text-[15px] leading-6 text-white/95 sm:text-base">
              {hero.conclusion}
            </p>
          </div>
          {hero.keyPoints.length > 0 ? (
            <ul className="max-w-3xl space-y-1.5 text-sm text-blue-50/95">
              {hero.keyPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal-300" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-blue-100/75">
            {hero.dateLabel ? <span>{hero.dateLabel}</span> : null}
            {hero.durationLabel ? <span>· {hero.durationLabel}</span> : null}
            {hero.participant ? <span>· {hero.participant}</span> : null}
            {hero.pendingReviewCount > 0 ? (
              <span className="inline-flex rounded-full bg-amber-400/20 px-2.5 py-1 font-medium text-amber-50 ring-1 ring-amber-200/30">
                {hero.pendingReviewCount === 1
                  ? '1 solicitud por revisar'
                  : `${hero.pendingReviewCount} solicitudes por revisar`}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="space-y-8 p-4 sm:space-y-10 sm:p-6 lg:p-7">
        {stats.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Resumen de la sesion">
            {stats.map((stat) => (
              <SessionStat key={stat.id} text={stat.text} />
            ))}
          </div>
        ) : null}

        <ReportBlock
          number="01"
          title="Resultados de la sesion"
          subtitle="Que identificamos y que datos lo respaldan."
          icon={ClipboardList}
        >
          {block1.findings.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-800">Hallazgos</h4>
              <div className="grid gap-3 lg:grid-cols-2">
                {block1.findings.map((item) => {
                  const tone = toneClasses(toneForEvidence(item.evidence))
                  return (
                    <article
                      key={`${item.title}-${item.detail}`}
                      className={cn(
                        'relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm',
                        tone.border
                      )}
                    >
                      <div className={cn('absolute inset-y-0 left-0 w-1.5', tone.rail)} aria-hidden />
                      <div className="space-y-2 pl-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <EvidenceTag kind={item.evidence} source={item.source} />
                        </div>
                        <p className="text-sm leading-6 text-slate-600">{item.detail}</p>
                        {item.businessImpact ? (
                          <p className="text-sm leading-6 text-slate-800">
                            <span className="font-medium">Impacto: </span>
                            {item.businessImpact}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : null}

          {block1.metrics.length > 0 ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-800">Indicadores verificados</h4>
                <p className="text-xs text-slate-500">
                  Solo datos consultados en Scrumban durante la conversacion.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {block1.metrics.map((metric) => (
                  <MetricRow
                    key={`${metric.label}-${metric.value}`}
                    label={metric.label}
                    value={`${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {block1.evidenceSources.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-800">Fuente de informacion</h4>
              <ul className="space-y-1.5 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm text-slate-600">
                {block1.evidenceSources.map((line) => (
                  <li key={line} className="flex gap-2">
                    <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0D9488]" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {block1.technicalAttention.length > 0 ? (
            <div className="space-y-2 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
                <h4 className="text-sm font-semibold text-amber-900">Atencion tecnica</h4>
              </div>
              <p className="text-xs text-amber-800/80">
                Fallas de integracion o herramientas. No son hallazgos de negocio.
              </p>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {block1.technicalAttention.map((item) => (
                  <li key={`${item.code}-${item.message}`}>
                    <span className="font-medium text-amber-900">{item.code}</span>
                    {item.tool ? <span className="text-slate-500"> · {item.tool}</span> : null}
                    <span className="text-slate-600"> — {item.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {block1.interviewOnly || block1.consultFailed ? (
            <p className="text-xs text-slate-500">
              {block1.consultFailed
                ? 'Una consulta al tablero fallo. Este informe no completa cifras faltantes.'
                : 'Sin consulta exitosa al tablero: el informe se basa solo en la entrevista.'}
            </p>
          ) : null}
        </ReportBlock>

        <ReportBlock
          number="02"
          title="Analisis y recomendaciones"
          subtitle="Que significan los resultados y que conviene hacer."
          icon={Lightbulb}
        >
          {(block2.interpretation || block2.nextStep) && (
            <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-[#172B59]" aria-hidden />
                <h4 className="text-sm font-semibold text-slate-800">Interpretacion ejecutiva</h4>
              </div>
              {block2.interpretation ? (
                <p className="text-sm leading-6 text-slate-700">{block2.interpretation}</p>
              ) : null}
              {block2.nextStep ? (
                <p className="text-sm leading-6 text-slate-800">
                  <span className="font-medium">Siguiente paso sugerido: </span>
                  {block2.nextStep}
                </p>
              ) : null}
            </div>
          )}

          {block2.risks.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-800">Riesgos y oportunidades</h4>
              <div className="grid gap-3 lg:grid-cols-2">
                {block2.risks.map((risk) => {
                  const riskTone = toneClasses(
                    toneForRisk(risk.risk, { hasOpportunity: Boolean(risk.opportunity) })
                  )
                  return (
                    <div key={risk.risk} className="space-y-3">
                      <article
                        className={cn(
                          'overflow-hidden rounded-2xl border bg-white shadow-sm',
                          riskTone.border
                        )}
                      >
                        <div
                          className={cn(
                            'px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white',
                            riskTone.rail
                          )}
                        >
                          Riesgo
                        </div>
                        <div className="space-y-1.5 p-4">
                          <p className="text-sm font-semibold text-slate-900">{risk.risk}</p>
                          {risk.consequence ? (
                            <p className="text-sm text-slate-600">Consecuencia: {risk.consequence}</p>
                          ) : null}
                          {risk.mitigation ? (
                            <p className="text-sm text-slate-600">Mitigacion: {risk.mitigation}</p>
                          ) : null}
                        </div>
                      </article>
                      {risk.opportunity ? (
                        <article className="overflow-hidden rounded-2xl border border-[#0D9488]/25 bg-white shadow-sm">
                          <div className="bg-[#0D9488] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white">
                            Oportunidad
                          </div>
                          <p className="p-4 text-sm leading-6 text-slate-800">{risk.opportunity}</p>
                        </article>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {block2.recommendations.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-800">Recomendaciones de Enviardian</h4>
              <div className="grid gap-3">
                {block2.recommendations.map((item, index) => (
                  <RecommendationCard key={item.text} item={item} index={index} />
                ))}
              </div>
            </div>
          ) : null}

          {!block2.interpretation &&
          !block2.nextStep &&
          block2.risks.length === 0 &&
          block2.recommendations.length === 0 ? (
            <p className="text-sm text-slate-500">Sin analisis adicional en esta sesion.</p>
          ) : null}
        </ReportBlock>

        {showFollowUp ? (
          <ReportBlock
            number="03"
            title="Pendientes de aprobacion"
            subtitle="Que necesita tu revision para continuar."
            icon={Target}
          >
            {block3.communicationOps.length > 0 ? (
              <GuideCommunicationsSection
                ops={(communications ?? []).filter((op) =>
                  block3.communicationOps.some((row) => row.id === op.id)
                )}
                readOnly={communicationsReadOnly}
                confirmOp={confirmOp}
                cancelOp={cancelOp}
                disableEdit={disableEditCommunications}
                onUpdated={onCommunicationUpdated}
                onResolved={onCommunicationResolved}
                showPendingChip
                showLoginCta={showLoginCta}
                title="Comunicaciones"
                subtitle="WhatsApp, correo y eventos preparados en la sesion."
              />
            ) : null}

            {block3.boardOps.length > 0 ? (
              <GuideCommunicationsSection
                ops={(communications ?? []).filter((op) =>
                  block3.boardOps.some((row) => row.id === op.id)
                )}
                readOnly={boardReadOnly}
                confirmOp={confirmOp}
                cancelOp={cancelOp}
                disableEdit={disableEditCommunications}
                onUpdated={onCommunicationUpdated}
                onResolved={onCommunicationResolved}
                showPendingChip
                showLoginCta={showLoginCta && block3.communicationOps.length === 0}
                title="Tareas e iniciativas"
                subtitle="Propuestas de tablero listas para revisar."
              />
            ) : null}

            {block3.historyOps.length > 0 ? (
              <GuideCommunicationsSection
                ops={(communications ?? []).filter((op) =>
                  block3.historyOps.some((row) => row.id === op.id)
                )}
                readOnly
                showPendingChip={false}
                title="Historial de operaciones"
                subtitle="Ejecutadas, descartadas o con conflicto en esta sesion."
              />
            ) : null}

            {block3.executed.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-800">Trabajo creado en Scrumban</h4>
                <ul className="space-y-2">
                  {block3.executed.map((item) => (
                    <li key={item.key}>
                      <FollowUpCard item={item} kindLabel="Ejecutada" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ReportBlock>
        ) : null}

        {doc.metadata.generationStatus === 'insufficient' ? (
          <p className="text-xs text-slate-500">
            La conversacion fue breve; el informe conserva solo lo esencial.
          </p>
        ) : null}
      </div>
    </div>
  )
}
