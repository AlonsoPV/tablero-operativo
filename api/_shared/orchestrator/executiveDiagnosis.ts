/**
 * Inteligencia ejecutiva determinista sobre datos operativos reales (R1).
 * Reutiliza los contratos de queryActions / queryAggregate / queryOkrs sin duplicar lógica
 * de consulta ni permisos. Distingue hechos comprobables, interpretaciones y recomendaciones.
 */
import type { ActionItem, OkrItem } from '../query/index.js'
import type { AnswerFinding, AnswerItem, AnswerMetric } from './answerContract.js'

const HIGH_PRIORITY_RE = /\b(p1|alta|urgente|critica|crítica|roja?)\b/i
const MED_PRIORITY_RE = /\b(p2|media|amarilla?)\b/i
const OKR_HINT_RE = /\b(okr|objetivo|kr\b|estrateg)/i

export type ExecutivePriority = {
  action: ActionItem
  score: number
  overdueDays: number
  isOverdue: boolean
  isBlocked: boolean
  isHighPriority: boolean
  areaRecurrence: number
  ownerRecurrence: number
  reasons: string[]
  what: string
  why: string
  evidence: string
  recommendation: string
  nextStep: string
}

export type AreaDelaySummary = {
  area: string
  delayed: number
  blocked: number
  open: number
}

export type OwnerCommitmentSummary = {
  owner: string
  open: number
  overdue: number
  blocked: number
  pendingVerification: number
}

export type ExecutiveDiagnosis = {
  counts: {
    open: number
    overdue: number
    blocked: number
    dueToday: number
    pendingVerification: number
    withoutDate: number
  }
  topPriorities: ExecutivePriority[]
  delayedByArea: AreaDelaySummary[]
  commitmentsByOwner: OwnerCommitmentSummary[]
  recurringPatterns: string[]
  okrSummary: {
    total: number
    withProgress: number
    avgProgress: number | null
    atRisk: OkrItem[]
    withoutData: OkrItem[]
    withoutInitiatives: OkrItem[]
  } | null
}

function diffDays(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`)
  const to = Date.parse(`${toYmd}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

function isActionOverdue(item: ActionItem, today: string): boolean {
  if (item.estado === 'Hecho' || item.estado === 'Verificado') return false
  return item.estado === 'Retraso' || (item.fecha != null && item.fecha < today)
}

function isActionOpen(item: ActionItem): boolean {
  return item.estado !== 'Hecho' && item.estado !== 'Verificado'
}

function isPendingVerification(item: ActionItem): boolean {
  return item.estado === 'Hecho'
}

export function buildExecutiveDiagnosis(input: {
  actions: ActionItem[]
  pendingVerificationActions?: ActionItem[]
  okrs?: OkrItem[] | null
  today: string
}): ExecutiveDiagnosis {
  const { actions, today } = input
  const openActions = actions.filter(isActionOpen)
  const pendingVerification = input.pendingVerificationActions
    ? input.pendingVerificationActions
    : actions.filter(isPendingVerification)

  const overdueList = openActions.filter((a) => isActionOverdue(a, today))
  const blockedList = openActions.filter((a) => a.estado === 'Bloqueado')
  const dueTodayList = openActions.filter((a) => a.fecha === today && !isActionOverdue(a, today))
  const withoutDateList = openActions.filter((a) => !a.fecha)

  // Agrupación por departamento/área
  const areaMap = new Map<string, AreaDelaySummary>()
  for (const a of openActions) {
    const area = a.area?.trim() || 'Sin área'
    const entry = areaMap.get(area) ?? { area, delayed: 0, blocked: 0, open: 0 }
    entry.open += 1
    if (isActionOverdue(a, today)) entry.delayed += 1
    if (a.estado === 'Bloqueado') entry.blocked += 1
    areaMap.set(area, entry)
  }
  const delayedByArea = [...areaMap.values()]
    .filter((a) => a.delayed > 0 || a.blocked > 0)
    .sort((a, b) => (b.delayed + b.blocked) - (a.delayed + a.blocked) || b.open - a.open)

  // Agrupación por responsable (abiertas + pendientes de verificación)
  const ownerMap = new Map<string, OwnerCommitmentSummary>()
  for (const a of openActions) {
    const owner = a.responsableNombre?.trim() || 'Sin responsable'
    const entry = ownerMap.get(owner) ?? {
      owner,
      open: 0,
      overdue: 0,
      blocked: 0,
      pendingVerification: 0,
    }
    entry.open += 1
    if (isActionOverdue(a, today)) entry.overdue += 1
    if (a.estado === 'Bloqueado') entry.blocked += 1
    ownerMap.set(owner, entry)
  }
  for (const a of pendingVerification) {
    const owner = a.responsableNombre?.trim() || 'Sin responsable'
    const entry = ownerMap.get(owner) ?? {
      owner,
      open: 0,
      overdue: 0,
      blocked: 0,
      pendingVerification: 0,
    }
    entry.pendingVerification += 1
    ownerMap.set(owner, entry)
  }
  const commitmentsByOwner = [...ownerMap.values()].sort(
    (a, b) =>
      b.overdue - a.overdue ||
      b.blocked - a.blocked ||
      b.pendingVerification - a.pendingVerification ||
      b.open - a.open
  )

  // Priorización inteligente (máximo 3 prioridades)
  const scored: ExecutivePriority[] = openActions.map((action) => {
    const overdue = isActionOverdue(action, today)
    const overdueDays = overdue && action.fecha ? diffDays(action.fecha, today) : 0
    const blocked = action.estado === 'Bloqueado'
    const highPriority = Boolean(action.prioridad && HIGH_PRIORITY_RE.test(action.prioridad.replace(/_/g, ' ')))
    const medPriority = Boolean(action.prioridad && MED_PRIORITY_RE.test(action.prioridad.replace(/_/g, ' ')))
    const strategicHint = OKR_HINT_RE.test(action.title)
    const areaKey = action.area?.trim() || 'Sin área'
    const ownerKey = action.responsableNombre?.trim() || 'Sin responsable'
    const areaStats = areaMap.get(areaKey)
    const ownerStats = ownerMap.get(ownerKey)
    const areaRecurrence = areaStats ? areaStats.delayed + areaStats.blocked : 0
    const ownerRecurrence = ownerStats ? ownerStats.overdue + ownerStats.blocked : 0

    let score = 0
    const reasons: string[] = []
    if (overdue) {
      score += 40 + Math.min(30, overdueDays * 2)
      reasons.push(overdueDays > 0 ? `vencida hace ${overdueDays} días` : 'en retraso')
    } else if (action.fecha === today) {
      score += 18
      reasons.push('vence hoy')
    }
    if (blocked) {
      score += 35
      reasons.push('bloqueada')
    }
    if (highPriority) {
      score += 22
      reasons.push('prioridad alta')
    } else if (medPriority) {
      score += 8
    }
    if (areaRecurrence >= 2 && areaKey !== 'Sin área') {
      score += 12
      reasons.push(`reincidencia en ${areaKey} (${areaRecurrence} incidencias)`)
    }
    if (ownerRecurrence >= 2 && ownerKey !== 'Sin responsable') {
      score += 8
      reasons.push(`concentración en ${ownerKey}`)
    }
    if (strategicHint) {
      score += 15
      reasons.push('vínculo estratégico')
    }

    const ownerText = action.responsableNombre ? `responsable: ${action.responsableNombre}` : 'sin responsable asignado'
    const areaText = action.area ? `área: ${action.area}` : 'sin área'
    const dateText = action.fecha ? `fecha compromiso: ${action.fecha}` : 'sin fecha compromiso'

    const what = `«${action.title}» (${action.estado ?? 'sin estado'}, ${ownerText}).`
    const why =
      reasons.length > 0
        ? `Concentra riesgo operativo porque está ${reasons.join(', ')}.`
        : 'Es una de las acciones abiertas con mayor exposición en el tablero actual.'
    const evidence = `${action.estado ?? 'sin estado'} · ${dateText} · ${ownerText} · ${areaText}.`
    const recommendation = blocked
      ? `Destrabar directamente con ${action.responsableNombre ?? 'el responsable'} definiendo dependencia y fecha de desbloqueo.`
      : overdue
        ? `Confirmar nueva fecha realista o reasignar recursos con ${action.responsableNombre ?? 'el responsable'} hoy mismo.`
        : `Dar seguimiento preventivo antes del vencimiento para evitar retraso.`
    const nextStep = blocked
      ? `Preparar una acción de desbloqueo vinculada a «${action.title}» o acordar fecha de resolución con ${action.responsableNombre ?? 'el área'}.`
      : `Validar avance con ${action.responsableNombre ?? 'el responsable'} y confirmar cierre o reprogramación.`

    return {
      action,
      score,
      overdueDays,
      isOverdue: overdue,
      isBlocked: blocked,
      isHighPriority: highPriority,
      areaRecurrence,
      ownerRecurrence,
      reasons,
      what,
      why,
      evidence,
      recommendation,
      nextStep,
    }
  })

  const topPriorities = scored
    .sort((a, b) => b.score - a.score || (a.action.fecha ?? '9999-12-31').localeCompare(b.action.fecha ?? '9999-12-31'))
    .slice(0, 3)

  // Patrones repetitivos comprobables
  const recurringPatterns: string[] = []
  for (const area of delayedByArea.slice(0, 2)) {
    if (area.delayed + area.blocked >= 2) {
      recurringPatterns.push(
        `Reincidencia en ${area.area}: ${area.delayed} vencidas y ${area.blocked} bloqueadas de ${area.open} abiertas.`
      )
    }
  }
  const overloadedOwners = commitmentsByOwner.filter((o) => o.overdue + o.blocked >= 2)
  for (const owner of overloadedOwners.slice(0, 2)) {
    recurringPatterns.push(
      `Concentración en ${owner.owner}: ${owner.overdue} vencidas y ${owner.blocked} bloqueadas.`
    )
  }
  if (pendingVerification.length >= 2) {
    recurringPatterns.push(
      `Cuello de cierre: ${pendingVerification.length} acciones en Hecho siguen pendientes de Verificado.`
    )
  }
  if (withoutDateList.length >= 2) {
    recurringPatterns.push(
      `Falta de fecha compromiso: ${withoutDateList.length} acciones abiertas no tienen fecha definida.`
    )
  }

  // Resumen estratégico OKR (solo si se consultaron con permiso)
  let okrSummary: ExecutiveDiagnosis['okrSummary'] = null
  if (input.okrs) {
    const withProgress = input.okrs.filter((o) => o.progress != null)
    const avgProgress = withProgress.length
      ? Math.round(withProgress.reduce((acc, o) => acc + (o.progress ?? 0), 0) / withProgress.length)
      : null
    okrSummary = {
      total: input.okrs.length,
      withProgress: withProgress.length,
      avgProgress,
      atRisk: withProgress.filter((o) => (o.progress ?? 0) < 40),
      withoutData: input.okrs.filter((o) => o.progress == null),
      withoutInitiatives: input.okrs.filter((o) => o.withoutInitiatives),
    }
  }

  return {
    counts: {
      open: openActions.length,
      overdue: overdueList.length,
      blocked: blockedList.length,
      dueToday: dueTodayList.length,
      pendingVerification: pendingVerification.length,
      withoutDate: withoutDateList.length,
    },
    topPriorities,
    delayedByArea,
    commitmentsByOwner,
    recurringPatterns,
    okrSummary,
  }
}

export function executiveMetrics(diagnosis: ExecutiveDiagnosis, scopeText: string): AnswerMetric[] {
  const metrics: AnswerMetric[] = [
    { id: 'open', label: 'Abiertas', value: diagnosis.counts.open, tone: 'neutral', scope: scopeText },
    {
      id: 'overdue',
      label: 'Vencidas',
      value: diagnosis.counts.overdue,
      tone: diagnosis.counts.overdue > 0 ? 'danger' : 'ok',
      scope: scopeText,
    },
    {
      id: 'blocked',
      label: 'Bloqueadas',
      value: diagnosis.counts.blocked,
      tone: diagnosis.counts.blocked > 0 ? 'danger' : 'ok',
      scope: scopeText,
    },
  ]
  if (diagnosis.counts.pendingVerification > 0) {
    metrics.push({
      id: 'pending_verification',
      label: 'Pend. de verificar',
      value: diagnosis.counts.pendingVerification,
      tone: 'warning',
      scope: scopeText,
    })
  }
  if (diagnosis.okrSummary && diagnosis.okrSummary.avgProgress !== null) {
    metrics.push({
      id: 'okr_avg',
      label: 'Avance OKR',
      value: `${diagnosis.okrSummary.avgProgress}%`,
      tone: diagnosis.okrSummary.avgProgress < 50 ? 'warning' : 'ok',
    })
  }
  return metrics
}

export function executivePriorityItems(topPriorities: ExecutivePriority[]): AnswerItem[] {
  return topPriorities.map((p) => {
    const flags: string[] = []
    if (p.isOverdue) flags.push(p.overdueDays > 0 ? `vencida ${p.overdueDays}d` : 'vencida')
    if (p.isBlocked) flags.push('bloqueada')
    if (p.isHighPriority) flags.push('prioridad alta')
    return {
      kind: 'action' as const,
      id: p.action.id,
      title: p.action.title,
      status: p.action.estado ?? null,
      date: p.action.fecha ?? null,
      priority: p.action.prioridad ?? null,
      owner: p.action.responsableNombre ?? null,
      flags,
      href: p.action.href,
    }
  })
}

export function executiveComparisonItems(diagnosis: ExecutiveDiagnosis): AnswerItem[] {
  const areaItems: AnswerItem[] = diagnosis.delayedByArea.slice(0, 4).map((a) => ({
    kind: 'group',
    id: `area:${a.area}`,
    title: `Área ${a.area} (retrasos/bloqueos)`,
    count: a.delayed + a.blocked,
  }))
  const okrItems: AnswerItem[] = (diagnosis.okrSummary?.atRisk ?? []).slice(0, 3).map((o) => ({
    kind: 'okr',
    id: o.id,
    title: o.name,
    progress: o.progress,
    krCount: o.keyResults.length,
    withoutInitiatives: o.withoutInitiatives,
    insufficientKrs: o.insufficientKrs,
    href: `/okrs?objective=${encodeURIComponent(o.id)}`,
  }))
  return [...areaItems, ...okrItems]
}

export function executiveFindings(diagnosis: ExecutiveDiagnosis): AnswerFinding[] {
  const findings: AnswerFinding[] = []

  for (const [idx, p] of diagnosis.topPriorities.entries()) {
    findings.push({
      basis: 'evidence',
      risk: p.isOverdue || p.isBlocked,
      text: `Prioridad ${idx + 1}: ${p.what} Evidencia: ${p.evidence}`,
    })
    findings.push({
      basis: 'inference',
      risk: p.isOverdue || p.isBlocked,
      text: `Por qué importa (#${idx + 1}): ${p.why}`,
    })
  }

  for (const pattern of diagnosis.recurringPatterns.slice(0, 3)) {
    findings.push({
      basis: 'evidence',
      risk: true,
      text: pattern,
    })
  }

  if (diagnosis.okrSummary) {
    if (diagnosis.okrSummary.atRisk.length > 0) {
      findings.push({
        basis: 'evidence',
        risk: true,
        text: `${diagnosis.okrSummary.atRisk.length} objetivo(s) estratégico(s) avanzan por debajo de 40%: ${diagnosis.okrSummary.atRisk
          .slice(0, 3)
          .map((o) => `«${o.name}» (${Math.round(o.progress ?? 0)}%)`)
          .join(', ')}.`,
      })
    }
    if (diagnosis.okrSummary.withoutData.length > 0) {
      findings.push({
        basis: 'evidence',
        text: `${diagnosis.okrSummary.withoutData.length} OKR(s) no tienen avance calculable con los datos actuales.`,
      })
    }
  }

  return findings
}
