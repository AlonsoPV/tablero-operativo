/**
 * Descomposición de instrucciones múltiples (compound intents) y control de dependencias.
 * Reutiliza structuredActionDraft y el motor R2 existente sin duplicar pipelines por canal.
 */
import type { R2ExecutionMode } from '../actions/executionMode.js'
import type { AgentActor } from '../query/resolveActor.js'
import {
  applyDraftPatch,
  emptyStructuredDraft,
  extractActionPatch,
  resolveDraftEntities,
  type EntityResolutionCatalog,
  type StructuredActionDraft,
} from './structuredActionDraft.js'
import { draftActionAssignedMessage, firstName } from './communicationComposer.js'

export type CompoundStepKind = 'create_action' | 'update_status' | 'send_whatsapp' | 'send_email'

export type CompoundStep = {
  stepId: string
  kind: CompoundStepKind
  dependsOnStepId: string | null
  summary: string
  draft?: StructuredActionDraft
  recipientId?: string | null
  recipientName?: string | null
  recipientHint?: string | null
  channel?: 'whatsapp' | 'email'
  subject?: string | null
  messageBody?: string | null
  estado?: 'Hecho' | 'En_Ejecucion' | 'Pendiente' | 'Bloqueado'
  clarification?: string | null
  forbiddenReason?: string | null
}

export type CompoundOperationPlan = {
  steps: CompoundStep[]
  clarifications: string[]
  forbiddenReasons: string[]
  /** Congelado al confirmar: no se agregan operaciones posteriores. */
  lockedAfterConfirm: boolean
}

export type StepExecutionOutcome = {
  stepId: string
  ok: boolean
  reason?: string
}

function norm(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sentenceCase(value: string): string {
  const s = cleanSpaces(value).replace(/[.]+$/, '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Normaliza muletillas y typos frecuentes del español coloquial de México sin alterar nombres propios. */
export function normalizeColloquialTypos(utterance: string): string {
  return utterance
    .replace(/\b(watsap|whatsap|wasap|wsp|whats)\b/gi, 'whatsapp')
    .replace(/\bcoreo\b/gi, 'correo')
    .replace(/\bacion(es)?\b/gi, 'acción$1')
    .replace(/\bpendinte(s)?\b/gi, 'pendiente$1')
    .replace(/\bresponsble(s)?\b/gi, 'responsable$1')
    .replace(/\bvierns\b/gi, 'viernes')
    .replace(/\bblokeo\b/gi, 'bloqueo')
    .replace(/\bblokead([ao]s?)\b/gi, 'bloquead$1')
}

function resolveCatalogRecipient(
  hint: string | null,
  catalog: EntityResolutionCatalog,
  fallbackDraft?: StructuredActionDraft | null
): { id: string | null; name: string | null; clarification: string | null; forbidden: string | null } {
  if (!hint) {
    if (fallbackDraft?.responsableId && fallbackDraft.responsableNombre) {
      return {
        id: fallbackDraft.responsableId,
        name: fallbackDraft.responsableNombre,
        clarification: null,
        forbidden: null,
      }
    }
    return { id: null, name: null, clarification: '¿A quién deseas enviar el mensaje?', forbidden: null }
  }

  const needle = norm(hint)
  if (/^(direccion|directivos?|gerencia)$/.test(needle)) {
    const dirUsers = catalog.users.filter((u) => u.activo !== false && /direcci/i.test(norm(u.nombre)))
    if (dirUsers.length === 1) {
      return { id: dirUsers[0]!.id, name: dirUsers[0]!.nombre, clarification: null, forbidden: null }
    }
    return {
      id: null,
      name: 'Dirección',
      clarification: null,
      forbidden: null,
    }
  }

  const active = catalog.users.filter((u) => u.activo !== false)
  const exact = active.filter((u) => norm(u.nombre) === needle)
  const matches = exact.length ? exact : active.filter((u) => norm(u.nombre).includes(needle))
  if (matches.length === 1) {
    return { id: matches[0]!.id, name: matches[0]!.nombre, clarification: null, forbidden: null }
  }
  if (matches.length > 1) {
    const names = matches.slice(0, 4).map((u) => u.nombre).join(' o ')
    return {
      id: null,
      name: null,
      clarification: `¿Te refieres a ${names}?`,
      forbidden: null,
    }
  }
  return {
    id: null,
    name: null,
    clarification: null,
    forbidden: `No encontré un destinatario activo y autorizado llamado «${hint}».`,
  }
}

function extractRecipientHintFromComm(clause: string): string | null {
  const cleaned = cleanSpaces(clause)
  const m =
    cleaned.match(/\b(?:a|con)\s+(Direcci[oó]n|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/) ??
    cleaned.match(/\b(?:dile|av[ií]sale|preg[uú]ntale|recu[eé]rdale|p[ií]dele|m[aá]ndale(?:\s+un)?\s+(?:whatsapp|correo|mensaje))\s+a\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)?)/i)
  if (!m?.[1]) return null
  const candidate = m[1].trim()
  if (/^(el|la|los|las|un|una|que|mi|mis|este|esta|eso)$/i.test(norm(candidate))) return null
  return candidate
}

function splitCompoundClauses(utterance: string): string[] {
  const cleaned = cleanSpaces(normalizeColloquialTypos(utterance))
  // Divide en conectores que introducen una nueva operación explícita
  const parts = cleaned
    .split(
      /(?:,\s*|\s+y\s+)(?=(?:m[aá]nda(?:le|les)?|env[ií]a(?:le|les)?|av[ií]sa(?:le|les)?|dile|diles|preg[uú]nta(?:le|les)?|recu[eé]rda(?:le|les)?|p[ií]de(?:le|les)?|notifica(?:le|les)?|ponle|d[eé]jale|enc[aá]rgale|crea(?:me)?|as[ií]gna(?:le|sela|selo)?|comparte)\b)/i
    )
    .map((p) => p.replace(/^y\s+/i, '').trim())
    .filter((p) => p.length >= 3)
  return parts
}

/** Detecta si una instrucción contiene múltiples operaciones independientes o encadenadas. */
export function isCompoundInstruction(
  utterance: string,
  hasPendingCreateDraft = false
): boolean {
  const n = norm(normalizeColloquialTypos(utterance))
  // Seguimiento que adjunta WhatsApp/correo al borrador de acción en curso: "Y mándale un WhatsApp"
  if (
    hasPendingCreateDraft &&
    /^(?:y\s+)?(?:manda(?:le)?|envia(?:le)?|avisa(?:le)?|notifica(?:le)?)\b/.test(n) &&
    /\b(whatsapp|correo|mail|mensaje)\b/.test(n)
  ) {
    return true
  }
  // Distribución entre varias personas: "Reparte estos pendientes entre Carlos y Jorge"
  if (/\breparte\b/.test(n) && /\bentre\b/.test(n) && /\by\b/.test(n)) {
    return true
  }
  const clauses = splitCompoundClauses(utterance)
  if (clauses.length < 2) return false
  // Verificar que realmente hay al menos 2 intenciones operativas distintas (no solo atributos de la misma acción)
  // Si todas las cláusulas son comunicación al mismo destinatario ("Mándale sus pendientes y dile que priorice..."),
  // es una sola comunicación mixta, no un plan compuesto de múltiples operaciones.
  const commOnlyRe = /^(?:manda(?:le|les)?|envia(?:le|les)?|avisa(?:le|les)?|dile|diles|preguntale|recuerdale|pidele|notifica(?:le|les)?|comparte|pasale)\b/
  const nonCommActionRe = /\b(ponle|dejale|encargale|crea|crear|creame|registra|agrega|marca|asigna(?:le|sela|selo)?|eso ya quedo|ya quedo)\b/
  if (clauses.every((c) => commOnlyRe.test(norm(c))) && !clauses.some((c) => nonCommActionRe.test(norm(c)))) {
    return false
  }
  let opCount = 0
  for (const c of clauses) {
    const cn = norm(c)
    if (
      /\b(ponle|dejale|encargale|crea|crear|creame|registra|agrega|marca|asigna(?:le|sela|selo)?|eso ya quedo|ya quedo|manda|mandale|envia|enviale|avisa|avisale|dile|preguntale|recuerdale|pidele|notifica|comparte)\b/.test(
        cn
      )
    ) {
      opCount += 1
    }
  }
  return opCount >= 2
}

/** Construye un plan estructurado multi-operación con dependencias explícitas. */
export function buildCompoundOperationPlan(input: {
  utterance: string
  actor: AgentActor
  catalog: EntityResolutionCatalog
  today: string
  existingDraft?: StructuredActionDraft | null
}): CompoundOperationPlan {
  const { utterance, actor, catalog, today, existingDraft } = input
  const normalized = normalizeColloquialTypos(utterance)
  const n = norm(normalized)
  const steps: CompoundStep[] = []
  const clarifications: string[] = []
  const forbiddenReasons: string[] = []

  // Caso especial 1: seguimiento "Y mándale un WhatsApp / correo" sobre un borrador de acción activo
  if (
    existingDraft &&
    /^(?:y\s+)?(?:manda(?:le)?|envia(?:le)?|avisa(?:le)?|notifica(?:le)?)\b/.test(n) &&
    /\b(whatsapp|correo|mail|mensaje)\b/.test(n)
  ) {
    const channel: 'whatsapp' | 'email' = /\b(correo|mail)\b/.test(n) ? 'email' : 'whatsapp'
    const step1Id = 'step_1'
    steps.push({
      stepId: step1Id,
      kind: 'create_action',
      dependsOnStepId: null,
      summary: `${existingDraft.titulo ?? 'Acción'} · ${existingDraft.responsableNombre ?? 'Sin responsable'} · ${existingDraft.fecha ?? 'Sin fecha'} · ${existingDraft.tablero ?? 'Kanban corporativo'}`,
      draft: existingDraft,
    })

    const recHint = extractRecipientHintFromComm(normalized)
    const rec = resolveCatalogRecipient(recHint, catalog, existingDraft)
    if (rec.clarification) clarifications.push(rec.clarification)
    if (rec.forbidden) forbiddenReasons.push(rec.forbidden)

    const drafted = draftActionAssignedMessage({
      recipientName: rec.name,
      titulo: existingDraft.titulo,
      fecha: existingDraft.fecha,
      channel,
    })
    steps.push({
      stepId: 'step_2',
      kind: channel === 'email' ? 'send_email' : 'send_whatsapp',
      dependsOnStepId: step1Id,
      summary: `${channel === 'email' ? 'Correo' : 'WhatsApp'} a ${rec.name ?? recHint ?? 'destinatario por definir'} (solo tras crear la acción)`,
      recipientId: rec.id,
      recipientName: rec.name,
      recipientHint: recHint ?? existingDraft.responsableNombre,
      channel,
      subject: drafted.subject,
      messageBody: drafted.body,
      clarification: rec.clarification,
      forbiddenReason: rec.forbidden,
    })

    return { steps, clarifications, forbiddenReasons, lockedAfterConfirm: true }
  }

  // Caso especial 2: "Reparte estos pendientes entre Carlos y Jorge"
  const distributeMatch = normalized.match(
    /\breparte\b.*?\bentre\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?)\s+y\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?)/i
  )
  if (distributeMatch) {
    const people = [distributeMatch[1]!.trim(), distributeMatch[2]!.trim()]
    people.forEach((hint, idx) => {
      const rec = resolveCatalogRecipient(hint, catalog)
      if (rec.clarification) clarifications.push(rec.clarification)
      if (rec.forbidden) forbiddenReasons.push(rec.forbidden)
      const draft: StructuredActionDraft = {
        ...emptyStructuredDraft(),
        titulo: `Pendientes asignados a ${rec.name ?? hint}`,
        responsableId: rec.id,
        responsableNombre: rec.name,
        responsableHint: hint,
        responsableSource: 'explicit',
        tablero: 'Kanban corporativo',
        tableroKind: 'corporativo',
        tableroSource: 'inferred',
      }
      steps.push({
        stepId: `step_${idx + 1}`,
        kind: 'create_action',
        dependsOnStepId: null,
        summary: `Asignar bloque de pendientes a ${rec.name ?? hint}`,
        draft,
        clarification: rec.clarification,
        forbiddenReason: rec.forbidden,
      })
    })
    return { steps, clarifications, forbiddenReasons, lockedAfterConfirm: true }
  }

  // Caso general: descomponer cláusula por cláusula manteniendo dependencias
  const clauses = splitCompoundClauses(normalized)
  let lastActionStepId: string | null = null
  let lastActionDraft: StructuredActionDraft | null = existingDraft ?? null

  for (const clause of clauses) {
    const cn = norm(clause)
    const stepId = `step_${steps.length + 1}`

    // 1. Cierre rápido de estado: "Eso ya quedó" / "Marca como hecho ..."
    if (/\b(eso ya quedo|ya quedo|marca(?:la|lo)? como hech[ao])\b/.test(cn)) {
      steps.push({
        stepId,
        kind: 'update_status',
        dependsOnStepId: null,
        summary: 'Marcar acción referenciada como Hecho',
        estado: 'Hecho',
      })
      lastActionStepId = stepId
      continue
    }

    // 2. Comunicación WhatsApp o Correo
    const isWhatsapp = /\bwhatsapp\b/.test(cn)
    const isEmail = /\b(correo|mail|email)\b/.test(cn)
    const isDirectTell = /^(?:avisa(?:le)?|notifica(?:le)?|preguntale|recuerdale|pidele|comparte)\b/.test(cn)
    const isDile = /^dile\b/.test(cn)

    // "dile a Jorge que me entregue el reporte mañana" -> si incluye entregable + fecha, trátalo como acción + aviso o comunicación contextual
    if (isDile && /\b(entregue|revise|prepare|haga|mande|envie)\b/.test(cn) && /\b(hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(cn)) {
      const patch = extractActionPatch(clause, today, false)
      const merged = applyDraftPatch(emptyStructuredDraft(), patch)
      const res = resolveDraftEntities(merged, actor, catalog)
      if (res.clarification) clarifications.push(res.clarification)
      if (res.forbiddenReason) forbiddenReasons.push(res.forbiddenReason)
      steps.push({
        stepId,
        kind: 'create_action',
        dependsOnStepId: null,
        summary: `${res.draft.titulo ?? sentenceCase(clause)} · ${res.draft.responsableNombre ?? res.draft.responsableHint ?? 'Pendiente'} · ${res.draft.fecha ?? 'Sin fecha'}`,
        draft: res.draft,
        clarification: res.clarification,
        forbiddenReason: res.forbiddenReason,
      })
      lastActionStepId = stepId
      lastActionDraft = res.draft
      continue
    }

    if (isWhatsapp || isEmail || isDirectTell || isDile) {
      const channel: 'whatsapp' | 'email' = isEmail ? 'email' : 'whatsapp'
      const recHint = extractRecipientHintFromComm(clause)
      const rec = resolveCatalogRecipient(recHint, catalog, lastActionDraft)
      if (rec.clarification) clarifications.push(rec.clarification)
      if (rec.forbidden) forbiddenReasons.push(rec.forbidden)

      const dependsOn =
        lastActionStepId &&
        (!recHint || (lastActionDraft?.responsableNombre && norm(lastActionDraft.responsableNombre).includes(norm(recHint))) || /\b(ya quedo|avisa|avisale)\b/.test(cn))
          ? lastActionStepId
          : null

      const drafted = lastActionDraft?.titulo && dependsOn
        ? draftActionAssignedMessage({
            recipientName: rec.name,
            titulo: lastActionDraft.titulo,
            fecha: lastActionDraft.fecha,
            channel,
          })
        : {
            subject: channel === 'email' ? `Seguimiento operativo` : null,
            body: `Hola ${firstName(rec.name) || 'equipo'}, ¿me compartes una actualización breve de tus pendientes?`,
          }

      steps.push({
        stepId,
        kind: channel === 'email' ? 'send_email' : 'send_whatsapp',
        dependsOnStepId: dependsOn,
        summary: `${channel === 'email' ? 'Correo' : 'WhatsApp'} a ${rec.name ?? recHint ?? 'destinatario por definir'}${dependsOn ? ' (después del paso anterior)' : ''}`,
        recipientId: rec.id,
        recipientName: rec.name,
        recipientHint: recHint ?? lastActionDraft?.responsableNombre ?? null,
        channel,
        subject: drafted.subject,
        messageBody: drafted.body,
        clarification: rec.clarification,
        forbiddenReason: rec.forbidden,
      })
      continue
    }

    // 3. Creación estructurada de acción (incluyendo frases coloquiales: "Ponle a Carlos lo del inventario para el viernes")
    const patch = extractActionPatch(clause, today, false)
    const merged = applyDraftPatch(emptyStructuredDraft(), patch)
    const res = resolveDraftEntities(merged, actor, catalog)
    if (res.clarification) clarifications.push(res.clarification)
    if (res.forbiddenReason) forbiddenReasons.push(res.forbiddenReason)
    steps.push({
      stepId,
      kind: 'create_action',
      dependsOnStepId: null,
      summary: `${res.draft.titulo ?? sentenceCase(clause)} · ${res.draft.responsableNombre ?? res.draft.responsableHint ?? 'Pendiente'} · ${res.draft.fecha ?? 'Sin fecha'}`,
      draft: res.draft,
      clarification: res.clarification,
      forbiddenReason: res.forbiddenReason,
    })
    lastActionStepId = stepId
    lastActionDraft = res.draft
  }

  return { steps, clarifications, forbiddenReasons, lockedAfterConfirm: true }
}

/** Verifica dependencias antes de ejecutar un paso; impide notificar si la creación previa falló. */
export function canExecuteCompoundStep(
  step: CompoundStep,
  outcomes: Map<string, StepExecutionOutcome>
): { allowed: boolean; reason?: string } {
  if (!step.dependsOnStepId) return { allowed: true }
  const dep = outcomes.get(step.dependsOnStepId)
  if (!dep) {
    return { allowed: false, reason: `Operación bloqueada: falta ejecutar el paso previo (${step.dependsOnStepId}).` }
  }
  if (!dep.ok) {
    return {
      allowed: false,
      reason: 'No se envió la comunicación porque la operación previa falló y no se confirmó su guardado.',
    }
  }
  return { allowed: true }
}

/** Resume ejecución parcial de un plan agrupado sin maquillar fallos parciales. */
export function summarizeCompoundOutcomes(
  plan: CompoundOperationPlan,
  outcomes: StepExecutionOutcome[]
): { allSucceeded: boolean; text: string } {
  const map = new Map(outcomes.map((o) => [o.stepId, o]))
  const done: string[] = []
  const failed: string[] = []
  for (const step of plan.steps) {
    const out = map.get(step.stepId)
    if (out?.ok) done.push(`✓ ${step.summary}`)
    else failed.push(`✗ ${step.summary}${out?.reason ? ` — ${out.reason}` : ' — no ejecutada'}`)
  }
  const allSucceeded = failed.length === 0 && done.length === plan.steps.length
  const lines = allSucceeded
    ? ['Operaciones completadas:', ...done]
    : ['Resultado parcial (algunas operaciones no se completaron):', ...done, ...failed]
  return { allSucceeded, text: lines.join('\n') }
}

/** Formato compacto para confirmación agrupada (muestra todas las operaciones, destinatarios y contenidos). */
export function formatCompoundOperationPlan(plan: CompoundOperationPlan, mode: R2ExecutionMode): string {
  const lines: string[] = [`Plan propuesto (${plan.steps.length} operaciones):`]
  plan.steps.forEach((step, idx) => {
    lines.push(`${idx + 1}. ${step.summary}`)
    if (step.messageBody) {
      lines.push(`   Mensaje: "${step.messageBody}"`)
    }
    if (step.dependsOnStepId) {
      lines.push('   Dependencia: se ejecuta solo si el paso anterior se guarda correctamente.')
    }
  })
  if (plan.clarifications.length > 0) {
    lines.push('')
    lines.push(plan.clarifications.join(' '))
  } else if (mode === 'disabled') {
    lines.push('')
    lines.push('Borrador listo para revisión (no guardado ni enviado automáticamente).')
  } else {
    lines.push('')
    lines.push('¿Confirmas ejecutar estas operaciones, editar alguna o cancelar?')
  }
  return lines.join('\n')
}
