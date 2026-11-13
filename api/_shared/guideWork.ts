import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDueDateHint } from '../../src/features/ai-support/parseWorkFacts.js'
import { ENVIARDIAN_REPORT_VERSION } from './enviardianPrompt.js'

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

type KrCatalogEntry = {
  id: string
  title: string
  okrName: string
}

const OPEN_STATES = ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso']
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  const labeled = ['said', 'verified', 'agreed', 'recommendations', 'loDicho', 'lo_dicho'].some((key) => key in row)
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

function actionPlanLines(created: GuideCreatedWork[], pending: GuideWorkDraft[], anchorYmd: string) {
  const lines = ['Accion | Responsable | Fecha | Estado']
  for (const item of pending) {
    const owner = item.ownerHint?.trim() || 'Por definir'
    const date = commitmentDateLabel(item.dueDateHint, anchorYmd)
    lines.push(`- ${item.title} | ${owner} | ${date} | Propuesta pendiente`)
  }
  for (const item of recordedWorkFromCreated(created)) {
    const date = commitmentDateLabel(item.dueDateHint, anchorYmd)
    const note = item.alreadyExisted ? 'Ya estaba en el tablero' : 'Registrada en Scrumban'
    lines.push(`- ${item.title} | Por definir | ${date} | ${note}`)
  }
  if (lines.length === 1) lines.push('- Sin acciones en esta entrevista | Por definir | Por definir | Sin propuesta')
  return lines
}

export function formatExecutiveReport(
  report: GuideExecutiveReport | null,
  fallback: { summary?: string | null; learning?: string | null; intention?: string | null },
  created: GuideCreatedWork[],
  pending: GuideWorkDraft[] = [],
  clock?: ReportClock
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
    const recommendations = (report.recommendations?.length ? report.recommendations : priorities).slice(0, 3)
    const lines = [
      'REPORTE EJECUTIVO — ENVIARDIAN',
      `Generador: ${clock?.version || ENVIARDIAN_REPORT_VERSION}`,
      'Modalidad: entrevista por voz',
      `Inicio: ${cdmxDateTimeLabel(clock?.startedAt) || 'No disponible'}`,
      `Cierre: ${cdmxDateTimeLabel(clock?.closedAt) || 'No disponible'}`,
      `Duracion: ${sessionDurationLabel(clock?.startedAt, clock?.closedAt) || 'No disponible'}`,
      '',
      'LO DICHO',
      ...said.map((item) => `- ${item}`),
      '',
      'LO VERIFICADO',
    ]
    if (report.interviewOnly || !report.verified?.length) {
      lines.push(
        report.consultFailed
          ? 'No pude consultar el tablero durante la entrevista. Este informe se basa solo en lo conversado.'
          : 'Este informe se basa solo en la entrevista. No hubo una consulta exitosa al tablero.'
      )
    } else {
      report.verified.forEach((item) => lines.push(`- ${item}`))
    }
    lines.push('', 'LO ACORDADO')
    if (agreed.length === 0) lines.push('No hubo acuerdos en la entrevista.')
    else agreed.forEach((item) => lines.push(`- ${item}`))
    if (recommendations.length) {
      lines.push('', 'RECOMENDACIONES')
      recommendations.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
    }
    lines.push('', 'PLAN DE ACCION', ...actionPlanLines(ok, pending, anchor))
    if (nextSteps.length) {
      lines.push('', 'PROXIMOS PASOS')
      nextSteps.forEach((item) => lines.push(`- ${item}`))
    }
    return lines.join('\n').trim().slice(0, 6000)
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

function todayCdmx() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDaysYmd(ymd: string, days: number) {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function mapPriority(priority: GuideWorkDraft['priority']) {
  if (priority === 'P1_Alta') return 'P1_Critica'
  if (priority === 'P3_Baja') return 'P3_Baja'
  return 'P2_Media'
}

function buildDescription(draft: GuideWorkDraft) {
  const text = [
    draft.description,
    draft.objective ? `Objetivo: ${draft.objective}` : '',
    'Creada desde Guia.',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
  if (text.length >= 10) return text.slice(0, 4000)
  return `${draft.title}. Generada desde Guia.`.slice(0, 4000)
}

function buildEvidence(draft: GuideWorkDraft) {
  const text = draft.evidenceExpected.trim()
  if (text.length >= 5) return text.slice(0, 2000)
  return 'Evidencia de avance o cierre acordada'
}

async function loadKrCatalog(supabase: SupabaseClient): Promise<KrCatalogEntry[]> {
  const { data, error } = await supabase.rpc('okr_dashboard')
  if (error || !data || typeof data !== 'object') return []
  const payload = data as {
    objectives?: Array<{ id?: string; nombre_okr?: string }>
    keyResults?: Array<{ id?: string; okr_id?: string; title?: string }>
  }
  const objectives = Array.isArray(payload.objectives) ? payload.objectives : []
  const keyResults = Array.isArray(payload.keyResults) ? payload.keyResults : []
  const nameById = new Map(
    objectives.flatMap((item) => {
      const id = asString(item.id)
      const name = asString(item.nombre_okr)
      return id ? ([[id, name]] as const) : []
    })
  )
  return keyResults.flatMap((item) => {
    const id = asString(item.id)
    const title = asString(item.title)
    if (!id || !title) return []
    return [
      {
        id,
        title,
        okrName: nameById.get(asString(item.okr_id)) || '',
      },
    ]
  })
}

function resolveKeyResult(draft: GuideWorkDraft, catalog: KrCatalogEntry[]): KrCatalogEntry | null {
  const byId = draft.keyResultId && UUID_RE.test(draft.keyResultId)
    ? catalog.find((item) => item.id === draft.keyResultId)
    : null
  if (byId) return byId
  const needle = (draft.keyResultTitle || draft.keyResultId || '').toLowerCase()
  if (needle.length < 4) return null
  return (
    catalog.find((item) => item.title.toLowerCase() === needle) ||
    catalog.find((item) => item.title.toLowerCase().includes(needle)) ||
    catalog.find((item) => needle.includes(item.title.toLowerCase())) ||
    null
  )
}

async function insertCheckpoints(
  supabase: SupabaseClient,
  actionId: string,
  draft: GuideWorkDraft,
  usuarioId: string
) {
  const texts = [draft.title, ...draft.activities].map((text) => text.slice(0, 280)).filter(Boolean)
  if (texts.length === 0) return
  const { error } = await supabase.from('accion_checkpoints').insert(
    texts.map((texto, orden) => ({
      accion_id: actionId,
      texto,
      orden,
      obligatorio: orden === 0,
      created_by: usuarioId,
      activo: true,
      completado: false,
    }))
  )
  if (error) console.error('guideWork checkpoints', error)
}

export async function persistGuideWork(
  supabase: SupabaseClient,
  usuarioId: string,
  drafts: GuideWorkDraft[]
): Promise<GuideCreatedWork[]> {
  if (!usuarioId || drafts.length === 0) return []
  const catalog = drafts.some((draft) => draft.kind === 'initiative')
    ? await loadKrCatalog(supabase)
    : []
  const tomorrow = addDaysYmd(todayCdmx(), 1)
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

      const kr = draft.kind === 'initiative' ? resolveKeyResult(draft, catalog) : null
      const actionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const dueMatch = (draft.dueDateHint || '').match(/(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/)
      const payload: Record<string, unknown> = {
        id: actionId,
        titulo_accion: draft.title,
        descripcion_accion: buildDescription(draft),
        evidencia_esperada: buildEvidence(draft),
        fecha: dueMatch?.[1] || tomorrow,
        hora_limite: dueMatch?.[2] || '17:00',
        estado: 'Pendiente',
        responsable: usuarioId,
        prioridad: mapPriority(draft.priority),
        created_by: usuarioId,
        tipo_accion: 'operativa',
        sprint_id: null,
      }
      if (draft.kind === 'initiative') {
        payload.es_okr = true
        payload.okr_impactado = (kr?.title || draft.keyResultTitle || kr?.okrName || 'OKR').slice(0, 200)
      }

      let { error } = await supabase.from('acciones_diarias').insert(payload)
      if (error && /es_okr|okr_impactado/i.test(error.message ?? '')) {
        delete payload.es_okr
        delete payload.okr_impactado
        ;({ error } = await supabase.from('acciones_diarias').insert(payload))
      }
      if (error) throw error

      await insertCheckpoints(supabase, actionId, draft, usuarioId)

      if (draft.kind === 'initiative' && kr) {
        const { error: linkError } = await supabase.from('okr_initiatives').insert({
          key_result_id: kr.id,
          action_id: actionId,
          team_action_id: null,
        })
        if (linkError && linkError.code !== '23505') {
          console.error('guideWork okr link', linkError)
        }
      }

      created.push({
        kind: draft.kind,
        id: actionId,
        title: draft.title,
        keyResultTitle: kr?.title || draft.keyResultTitle,
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

export function guideOpening(_intent: 'consult' | 'create' = 'consult') {
  return 'Hola. Soy Guia. En quince minutos revisamos tu tablero. Que quieres atacar primero?'
}

export function guideWorkInstructions(_intent: 'consult' | 'create' = 'consult') {
  return `
No pidas que elijan consultar o crear. Lees la conversacion y cambias sola.

Apertura: "${guideOpening()}"

Si quieren entender el tablero: informa, prioriza y diagnostica. No empujes a crear.

Si piden registrar trabajo, o dictan un pendiente (crea, anota, ponme, hay que + tarea o fecha, compromiso, accion, iniciativa): arma UNA accion sin anunciar "modo crear".
Flujo corto, una pregunta a la vez, solo si falta:
1) Que hay que lograr (verbo + resultado).
2) Fecha de compromiso.
3) Evidencia de cierre.
Si ya lo dijeron, no lo vuelvas a pedir. Resume en dos frases y confirma: "si esta bien, al terminar lo dejo para aprobar".
Si corrigen, aplica el cambio al mismo borrador.
No inventes clientes, fechas ni responsables. No digas que ya quedo en el tablero.
Maximo 4 turnos para cerrar el borrador. Frases cortas. Espanol directo.

Si piden enviar un correo o agendar en Calendar: llama queue_workspace_draft (type email|event, purpose, recipient o attendees si se conocen, uttered_at ISO, time_anchor como "manana").
No envies el correo ni crees el evento en la llamada. Di que queda un borrador para revisar al colgar.
`.trim()
}

export const GUIDE_WORK_INSTRUCTIONS = guideWorkInstructions()
