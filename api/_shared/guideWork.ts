import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDueDateHint } from '../../src/features/ai-support/parseWorkFacts.js'
import {
  buildEnviardianReportDocument,
  buildSessionActions,
  serializeReportDocument,
  type EnviardianCommunicationDraftRef,
  type EnviardianTechnicalAttention,
  type EnviardianVerifiedMetric,
} from '../../src/features/guide/enviardianReportDocument.js'

export type GuideWorkKind = 'action' | 'initiative'

export type GuideWorkDraft = {
  title: string
  description: string
  objective: string
  evidenceExpected: string
  priority: 'P1_Alta' | 'P2_Media' | 'P3_Baja'
  activities: string[]
  kind: GuideWorkKind
  keyResultId: string | null
  keyResultTitle: string | null
  dueDateHint: string | null
  ownerHint: string | null
}

export type GuideCreatedWork = {
  kind: GuideWorkKind
  id: string
  title: string
  keyResultTitle?: string | null
  alreadyExisted?: boolean
  error?: string
  pending?: boolean
  dueDateHint?: string | null
  description?: string
  objective?: string
  evidenceExpected?: string
  priority?: GuideWorkDraft['priority']
  activities?: string[]
  ownerHint?: string | null
}

export type GuideExecutiveReport = {
  situation: string
  diagnosis: string
  priorities: string[]
  decisions: string[]
  nextSteps: string[]
  said?: string[]
  verified?: string[]
  agreed?: string[]
  recommendations?: string[]
  pending?: string[]
  labeled?: boolean
  interviewOnly?: boolean
  consultFailed?: boolean
}

export type ReportClock = {
  startedAt?: string | null
  closedAt?: string | null
  anchorYmd?: string | null
  version?: string
}

const OPEN_STATES = ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso']

/** La Guía no escribe acciones, checkpoints ni iniciativas. Eso sólo ocurre por la confirmación de R2. */
export const GUIDE_WRITE_CLOSED =
  'La Guía no crea acciones fuera de la confirmación de R2. No se insertó nada.'

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringList(value: unknown, max = 6) {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean).slice(0, max)
  }
  const single = asString(value)
  return single ? [single] : []
}

export function parseGuideWorkDrafts(raw: unknown): GuideWorkDraft[] {
  if (!Array.isArray(raw)) return []
  const drafts: GuideWorkDraft[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const title = asString(row.title).slice(0, 70)
    if (title.length < 4) continue
    const priorityRaw = asString(row.priority)
    const priority: GuideWorkDraft['priority'] = /p1|alta|critic/i.test(priorityRaw)
      ? 'P1_Alta'
      : /p3|baja/i.test(priorityRaw)
        ? 'P3_Baja'
        : 'P2_Media'
    const dueRaw = asString(row.dueDateHint || row.due_date_hint || row.fecha)
    const dueMatch = dueRaw.match(/20\d{2}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/)
    drafts.push({
      title,
      description: asString(row.description).slice(0, 4000),
      objective: asString(row.objective).slice(0, 500),
      evidenceExpected: asString(row.evidenceExpected || row.evidence_expected).slice(0, 2000),
      priority,
      activities: asStringList(row.activities, 8).filter((text) => text.length >= 3),
      kind: row.kind === 'initiative' ? 'initiative' : 'action',
      keyResultId: asString(row.keyResultId || row.key_result_id) || null,
      keyResultTitle: asString(row.keyResultTitle || row.key_result_title) || null,
      dueDateHint: dueMatch ? dueMatch[0].replace('T', ' ') : dueRaw || null,
      ownerHint: asString(row.ownerHint || row.owner_hint) || null,
    })
    if (drafts.length >= 5) break
  }
  return drafts
}

export function parseExecutiveReport(raw: unknown): GuideExecutiveReport | null {
  if (!raw) return null
  if (typeof raw === 'string' && raw.trim()) {
    return {
      situation: raw.trim(),
      diagnosis: '',
      priorities: [],
      decisions: [],
      nextSteps: [],
    }
  }
  if (typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const said = asStringList(row.said || row.loDicho || row.lo_dicho)
  const verified = asStringList(row.verified || row.loVerificado || row.lo_verificado)
  const agreed = asStringList(row.agreed || row.loAcordado || row.lo_acordado)
  const recommendations = asStringList(row.recommendations || row.recomendaciones)
  const pending = asStringList(row.pending || row.informacionPendiente || row.informacion_pendiente)
  const labeled = ['said', 'verified', 'agreed', 'recommendations', 'pending', 'loDicho', 'lo_dicho'].some(
    (key) => key in row
  )
  return {
    situation: asString(row.situation || row.situacion) || said.join(' '),
    diagnosis: asString(row.diagnosis || row.diagnostico),
    priorities: asStringList(row.priorities || row.prioridades),
    decisions: asStringList(row.decisions || row.decisiones),
    nextSteps: asStringList(row.nextSteps || row.next_steps || row.proximosPasos || row.proximos_pasos),
    said,
    verified,
    agreed,
    recommendations,
    pending,
    labeled,
  }
}

export function cdmxDateTimeLabel(iso: string | null | undefined) {
  if (!iso) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function cdmxYmd(iso: string | null | undefined) {
  if (!iso) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function commitmentDateLabel(hint: string | null | undefined, anchorYmd: string) {
  const raw = hint?.trim() ?? ''
  if (!raw) return 'Por definir'
  const facts = parseDueDateHint(raw, anchorYmd)
  if (facts.dateYmd) return facts.timeHm ? `${facts.dateYmd} ${facts.timeHm}` : facts.dateYmd
  const folded = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/\d|hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo/.test(folded)) {
    return 'Pendiente de confirmacion'
  }
  return 'Por definir'
}

function sessionDurationLabel(startedAt?: string | null, closedAt?: string | null) {
  if (!startedAt || !closedAt) return null
  const ms = new Date(closedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const minutes = Math.max(1, Math.round(ms / 60000))
  return `${minutes} min`
}

export function serializePendingWork(drafts: GuideWorkDraft[]): GuideCreatedWork[] {
  return drafts.map((draft) => ({
    kind: draft.kind,
    id: '',
    title: draft.title,
    keyResultTitle: draft.keyResultTitle,
    pending: true,
    dueDateHint: draft.dueDateHint,
    description: draft.description,
    objective: draft.objective,
    evidenceExpected: draft.evidenceExpected,
    priority: draft.priority,
    activities: draft.activities,
    ownerHint: draft.ownerHint,
  }))
}

export function pendingWorkFromCreated(items: GuideCreatedWork[] | null | undefined) {
  return (items ?? []).filter((item) => item.pending && item.title && !item.error)
}

export function recordedWorkFromCreated(items: GuideCreatedWork[] | null | undefined) {
  return (items ?? []).filter((item) => item.title && !item.error && !item.pending && Boolean(item.id))
}

export type FormatExecutiveExtras = {
  topic?: string | null
  sessionId?: string | null
  participant?: string | null
  headlineFinding?: string | null
  nextStep?: string | null
  keyFindings?: Array<{
    title?: string
    detail?: string
    businessImpact?: string
    evidence?: string
  }>
  risks?: Array<{ risk?: string; consequence?: string; mitigation?: string; opportunity?: string }>
  technicalAttention?: EnviardianTechnicalAttention[]
  communicationDrafts?: EnviardianCommunicationDraftRef[]
  verifiedMetrics?: EnviardianVerifiedMetric[]
}

export function formatExecutiveReport(
  report: GuideExecutiveReport | null,
  fallback: { summary?: string | null; learning?: string | null; intention?: string | null },
  created: GuideCreatedWork[],
  pending: GuideWorkDraft[] = [],
  clock?: ReportClock,
  extras?: FormatExecutiveExtras
): string {
  const situation = report?.situation || fallback.summary || 'Conversacion breve; se conserva lo esencial.'
  const diagnosis = report?.diagnosis || fallback.learning || ''
  const priorities = report?.priorities ?? []
  const decisions = report?.decisions ?? []
  const nextSteps =
    report?.nextSteps && report.nextSteps.length > 0
      ? report.nextSteps
      : fallback.intention
        ? [fallback.intention]
        : []
  const ok = created.filter((item) => !item.error)

  if (report?.labeled) {
    const anchor = clock?.anchorYmd || cdmxYmd(clock?.startedAt) || cdmxYmd(new Date().toISOString()) || '2000-01-01'
    const said = report.said?.length ? report.said : [situation]
    const agreed = report.agreed ?? []
    const pendingInfo = report.pending ?? []
    const recommendations = (report.recommendations?.length ? report.recommendations : priorities).slice(0, 3)
    const summaryText = (fallback.summary || situation).trim().slice(0, 900)
    const commitments = [
      ...pending.map((item) => ({
        action: item.title,
        ownerHint: item.ownerHint,
        dueDateHint: commitmentDateLabel(item.dueDateHint, anchor),
        status: 'proposal' as const,
      })),
      ...recordedWorkFromCreated(ok).map((item) => ({
        action: item.title,
        ownerHint: item.ownerHint,
        dueDateHint: commitmentDateLabel(item.dueDateHint, anchor),
        status: 'confirmed' as const,
      })),
      ...nextSteps.map((item) => ({
        action: item,
        status: 'pending' as const,
      })),
    ]
    const doc = buildEnviardianReportDocument({
      topic: extras?.topic,
      summary: summaryText,
      sessionId: extras?.sessionId,
      participant: extras?.participant,
      startedAt: clock?.startedAt,
      closedAt: clock?.closedAt,
      durationLabel: sessionDurationLabel(clock?.startedAt, clock?.closedAt),
      interviewOnly: report.interviewOnly,
      consultFailed: report.consultFailed,
      generationStatus: 'ready',
      llmFindings: extras?.keyFindings,
      said,
      verifiedLines: report.interviewOnly ? [] : report.verified ?? [],
      agreed,
      pending: pendingInfo,
      recommendations,
      nextSteps: [],
      risks: extras?.risks,
      commitments,
      createdWork: [
        ...pending.map((item) => ({
          title: item.title,
          pending: true,
          ownerHint: item.ownerHint,
          dueDateHint: item.dueDateHint,
          kind: item.kind,
        })),
        ...recordedWorkFromCreated(ok).map((item) => ({
          title: item.title,
          id: item.id,
          pending: false,
          ownerHint: item.ownerHint,
          dueDateHint: item.dueDateHint,
          kind: item.kind,
        })),
      ],
      // Recomendaciones LLM no se convierten en session_actions/tareas.
      sessionActions: buildSessionActions({
        createdWork: [
          ...pending.map((item) => ({
            title: item.title,
            pending: true,
            ownerHint: item.ownerHint,
            dueDateHint: item.dueDateHint,
            kind: item.kind,
          })),
          ...recordedWorkFromCreated(ok).map((item) => ({
            title: item.title,
            id: item.id,
            pending: false,
            ownerHint: item.ownerHint,
            dueDateHint: item.dueDateHint,
            kind: item.kind,
          })),
        ],
        recommendations: [],
      }),
      headlineFinding: extras?.headlineFinding,
      nextStep: extras?.nextStep,
      technicalAttention: extras?.technicalAttention ?? [],
      communicationDrafts: extras?.communicationDrafts ?? [],
      verifiedMetrics: extras?.verifiedMetrics ?? [],
    })
    return serializeReportDocument(doc)
  }

  const lines = ['REPORTE EJECUTIVO — GUIA', '', 'SITUACION', situation]
  if (diagnosis) lines.push('', 'DIAGNOSTICO', diagnosis)
  if (priorities.length) {
    lines.push('', 'PRIORIDADES')
    priorities.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
  }
  if (decisions.length) {
    lines.push('', 'DECISIONES')
    decisions.forEach((item) => lines.push(`- ${item}`))
  }
  if (nextSteps.length) {
    lines.push('', 'PROXIMOS PASOS')
    nextSteps.forEach((item) => lines.push(`- ${item}`))
  }
  const recorded = recordedWorkFromCreated(ok)
  if (pending.length) {
    lines.push('', 'PARA APROBAR')
    for (const item of pending) {
      const tag = item.kind === 'initiative' ? 'Iniciativa' : 'Accion'
      const date = item.dueDateHint ? ` · ${item.dueDateHint}` : ''
      lines.push(`- ${tag}: ${item.title}${date}`)
    }
  }
  if (recorded.length) {
    lines.push('', 'TRABAJO CREADO')
    for (const item of recorded) {
      const tag = item.kind === 'initiative' ? 'Iniciativa' : 'Accion'
      const link = item.keyResultTitle ? ` (KR: ${item.keyResultTitle})` : ''
      const existed = item.alreadyExisted ? ' — ya estaba en el tablero' : ''
      lines.push(`- ${tag}: ${item.title}${link}${existed}`)
    }
  }
  return lines.join('\n').trim().slice(0, 6000)
}

export function formatCreatedWorkReply(created: GuideCreatedWork[]): string {
  const ok = created.filter((item) => !item.error)
  const failed = created.filter((item) => item.error)
  if (!ok.length && !failed.length) return ''
  const parts: string[] = []
  if (ok.length) {
    const bits = ok.map((item) => {
      const tag = item.kind === 'initiative' ? 'iniciativa' : 'accion'
      const link = item.keyResultTitle ? `, ligada a ${item.keyResultTitle}` : ''
      const existed = item.alreadyExisted ? ' (ya existia)' : ''
      return `${tag} «${item.title}»${link}${existed}`
    })
    parts.push(`Quedo en el tablero: ${bits.join('; ')}.`)
  }
  if (failed.length) {
    parts.push(`No pude crear: ${failed.map((item) => `«${item.title}»`).join(', ')}.`)
  }
  return parts.join(' ')
}

export function normalizeCreatedWork(raw: unknown): GuideCreatedWork[] {
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const title = asString(row.title)
    const id = asString(row.id)
    if (!title) return []
    const pending = row.pending === true || (!id && row.pending !== false && !asString(row.error))
    const priorityRaw = asString(row.priority)
    const priority: GuideWorkDraft['priority'] | undefined = /p1|alta|critic/i.test(priorityRaw)
      ? 'P1_Alta'
      : /p3|baja/i.test(priorityRaw)
        ? 'P3_Baja'
        : priorityRaw
          ? 'P2_Media'
          : undefined
    return [
      {
        kind: row.kind === 'initiative' ? 'initiative' : 'action',
        id,
        title,
        keyResultTitle: asString(row.keyResultTitle) || null,
        alreadyExisted: row.alreadyExisted === true,
        error: asString(row.error) || undefined,
        pending,
        dueDateHint: asString(row.dueDateHint) || null,
        description: asString(row.description) || undefined,
        objective: asString(row.objective) || undefined,
        evidenceExpected: asString(row.evidenceExpected) || undefined,
        priority,
        activities: asStringList(row.activities, 8),
        ownerHint: asString(row.ownerHint) || null,
      } satisfies GuideCreatedWork,
    ]
  })
}

export function withWorkInInterpretation(text: string | null | undefined, created: GuideCreatedWork[]) {
  const line = formatCreatedWorkReply(created)
  if (!line) return (text || '').slice(0, 1500) || null
  return [text?.trim(), line].filter(Boolean).join('\n').slice(0, 1500)
}

/**
 * No crea trabajo. Si ya hay una acción abierta con el mismo título, la señala.
 * En cualquier otro caso devuelve el cierre de escritura y no llama a insert.
 */
export async function persistGuideWork(
  supabase: SupabaseClient,
  usuarioId: string,
  drafts: GuideWorkDraft[]
): Promise<GuideCreatedWork[]> {
  if (!usuarioId || drafts.length === 0) return []
  const created: GuideCreatedWork[] = []

  for (const draft of drafts) {
    try {
      const { data: existing, error: existingError } = await supabase
        .from('acciones_diarias')
        .select('id,titulo_accion')
        .eq('responsable', usuarioId)
        .eq('titulo_accion', draft.title)
        .in('estado', OPEN_STATES)
        .limit(1)
        .maybeSingle()
      if (existingError) console.error('guideWork existing', existingError)
      if (existing?.id) {
        created.push({
          kind: draft.kind,
          id: existing.id as string,
          title: draft.title,
          keyResultTitle: draft.keyResultTitle,
          alreadyExisted: true,
        })
        continue
      }
      created.push({
        kind: draft.kind,
        id: '',
        title: draft.title,
        keyResultTitle: draft.keyResultTitle,
        error: GUIDE_WRITE_CLOSED,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el trabajo.'
      console.error('guideWork persist', error)
      created.push({
        kind: draft.kind,
        id: '',
        title: draft.title,
        keyResultTitle: draft.keyResultTitle,
        error: message.slice(0, 220),
      })
    }
  }

  return created
}

function normalizeIntentText(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function inferGuideWorkIntent(text: string): 'consult' | 'create' {
  const n = normalizeIntentText(text)
  if (!n.trim()) return 'consult'
  const asksRecord =
    /\b(crea(?:r|me)?|genera(?:r|me)?|agrega(?:r|me)?|registra(?:r)?|anota(?:r|me)?|apunta(?:r|me)?|ponme|dejame|deja una|armame|arma una|ponlo|anota eso|quiero que quede|en el tablero)\b/.test(
      n
    )
  if (
    /\b(que conviene|que (debo |deberia )?(prioriz|atacar|optimiz)|como va|diagnostico|resumen del tablero|que esta pasando)\b/.test(
      n
    ) &&
    !asksRecord
  ) {
    return 'consult'
  }
  const namesWork = /\b(accion|iniciativa|pendiente|tarea|compromiso|okr|objetivo|kr|medicion|kpi)\b/.test(n)
  const task =
    /\b(llamar|cerrar|entregar|revisar|enviar|preparar|subir|publicar|agendar|seguir|resolver|comprar|hablar|mandar)\b/.test(
      n
    )
  const date =
    /\b(hoy|manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|para el \d|el \d{1,2} de)\b/.test(
      n
    )
  const commitment = /\b(hay que|tenemos que|necesito que|vamos a)\b/.test(n)
  if (asksRecord) return 'create'
  if (namesWork && (commitment || date || task)) return 'create'
  if (commitment && (task || date) && !/\b(prioriz|conviene|optimiz|diagnost)\b/.test(n) && n.length > 22) {
    return 'create'
  }
  return 'consult'
}

export function inferGuideWorkIntentFromMessages(messages: Array<{ role?: string; content?: string }>) {
  const userText = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content || '')
    .join('\n')
  return inferGuideWorkIntent(userText)
}

export type GuideSessionWorkIntent = 'consult' | 'create' | 'action' | 'whatsapp' | 'email'

function normalizeSessionWorkIntent(intent: GuideSessionWorkIntent = 'consult') {
  if (intent === 'create') return 'action'
  return intent
}

export function guideOpening(intent: GuideSessionWorkIntent = 'consult') {
  const mode = normalizeSessionWorkIntent(intent)
  if (mode === 'action') {
    return 'Hola. Soy Guia. Vamos a dejar una accion o iniciativa lista para aprobar. Que hay que lograr?'
  }
  if (mode === 'whatsapp') {
    return 'Hola. Soy Guia. Preparamos un WhatsApp para revisar al terminar. Para quien y sobre que?'
  }
  if (mode === 'email') {
    return 'Hola. Soy Guia. Preparamos un correo para revisar al terminar. Para quien y sobre que?'
  }
  return 'Hola. Soy Guia. En quince minutos revisamos tu tablero. Que quieres atacar primero?'
}

export function guideWorkInstructions(intent: GuideSessionWorkIntent = 'consult') {
  const mode = normalizeSessionWorkIntent(intent)
  const createBias =
    mode === 'action'
      ? `
Modo Accion activo (el usuario lo eligio antes de empezar): asume que quiere registrar trabajo.
No preguntes si prefiere consultar o crear. Abre creando: pide o confirma titulo, fecha y evidencia.
Usa create_action (o initiative) en cuanto tengas titulo util; confirma con confirm_pending_op tras el "si".
Solo cambia a consulta pura si pide expresamente un diagnostico del tablero sin pendiente.
`
      : mode === 'whatsapp'
        ? `
Modo WhatsApp activo: prioriza queue_workspace_draft action=prepare channel=whatsapp.
Pide destinatario y proposito si faltan (una pregunta). No envies. No leas el borrador completo.
No armes acciones salvo pedido explicito.
`
        : mode === 'email'
          ? `
Modo Correo activo: usa scrumban tool=notify_action_email con action_id o query.
Si falta la acción, pide su título. El correo se dirige al responsable con la plantilla y los elementos del Kanban.
Usa mensaje para una nota adicional. La aprobación se hace en la app.
`
          : `
No pidas que elijan consultar o crear. Lees la conversacion y cambias sola.
Si quieren entender el tablero: informa, prioriza y diagnostica. No empujes a crear.
`

  return `
${createBias.trim()}

Apertura: "${guideOpening(mode)}"

Si piden registrar trabajo, o dictan un pendiente (crea, anota, ponme, hay que + tarea o fecha, compromiso, accion, iniciativa): arma UNA accion sin anunciar "modo crear".
Flujo corto, una pregunta a la vez, solo si falta:
1) Que hay que lograr (verbo + resultado).
2) Fecha de compromiso.
3) Evidencia de cierre.
Si ya lo dijeron, no lo vuelvas a pedir. Resume en dos frases y confirma: "si esta bien, al terminar lo dejo para aprobar".
Si corrigen, aplica el cambio al mismo borrador.
No inventes clientes, fechas ni responsables. No digas que ya quedo en el tablero.
Maximo 4 turnos para cerrar el borrador. Frases cortas. Espanol directo.

Comunicaciones — interpreta intencion (no solo palabras clave):
A) WhatsApp: queue_workspace_draft action=prepare, channel=whatsapp, purpose y recipient. Correo: scrumban tool=notify_action_email con action_id o query y mensaje opcional. Si pide ambos, prepara cada canal con su herramienta.
B) Para corregir un borrador de WhatsApp, usa action=update con pending_op_id. Si pide correo, identifica la acción y usa notify_action_email.
C) Mencion informativa ("tenemos que mejorar WhatsApp", "nunca revisa correos", "el cliente nos escribio"): NO uses la tool. Si hay intencion suave de actuar: pregunta "Quieres que te deje preparado el mensaje?" — nunca ante comentario meramente informativo.
D) Cancel/mod ("ya no prepares", "cambia a Mariana", "quita costos"): action=cancel o update. "Prepara otro" = nuevo prepare.
Si el canal no se deduce: una sola pregunta "Lo prefieres por WhatsApp o correo?" — no encoles hasta saber el canal.
"Voy a enviar" ≠ prepare. "Deberiamos" ≠ prepare. "Envia este correo" = prepare + revision al colgar (no envio en la llamada).
Guarda pending_op_id(s). Varios mensajes = varios prepare. Si la tool falla, dilo y ofrece reintentar. No inventes borradores solo desde la transcripcion.
Si piden agendar: channel/type event + time_anchor.
Confirma en una frase SOLO si la tool ok. Si falta contacto: "Lo dejo preparado y podras completar el dato al revisar."
No leas el borrador completo. No pidas "que quieres que diga" si la llamada ya tiene acuerdos. No pidas aprobacion de envio por voz. No envies nada en la llamada.
`.trim()
}

export const GUIDE_WORK_INSTRUCTIONS = guideWorkInstructions()
