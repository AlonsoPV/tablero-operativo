import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  buildSessionActions,
  evidenceLabel,
  resolveReportDocument,
  type EvidenceKind,
  type EnviardianSessionActionStatus,
  type ReportCommitmentStatus,
} from '@/features/guide/enviardianReportDocument'
import type { GuideCreatedWork } from '@/features/guide/types'
import {
  REPORT_PALETTE,
  toneClasses,
  toneForCommitment,
  toneForDecision,
  toneForEvidence,
  toneForRisk,
  toneForSessionAction,
  type ReportToneId,
} from '@/features/guide/reportVisualTheme'
import { cn } from '@/lib/utils'

function EvidenceBadge({ kind }: { kind: EvidenceKind }) {
  const tone = toneClasses(toneForEvidence(kind))
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
        tone.badge
      )}
    >
      {evidenceLabel(kind)}
    </span>
  )
}

function StatusChip({ status }: { status: ReportCommitmentStatus }) {
  const tone = toneClasses(toneForCommitment(status))
  const label =
    status === 'confirmed' ? 'Confirmado' : status === 'proposal' ? 'Propuesta' : 'Por definir'
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold', tone.badge)}>
      {label}
    </span>
  )
}

function SessionActionChip({ status }: { status: EnviardianSessionActionStatus }) {
  const tone = toneClasses(toneForSessionAction(status))
  const label =
    status === 'executed'
      ? 'Ejecutada'
      : status === 'pending_confirmation'
        ? 'Pendiente de confirmacion'
        : status === 'recommendation'
          ? 'Recomendacion'
          : 'Compromiso'
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold', tone.badge)}>
      {label}
    </span>
  )
}

function KpiCard({
  label,
  value,
  toneId,
  icon: Icon,
}: {
  label: string
  value: string | number
  toneId: ReportToneId
  icon: typeof Target
}) {
  const tone = toneClasses(toneId)
  return (
    <div className={cn('min-w-[9.5rem] flex-1 rounded-2xl border p-4 shadow-sm', tone.card, tone.border)}>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-xl', tone.card)}>
          <Icon className={cn('h-4 w-4', tone.text)} aria-hidden />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600">{label}</p>
      </div>
      <p className={cn('text-3xl font-semibold tabular-nums tracking-tight', tone.kpiValue)}>{value}</p>
    </div>
  )
}

function MetricBar({ label, value, toneId = 'teal' }: { label: string; value: string; toneId?: ReportToneId }) {
  const tone = toneClasses(toneId)
  const numeric = Number(String(value).replace(/[^\d.]/g, ''))
  const pct = Number.isFinite(numeric) ? Math.max(6, Math.min(100, numeric > 100 ? 100 : numeric)) : 40
  return (
    <div className={cn('space-y-2 rounded-xl border p-3', tone.border, tone.card)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-600">{label}</span>
        <span className={cn('font-semibold tabular-nums', tone.kpiValue)}>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/80">
        <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function evidenceIcon(kind: EvidenceKind) {
  if (kind === 'verified') return CheckCircle2
  if (kind === 'hypothesis') return AlertTriangle
  if (kind === 'recommendation') return Sparkles
  return CircleDot
}

export function GuideReportBody({
  executiveReport,
  summary,
  topic,
  createdAt,
  sessionId,
  createdWork,
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
  agentInferences?: string | null
  learning?: string | null
  intention?: string | null
  reflectionQuestion?: string | null
}) {
  const doc = resolveReportDocument({
    executiveReport,
    summary,
    topic,
    createdAt,
    sessionId,
  })

  if (!doc) {
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

  const sessionActions =
    doc.session_actions?.length > 0
      ? doc.session_actions
      : buildSessionActions({
          createdWork,
          recommendations: doc.recommendations,
        })
  const commitments = doc.confirmed_commitments.slice(0, 3)
  const showKpis =
    (doc.counts &&
      (doc.counts.findings > 0 || doc.counts.pendingDecisions > 0 || doc.counts.commitments > 0)) ||
    doc.verified_metrics.length > 0
  const confirmedTone = toneClasses(toneForDecision('confirmed'))
  const pendingTone = toneClasses(toneForDecision('pending'))
  const aiTone = toneClasses(toneForDecision('recommendation'))

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm"
      style={{ background: REPORT_PALETTE.surface }}
      aria-label="Informe ejecutivo"
    >
      {/* Hero */}
      <header
        className="relative space-y-4 px-5 py-6 text-white sm:px-7 sm:py-8"
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
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Informe ejecutivo</h2>
          <p className="text-sm text-blue-100/90 sm:text-base">{doc.metadata.topic}</p>
          {(doc.metadata.participant || doc.metadata.durationLabel) && (
            <p className="text-xs text-blue-100/70">
              {[doc.metadata.participant, doc.metadata.durationLabel].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="max-w-3xl text-[15px] leading-7 text-white/95 sm:text-base sm:leading-7">
            {doc.executive_summary.text}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/20">
              <Target className="h-3.5 w-3.5" aria-hidden />
              {doc.executive_summary.headlineFinding ||
                doc.key_findings[0]?.title ||
                'Sin hallazgo destacado'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-400/20 px-3 py-1.5 text-xs font-medium text-teal-50 ring-1 ring-teal-200/30">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              Siguiente: {doc.executive_summary.nextStep || 'Por definir'}
            </span>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-4 sm:space-y-8 sm:p-6">
        {showKpis ? (
          <section aria-label="Indicadores" className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-slate-800">Indicadores</h3>
            <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
              {doc.counts?.findings ? (
                <KpiCard
                  label="Hallazgos"
                  value={doc.counts.findings}
                  toneId="blue"
                  icon={ClipboardList}
                />
              ) : null}
              {doc.counts?.pendingDecisions ? (
                <KpiCard
                  label="Pendientes"
                  value={doc.counts.pendingDecisions}
                  toneId="amber"
                  icon={AlertTriangle}
                />
              ) : null}
              {doc.counts?.commitments ? (
                <KpiCard
                  label="Compromisos"
                  value={doc.counts.commitments}
                  toneId="green"
                  icon={CheckCircle2}
                />
              ) : null}
              {doc.verified_metrics.length ? (
                <KpiCard
                  label="Metricas verificadas"
                  value={doc.verified_metrics.length}
                  toneId="teal"
                  icon={TrendingUp}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        {(doc.technical_attention?.length ?? 0) > 0 ? (
          <section className="space-y-3" aria-label="Atencion tecnica">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-tight text-slate-800">
                Solicitudes que requieren atencion tecnica
              </h3>
              <p className="text-xs text-slate-500">
                Fallas de integracion o herramientas. No son hallazgos de negocio.
              </p>
            </div>
            <ul className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              {(doc.technical_attention ?? []).map((item) => (
                <li key={`${item.code}-${item.message}`} className="text-sm leading-6 text-slate-700">
                  <span className="font-medium text-amber-900">{item.code}</span>
                  {item.tool ? <span className="text-slate-500"> · {item.tool}</span> : null}
                  <span className="text-slate-600"> — {item.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {doc.key_findings.length > 0 ? (
          <section className="space-y-3" aria-label="Hallazgos">
            <h3 className="text-sm font-semibold tracking-tight text-slate-800">Hallazgos prioritarios</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {doc.key_findings.map((item) => {
                const toneId = toneForEvidence(item.evidence)
                const tone = toneClasses(toneId)
                const Icon = evidenceIcon(item.evidence)
                return (
                  <article
                    key={`${item.title}-${item.detail}`}
                    className={cn('relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm', tone.border)}
                  >
                    <div className={cn('absolute inset-y-0 left-0 w-1.5', tone.rail)} aria-hidden />
                    <div className="space-y-2 pl-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className={cn('h-4 w-4', tone.text)} aria-hidden />
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <EvidenceBadge kind={item.evidence} />
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
          </section>
        ) : null}

        {doc.verified_metrics.length > 0 ? (
          <section className="space-y-3" aria-label="Indicadores verificados">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-tight text-slate-800">Indicadores verificados</h3>
              <p className="text-xs text-slate-500">Solo datos consultados en Scrumban durante la llamada.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {doc.verified_metrics.map((metric, index) => (
                <MetricBar
                  key={`${metric.label}-${metric.value}`}
                  label={metric.label}
                  value={metric.value}
                  toneId={index % 2 === 0 ? 'teal' : 'blue'}
                />
              ))}
            </div>
          </section>
        ) : null}

        {sessionActions.length > 0 ? (
          <section className="space-y-3" aria-label="Acciones">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold tracking-tight text-slate-800">Acciones</h3>
              <p className="text-xs text-slate-500">
                Ejecutadas, pendientes de confirmacion y recomendaciones no ejecutadas de esta sesion.
              </p>
            </div>
            <ul className="space-y-2">
              {sessionActions.map((item) => {
                const tone = toneClasses(toneForSessionAction(item.status))
                return (
                  <li
                    key={`${item.status}-${item.title}-${item.id || ''}`}
                    className={cn(
                      'relative overflow-hidden rounded-2xl border bg-white p-3.5 shadow-sm',
                      tone.border
                    )}
                  >
                    <div className={cn('absolute inset-y-0 left-0 w-1.5', tone.rail)} aria-hidden />
                    <div className="flex flex-wrap items-start justify-between gap-2 pl-2.5">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        {(item.ownerHint || item.dueDateHint) && (
                          <p className="text-xs text-slate-500">
                            {[item.ownerHint, item.dueDateHint].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {item.href ? (
                          <Link
                            to={item.href}
                            className="text-xs font-medium text-[#2563EB] hover:underline"
                          >
                            Abrir en Scrumban
                          </Link>
                        ) : null}
                      </div>
                      <SessionActionChip status={item.status} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {(doc.confirmed_decisions.length > 0 || doc.pending_decisions.length > 0) && (
          <section className="space-y-3" aria-label="Decisiones">
            <h3 className="text-sm font-semibold tracking-tight text-slate-800">Decisiones</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className={cn('space-y-2 rounded-2xl border p-4', confirmedTone.card, confirmedTone.border)}>
                <p className={cn('text-[11px] font-semibold uppercase tracking-[0.06em]', confirmedTone.text)}>
                  Confirmadas
                </p>
                {doc.confirmed_decisions.length ? (
                  <ul className="space-y-2">
                    {doc.confirmed_decisions.map((item) => (
                      <li
                        key={item}
                        className="rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-sm leading-6 text-slate-800"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Ninguna</p>
                )}
              </div>
              <div className={cn('space-y-2 rounded-2xl border p-4', pendingTone.card, pendingTone.border)}>
                <p className={cn('text-[11px] font-semibold uppercase tracking-[0.06em]', pendingTone.text)}>
                  Pendientes
                </p>
                {doc.pending_decisions.length ? (
                  <ul className="space-y-2">
                    {doc.pending_decisions.map((item) => (
                      <li
                        key={item}
                        className="rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-sm leading-6 text-slate-800"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Ninguna</p>
                )}
              </div>
            </div>
          </section>
        )}

        {commitments.length > 0 ? (
          <section className="space-y-3" aria-label="Plan de accion">
            <h3 className="text-sm font-semibold tracking-tight text-slate-800">Plan de accion</h3>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.06em] text-slate-500">
                    <th className="px-4 py-3 font-semibold">Accion</th>
                    <th className="px-4 py-3 font-semibold">Responsable</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.map((row) => {
                    const tone = toneClasses(toneForCommitment(row.status))
                    return (
                      <tr key={row.action} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', tone.rail)} aria-hidden />
                            <span className="font-medium text-slate-900">{row.action}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.ownerHint || 'Por definir'}</td>
                        <td className="px-4 py-3 text-slate-600">{row.dueDateHint || 'Por definir'}</td>
                        <td className="px-4 py-3">
                          <StatusChip status={row.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {commitments.map((row) => {
                const tone = toneClasses(toneForCommitment(row.status))
                return (
                  <article
                    key={row.action}
                    className={cn('space-y-2 rounded-2xl border bg-white p-4', tone.border)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{row.action}</p>
                      <StatusChip status={row.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {row.ownerHint || 'Por definir'} · {row.dueDateHint || 'Por definir'}
                    </p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn('h-full rounded-full', tone.bar)}
                        style={{
                          width:
                            row.status === 'confirmed' ? '100%' : row.status === 'proposal' ? '55%' : '30%',
                        }}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        {doc.risks.length > 0 ? (
          <section className="space-y-3" aria-label="Riesgos">
            <h3 className="text-sm font-semibold tracking-tight text-slate-800">Riesgos y oportunidades</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {doc.risks.map((risk) => {
                const riskToneId = toneForRisk(risk.risk, {
                  hasOpportunity: Boolean(risk.opportunity),
                })
                const riskTone = toneClasses(riskToneId)
                return (
                  <div key={risk.risk} className="space-y-3">
                    <article
                      className={cn('overflow-hidden rounded-2xl border bg-white shadow-sm', riskTone.border)}
                    >
                      <div className={cn('px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white', riskTone.rail)}>
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
                      <article
                        className={cn(
                          'overflow-hidden rounded-2xl border bg-white shadow-sm',
                          toneClasses('teal').border
                        )}
                      >
                        <div
                          className={cn(
                            'px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-white',
                            toneClasses('teal').rail
                          )}
                        >
                          Oportunidad
                        </div>
                        <p className="p-4 text-sm leading-6 text-slate-800">{risk.opportunity}</p>
                      </article>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {doc.recommendations.length > 0 ? (
          <section className="space-y-3" aria-label="Recomendaciones IA">
            <div
              className={cn(
                'overflow-hidden rounded-2xl border shadow-sm',
                aiTone.border,
                aiTone.card
              )}
            >
              <div className={cn('flex items-center gap-2 px-4 py-3 text-white', aiTone.rail)}>
                <Sparkles className="h-4 w-4" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">Analisis Enviardian</p>
                  <p className="text-[11px] text-violet-100">Recomendaciones de IA — no son hechos verificados</p>
                </div>
              </div>
              <ul className="space-y-2 p-4">
                {doc.recommendations.map((item, index) => (
                  <li
                    key={item}
                    className="flex gap-3 rounded-xl border border-white/70 bg-white/90 px-3 py-2.5 text-sm leading-6 text-slate-800"
                  >
                    <Lightbulb className={cn('mt-0.5 h-4 w-4 shrink-0', aiTone.text)} aria-hidden />
                    <span>
                      <span className={cn('mr-1 font-semibold', aiTone.text)}>{index + 1}.</span>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {doc.metadata.interviewOnly || doc.metadata.consultFailed ? (
          <p className="text-xs text-slate-500">
            {doc.metadata.consultFailed
              ? 'Una consulta al tablero fallo. Este informe no completa cifras faltantes.'
              : 'Sin consulta exitosa al tablero: el informe se basa solo en la entrevista.'}
          </p>
        ) : null}
      </div>
    </div>
  )
}
