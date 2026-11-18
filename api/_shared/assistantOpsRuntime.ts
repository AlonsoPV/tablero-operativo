import { executeDailySummaryUpdate, proposeDailySummaryUpdate, readDailySummary } from './assistantDailySummary.js'
import { canManageActionsByRole, isAnalystByRole } from '../../src/features/auth/lib/permissions.js'
import { isCopilotWriteTool } from '../../src/features/ai-support/copilot/catalog.js'
import { isGoogleWriteTool, type CopilotWorkspacePreview } from '../../src/features/ai-support/copilot/googleWorkspace.js'
import { isCommunicationWriteTool } from '../../src/features/ai-support/copilot/communicationTools.js'
import { dispatchGoogleTool, executeGoogleWrite } from './assistantGoogleTools.js'
import { executeWhatsappWrite, prepareWhatsappDraft, readWhatsappStatus } from './assistantCommunicationDrafts.js'
import { createPendingOp, insertAssistantOpLog, type CopilotActor } from './assistantPending.js'
import { canSendCommunication, normalizeGuideAccessMode } from './guideUserLinks.js'
import { assertWorkspaceHash } from './workspaceHash.js'
import {
  evaluatePendingTransition,
  matchActionsByQuery,
  wrapUntrustedToolData,
  type NamedPerson,
} from '../../src/features/ai-support/copilot/matching.js'
import { searchActivePeopleByName } from './searchActivePeople.js'
import { draftFromRequest, evidenceOrPlaceholder, sanitizeCheckpoints } from '../../src/features/ai-support/creationDraft.js'
import { parseDueDateHint } from '../../src/features/ai-support/parseWorkFacts.js'
import { todayWallClockCDMX } from '../../src/lib/dateUtils.js'
import {
  isCorporateBlocked,
  isCorporateOverdue,
  readWasTruncated,
} from '../../src/features/metrics/corporateActionMetrics.js'
import { validateFutureDateTimeCDMX } from '../../src/lib/futureDateValidation.js'
import type {
  CopilotClarification,
  CopilotProposal,
  CopilotToolName,
  CopilotToolResult,
} from '../../src/features/ai-support/copilot/types.js'
import { dispatchBoardReadTool } from './assistantBoardReads.js'
import {
  actionMatchesStatusGroup,
  actionMatchesVisual,
  canUseWideActionScope,
  parseActionQueryScope,
  parseActionQueryStatusGroup,
  parseActionQueryVisual,
  populationLabel,
  type ActionQueryScope,
  type ActionQueryStatusGroup,
  type PriorityCatalogRow,
} from './actionQueryContract.js'
import { resolveCommunicationRecipient } from './resolveCommunicationRecipient.js'
import { sanitizeRecipientFacingText } from '../../src/features/ai-support/copilot/pendingOpTaxonomy.js'
import { createServiceRoleClient } from './assistantAuth.js'
import { invokeNotificationEmail } from './invokeNotificationEmail.js'
import { GoogleUserError } from './googleUserClient.js'
import {
  ACCION_SHARE_EMAIL_TITLE,
  buildAccionEmailPayload,
} from '../../src/lib/accionNotificationEmail.js'

export type { CopilotActor } from './assistantPending.js'

const OPEN_STATES = ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso']
const ACTION_COLS =
  'id,fecha,titulo_accion,descripcion_accion,responsable,created_by,hora_limite,evidencia_esperada,evidencia_cargada,estado,prioridad,prioridad_id,area,updated_at,verificador_dato,verificador_gobierno'
const STALE_DAYS = 3
const MY_ACTIONS_READ_LIMIT = 200

type ActionRow = {
  id: string
  fecha?: string | null
  titulo_accion?: string | null
  descripcion_accion?: string | null
  responsable?: string | null
  created_by?: string | null
  hora_limite?: string | null
  evidencia_esperada?: string | null
  evidencia_cargada?: boolean | null
  estado?: string | null
  prioridad?: string | null
  prioridad_id?: string | null
  area?: string | null
  updated_at?: string | null
  verificador_dato?: string | null
  verificador_gobierno?: string | null
}

function asArgs(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function actionHref(id: string) {
  return `/kanban?accion=${encodeURIComponent(id)}`
}

function actionTitle(row: ActionRow) {
  return row.titulo_accion?.trim() || row.descripcion_accion?.trim() || 'Accion'
}

function actorSeesOrganization(actor: Pick<CopilotActor, 'boardScope'>) {
  return actor.boardScope === 'organization'
}

/** Un analista solo ve acciones de las que es responsable, salvo lectura organizacional del piloto. */
export function analystCanSeeAction(
  rol: string | null | undefined,
  actorUsuarioId: string,
  row: { responsable?: string | null },
  boardScope?: CopilotActor['boardScope']
) {
  if (boardScope === 'organization') return true
  if (!isAnalystByRole(rol)) return true
  return Boolean(actorUsuarioId) && row.responsable === actorUsuarioId
}

function clipList<T>(rows: T[], limit: number) {
  return rows.slice(0, Math.min(12, Math.max(1, limit)))
}

function addDays(today: string, days: number) {
  const base = Date.parse(`${today}T12:00:00`)
  const next = new Date(base + days * 86_400_000)
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function summarizeAction(row: ActionRow) {
  return {
    id: row.id,
    title: actionTitle(row),
    estado: row.estado,
    fecha: row.fecha,
    hora: row.hora_limite,
    prioridad: row.prioridad,
    href: actionHref(row.id),
  }
}

async function loadOpenActions(actor: CopilotActor, allBoard: boolean) {
  let q = actor.supabase.from('acciones_diarias').select(ACTION_COLS).in('estado', OPEN_STATES)
  if (!allBoard) q = q.eq('responsable', actor.usuarioId)
  const { data, error } = await q.order('fecha', { ascending: true }).limit(80)
  if (error) throw error
  return (data ?? []) as ActionRow[]
}

async function loadPriorityCatalog(actor: CopilotActor): Promise<PriorityCatalogRow[]> {
  const { data, error } = await actor.supabase
    .from('priorities')
    .select('id,nombre,color,activo')
    .eq('activo', true)
    .limit(80)
  if (error) {
    console.warn('loadPriorityCatalog', error.message)
    return []
  }
  return (data ?? []) as PriorityCatalogRow[]
}

async function loadActionsForScope(
  actor: CopilotActor,
  scope: ActionQueryScope,
  statusGroup: ActionQueryStatusGroup
): Promise<{ rows: ActionRow[]; loadTruncated: boolean }> {
  const uid = actor.usuarioId
  if (statusGroup === 'verification') {
    let q = actor.supabase.from('acciones_diarias').select(ACTION_COLS).eq('estado', 'Hecho')
    if (scope === 'assigned_to_me') {
      q = q.or(
        `responsable.eq.${uid},verificador_dato.eq.${uid},verificador_gobierno.eq.${uid}`
      )
    } else if (scope === 'created_by_me') {
      q = q.eq('created_by', uid)
    } else if (scope === 'assigned_to_me_or_created') {
      q = q.or(
        `responsable.eq.${uid},created_by.eq.${uid},verificador_dato.eq.${uid},verificador_gobierno.eq.${uid}`
      )
    } else {
      // team/board: verification relacionadas al actor siguen acotadas a su vínculo
      q = q.or(
        `responsable.eq.${uid},verificador_dato.eq.${uid},verificador_gobierno.eq.${uid},created_by.eq.${uid}`
      )
    }
    const { data, error } = await q.order('fecha', { ascending: true }).limit(MY_ACTIONS_READ_LIMIT)
    if (error) throw error
    const rows = (data ?? []) as ActionRow[]
    return { rows, loadTruncated: readWasTruncated(rows.length, MY_ACTIONS_READ_LIMIT) }
  }

  let q = actor.supabase.from('acciones_diarias').select(ACTION_COLS).in('estado', OPEN_STATES)
  if (scope === 'assigned_to_me') {
    q = q.eq('responsable', uid)
  } else if (scope === 'created_by_me') {
    q = q.eq('created_by', uid)
  } else if (scope === 'assigned_to_me_or_created') {
    q = q.or(`responsable.eq.${uid},created_by.eq.${uid}`)
  }
  // team_authorized / board_authorized: sin filtro de persona (autorización previa)
  const { data, error } = await q.order('fecha', { ascending: true }).limit(MY_ACTIONS_READ_LIMIT)
  if (error) throw error
  let rows = (data ?? []) as ActionRow[]
  if (scope === 'team_authorized') {
    rows = rows.filter((row) => row.responsable !== uid)
  }
  return { rows, loadTruncated: readWasTruncated((data ?? []).length, MY_ACTIONS_READ_LIMIT) }
}

async function loadAction(actor: CopilotActor, id: string) {
  const { data, error } = await actor.supabase
    .from('acciones_diarias')
    .select(ACTION_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as ActionRow | null) ?? null
}

async function searchPeople(actor: CopilotActor, name: string): Promise<NamedPerson[]> {
  return searchActivePeopleByName(actor.supabase, name)
}

function peopleClarification(people: NamedPerson[]): CopilotClarification {
  return {
    question: 'Hay varias personas con ese nombre. Elige a quien asignar.',
    options: people.slice(0, 6).map((person) => ({
      id: person.id,
      label: `${person.nombre}${person.area ? ` · ${person.area}` : ''}`,
    })),
  }
}

function actionsClarification(rows: ActionRow[]): CopilotClarification {
  return {
    question: 'Hay varias acciones que coinciden. Elige la correcta.',
    options: rows.slice(0, 6).map((row) => ({
      id: row.id,
      label: `${actionTitle(row)} · ${row.estado ?? ''} · ${row.fecha ?? ''}`,
    })),
  }
}

async function resolveAction(
  actor: CopilotActor,
  args: Record<string, unknown>
): Promise<ActionRow | CopilotClarification | { missing: string }> {
  const orgRead = actorSeesOrganization(actor)
  const analyst = !orgRead && isAnalystByRole(actor.rol)
  const id = asString(args.action_id, 80)
  if (id) {
    const row = await loadAction(actor, id)
    if (!row || !analystCanSeeAction(actor.rol, actor.usuarioId, row, actor.boardScope)) {
      return { missing: 'No encontré esa acción o no tienes permiso para verla.' }
    }
    return row
  }
  const query = asString(args.query, 160)
  if (!query) return { missing: 'Indica la acción (título o selección en el panel).' }
  const open = await loadOpenActions(actor, !analyst)
  const matches = matchActionsByQuery(open, query) as ActionRow[]
  if (matches.length === 0) {
    if (analyst) return { missing: `No encontré una acción visible que coincida con "${query}".` }
    const mine = await loadOpenActions(actor, false)
    const mineMatches = matchActionsByQuery(mine, query) as ActionRow[]
    if (mineMatches.length === 1) return mineMatches[0]
    if (mineMatches.length > 1) return actionsClarification(mineMatches)
    return { missing: `No encontré una acción visible que coincida con "${query}".` }
  }
  if (matches.length > 1) return actionsClarification(matches)
  return matches[0]
}

async function resolveAssignee(
  actor: CopilotActor,
  args: Record<string, unknown>
): Promise<NamedPerson | CopilotClarification | { missing: string } | null> {
  const id = asString(args.assignee_id, 80)
  if (id) {
    const { data } = await actor.supabase
      .from('usuarios')
      .select('id,nombre,rol,area')
      .eq('id', id)
      .eq('activo', true)
      .maybeSingle()
    if (!data) return { missing: 'No encontré ese responsable o no está activo.' }
    return data as NamedPerson
  }
  const name = asString(args.assignee_name, 80)
  if (!name) return null
  const matches = await searchPeople(actor, name)
  if (matches.length === 0) return { missing: `No encontré un usuario activo llamado "${name}".` }
  if (matches.length > 1) return peopleClarification(matches)
  return matches[0]
}

const insertLog = insertAssistantOpLog

function denied(tool: CopilotToolName, error: string): CopilotToolResult {
  return { ok: false, tool, kind: 'denied', error }
}

function clarification(tool: CopilotToolName, value: CopilotClarification): CopilotToolResult {
  return { ok: true, tool, kind: 'clarification', clarification: value }
}

function readOk(tool: CopilotToolName, data: unknown): CopilotToolResult {
  return { ok: true, tool, kind: 'read', data: wrapUntrustedToolData(data) }
}

async function toolGetMyActions(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const scope = parseActionQueryScope(args.scope)
  const status_group = parseActionQueryStatusGroup(args.status_group, args.filter)
  const visual = parseActionQueryVisual(args.visual)
  const includeCount = args.include_count !== false
  const today = todayWallClockCDMX()
  const weekEnd = addDays(today, 7)
  const now = Date.now()
  const asOf = new Date().toISOString()

  if (!canUseWideActionScope(scope, { rol: actor.rol, boardScope: actor.boardScope })) {
    return denied(
      'get_my_actions',
      'No tienes vista de tablero completo. Usa scope assigned_to_me o created_by_me.'
    )
  }

  const [{ rows, loadTruncated }, priorities] = await Promise.all([
    loadActionsForScope(actor, scope, status_group),
    visual === 'none' ? Promise.resolve([] as PriorityCatalogRow[]) : loadPriorityCatalog(actor),
  ])

  const filtered = rows.filter((row) => {
    if (
      !actionMatchesStatusGroup(row, status_group, {
        today,
        weekEnd,
        now,
        staleDays: STALE_DAYS,
      })
    ) {
      return false
    }
    return actionMatchesVisual(row, visual, priorities, now)
  })

  const limit = asNumber(args.limit) ?? (includeCount ? 10 : 10)
  const items = clipList(filtered.map(summarizeAction), limit)
  const total = filtered.length
  const filters_applied = { status_group, visual }
  const population = populationLabel(scope)

  return readOk('get_my_actions', {
    scope,
    filters_applied,
    filter: status_group,
    status_group,
    visual,
    today,
    as_of: asOf,
    population,
    total,
    count: total,
    returned: items.length,
    truncated: loadTruncated || filtered.length > items.length,
    items,
    spoken_hint:
      includeCount
        ? `Di el total del campo total (${total}). No inventes cifras ni diagnostiques sin pedir recomendacion.`
        : undefined,
  })
}

async function toolGetActionDetails(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const resolved = await resolveAction(actor, args)
  if ('missing' in resolved) return denied('get_action_details', resolved.missing)
  if ('question' in resolved) return clarification('get_action_details', resolved)
  const [comments, checks] = await Promise.all([
    actor.supabase
      .from('accion_comentarios')
      .select('contenido,created_at')
      .eq('accion_id', resolved.id)
      .order('created_at', { ascending: false })
      .limit(8),
    actor.supabase
      .from('accion_checkpoints')
      .select('id,texto,completado,obligatorio,orden')
      .eq('accion_id', resolved.id)
      .eq('activo', true)
      .order('orden', { ascending: true }),
  ])
  return readOk('get_action_details', {
    action: summarizeAction(resolved),
    evidencia_esperada: resolved.evidencia_esperada,
    evidencia_cargada: resolved.evidencia_cargada,
    checklist: checks.data ?? [],
    comments: (comments.data ?? []).map((row) => ({
      created_at: (row as { created_at?: string }).created_at,
      contenido: String((row as { contenido?: string }).contenido ?? '').slice(0, 280),
    })),
  })
}

async function toolGetTeamActions(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  // Misma amplitud que dashboard/search del tablero: Analista solo ve lo propio, salvo piloto org.
  if (!actorSeesOrganization(actor) && isAnalystByRole(actor.rol)) {
    return denied(
      'get_team_actions',
      'No tienes vista de tablero completo. Solo puedo consultar tus acciones asignadas.'
    )
  }
  const rows = (await loadOpenActions(actor, true)).filter((row) => row.responsable !== actor.usuarioId)
  const hot = rows.filter((row) => {
    if (!row.id || !row.estado || !row.fecha) return false
    const action = { id: row.id, estado: row.estado, fecha: row.fecha, hora_limite: row.hora_limite }
    return isCorporateOverdue(action) || isCorporateBlocked(action)
  })
  const items = clipList(hot.map(summarizeAction), asNumber(args.limit) ?? 10)
  return readOk('get_team_actions', {
    population: 'acciones_corporativas',
    truncated: readWasTruncated(rows.length, 80) || hot.length > items.length,
    items,
  })
}

async function toolGetPendingVerifications(actor: CopilotActor): Promise<CopilotToolResult> {
  let q = actor.supabase.from('acciones_diarias').select(ACTION_COLS).eq('estado', 'Hecho')
  if (!actorSeesOrganization(actor)) {
    q = q.or(
      `responsable.eq.${actor.usuarioId},verificador_dato.eq.${actor.usuarioId},verificador_gobierno.eq.${actor.usuarioId},created_by.eq.${actor.usuarioId}`
    )
  }
  const { data, error } = await q.limit(20)
  if (error) throw error
  return readOk('get_pending_verifications', {
    items: ((data ?? []) as ActionRow[]).map(summarizeAction),
  })
}

async function toolSearchPeople(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const name = asString(args.name, 80)
  if (!name) return denied('search_people', 'Indica un nombre.')
  const matches = await searchPeople(actor, name)
  if (matches.length > 1) return clarification('search_people', peopleClarification(matches))
  const items = await Promise.all(
    matches.map(async (person) => {
      const { data: email } = await actor.supabase.rpc('assistant_person_email', {
        p_usuario_id: person.id,
      })
      return {
        id: person.id,
        nombre: person.nombre,
        area: person.area,
        rol: person.rol,
        email: typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null,
      }
    })
  )
  return readOk('search_people', { items })
}

async function proposeCreate(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  if (isAnalystByRole(actor.rol)) {
    return denied('create_action', 'El rol Analista no puede crear acciones.')
  }
  const request = asString(args.request, 500)
  const draft = request ? draftFromRequest(request) : null
  if (draft?.intent === 'recommend') {
    return denied('create_action', 'Eso es una recomendación. Pregunta si quiere que prepare una acción.')
  }
  if (draft?.intent === 'batch') {
    return denied(
      'create_action',
      'Son varias acciones. Prepara una propuesta por cada una; no creo el lote en silencio.'
    )
  }
  const title = asString(args.title, 70) || draft?.title || ''
  if (title.length < 3) return denied('create_action', 'Indica un título de al menos 3 caracteres.')
  const dueHint = asString(args.due_hint, 80) || asString(args.fecha, 20) || request
  const parsed = parseDueDateHint(dueHint || title, todayWallClockCDMX())
  const fecha = parsed.dateYmd
  const hora = asString(args.due_time, 8) || parsed.timeHm || '17:00'
  if (!fecha) return denied('create_action', 'Indica una fecha de compromiso (por ejemplo, el próximo lunes).')
  const futureError = validateFutureDateTimeCDMX(fecha, hora, 'La fecha y hora limite')
  if (futureError) return denied('create_action', futureError)

  const assignee = await resolveAssignee(actor, args)
  if (assignee && 'missing' in assignee) return denied('create_action', assignee.missing)
  if (assignee && 'question' in assignee) return clarification('create_action', assignee)
  const responsableId = assignee?.id ?? actor.usuarioId
  const responsableNombre = assignee?.nombre ?? 'ti'
  const descriptionRaw = asString(args.description, 4000)
  const description =
    descriptionRaw.length >= 10 ? descriptionRaw : draft?.description || title
  const evidence = evidenceOrPlaceholder(asString(args.evidence_expected, 2000) || draft?.evidence)
  const checkpoints = sanitizeCheckpoints(args.checkpoints).length
    ? sanitizeCheckpoints(args.checkpoints)
    : draft?.checkpoints ?? []
  const prioridad = asString(args.priority, 20) || 'P2_Media'
  const asksNotification = args.notify_whatsapp === true || draft?.asksNotification === true

  const proposal = await createPendingOp(actor, {
    tool: 'create_action',
    payload: {
      titulo_accion: title,
      descripcion_accion: description,
      evidencia_esperada: evidence,
      fecha,
      hora_limite: hora,
      estado: 'Pendiente',
      responsable: responsableId,
      prioridad,
      created_by: actor.usuarioId,
      tipo_accion: 'operativa',
      checkpoints,
    },
    proposal: {
      title: 'Crear accion',
      summary: `Propuesta, todavía no creada: "${title}" para ${responsableNombre}.`,
      fields: [
        { label: 'Titulo', to: title },
        { label: 'Descripcion', to: description.slice(0, 180) },
        { label: 'Responsable', to: responsableNombre },
        { label: 'Fecha', to: `${fecha} ${hora}` },
        { label: 'Prioridad', to: prioridad },
        { label: 'Checkpoints', to: checkpoints.length ? checkpoints.join(' · ') : 'Ninguno' },
        {
          label: 'Aviso WhatsApp',
          to: asksNotification
            ? 'No se envía con esta confirmación. Hay que pedirlo después de crearla.'
            : 'No solicitado',
        },
      ],
    },
  })
  return { ok: true, tool: 'create_action', kind: 'proposal', proposal }
}

async function proposeUpdate(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const resolved = await resolveAction(actor, args)
  if ('missing' in resolved) return denied('update_action', resolved.missing)
  if ('question' in resolved) return clarification('update_action', resolved)

  const patch: Record<string, unknown> = {}
  const fields: CopilotProposal['fields'] = []
  const dueHint = asString(args.due_hint, 80)
  const parsed = dueHint ? parseDueDateHint(dueHint, todayWallClockCDMX()) : { dateYmd: null, timeHm: null }
  const fecha = asString(args.fecha, 20) || parsed.dateYmd
  const hora = asString(args.hora_limite, 8) || parsed.timeHm
  if (fecha) {
    patch.fecha = fecha
    fields.push({ label: 'Fecha', from: resolved.fecha || '', to: fecha })
  }
  if (hora) {
    patch.hora_limite = hora
    fields.push({ label: 'Hora', from: resolved.hora_limite || '', to: hora })
  }
  if (asString(args.prioridad, 20)) {
    patch.prioridad = asString(args.prioridad, 20)
    fields.push({ label: 'Prioridad', from: resolved.prioridad || '', to: String(patch.prioridad) })
  }
  if (asString(args.descripcion_accion, 400)) {
    patch.descripcion_accion = asString(args.descripcion_accion, 4000)
    fields.push({ label: 'Descripcion', from: '(actual)', to: String(patch.descripcion_accion).slice(0, 80) })
  }
  const assignee = await resolveAssignee(actor, args)
  if (assignee && 'missing' in assignee) return denied('update_action', assignee.missing)
  if (assignee && 'question' in assignee) return clarification('update_action', assignee)
  if (assignee) {
    patch.responsable = assignee.id
    fields.push({ label: 'Responsable', to: assignee.nombre })
  }
  if (Object.keys(patch).length === 0) {
    return denied(
      'update_action',
      'No hay un campo válido para actualizar. El tablero no tiene porcentaje de avance; usa checklist, fecha, responsable o comentario.'
    )
  }
  if (patch.fecha || patch.hora_limite) {
    const futureError = validateFutureDateTimeCDMX(
      String(patch.fecha ?? resolved.fecha),
      String(patch.hora_limite ?? resolved.hora_limite),
      'La fecha y hora limite'
    )
    if (futureError) return denied('update_action', futureError)
  }
  const proposal = await createPendingOp(actor, {
    tool: 'update_action',
    resourceId: resolved.id,
    expectedUpdatedAt: resolved.updated_at,
    payload: { action_id: resolved.id, patch },
    proposal: {
      title: 'Actualizar accion',
      summary: `Cambio propuesto en "${actionTitle(resolved)}".`,
      fields,
      record: { id: resolved.id, title: actionTitle(resolved), href: actionHref(resolved.id) },
    },
  })
  return { ok: true, tool: 'update_action', kind: 'proposal', proposal }
}

async function proposeComment(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const resolved = await resolveAction(actor, args)
  if ('missing' in resolved) return denied('add_action_comment', resolved.missing)
  if ('question' in resolved) return clarification('add_action_comment', resolved)
  const comment = asString(args.comment, 2000)
  if (comment.length < 3) return denied('add_action_comment', 'El comentario es demasiado corto.')
  const proposal = await createPendingOp(actor, {
    tool: 'add_action_comment',
    resourceId: resolved.id,
    expectedUpdatedAt: resolved.updated_at,
    payload: { action_id: resolved.id, contenido: comment, created_by: actor.usuarioId },
    proposal: {
      title: 'Agregar comentario',
      summary: `Comentario en "${actionTitle(resolved)}".`,
      fields: [{ label: 'Comentario', to: comment.slice(0, 180) }],
      record: { id: resolved.id, title: actionTitle(resolved), href: actionHref(resolved.id) },
    },
  })
  return { ok: true, tool: 'add_action_comment', kind: 'proposal', proposal }
}

async function proposeChecklist(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const resolved = await resolveAction(actor, args)
  if ('missing' in resolved) return denied('update_checklist_item', resolved.missing)
  if ('question' in resolved) return clarification('update_checklist_item', resolved)
  const { data, error } = await actor.supabase
    .from('accion_checkpoints')
    .select('id,texto,completado,orden,activo')
    .eq('accion_id', resolved.id)
    .eq('activo', true)
    .order('orden', { ascending: true })
  if (error) throw error
  const items = data ?? []
  const checkpointId = asString(args.checkpoint_id, 80)
  const index = asNumber(args.item_index)
  const item = checkpointId
    ? items.find((row) => row.id === checkpointId)
    : index
      ? items[index - 1]
      : items.find((row) => row.completado === false)
  if (!item) return denied('update_checklist_item', 'No encontré ese punto del checklist.')
  const completed = args.completed !== false
  const proposal = await createPendingOp(actor, {
    tool: 'update_checklist_item',
    resourceId: resolved.id,
    expectedUpdatedAt: resolved.updated_at,
    payload: { checkpoint_id: item.id, completado: completed, action_id: resolved.id },
    proposal: {
      title: 'Actualizar checklist',
      summary: `${completed ? 'Completar' : 'Reabrir'} un punto de "${actionTitle(resolved)}".`,
      fields: [
        { label: 'Punto', to: String(item.texto ?? '').slice(0, 160) },
        { label: 'Estado', from: item.completado ? 'completo' : 'pendiente', to: completed ? 'completo' : 'pendiente' },
      ],
      record: { id: resolved.id, title: actionTitle(resolved), href: actionHref(resolved.id) },
    },
  })
  return { ok: true, tool: 'update_checklist_item', kind: 'proposal', proposal }
}

async function proposeDone(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const resolved = await resolveAction(actor, args)
  if ('missing' in resolved) return denied('mark_action_done', resolved.missing)
  if ('question' in resolved) return clarification('mark_action_done', resolved)
  const canClose =
    canManageActionsByRole(actor.rol) ||
    resolved.responsable === actor.usuarioId ||
    resolved.created_by === actor.usuarioId
  if (!canClose) return denied('mark_action_done', 'Solo el responsable, quien la creó o Dirección pueden marcar Hecho.')
  const { data: pending } = await actor.supabase
    .from('accion_checkpoints')
    .select('id,texto,obligatorio')
    .eq('accion_id', resolved.id)
    .eq('activo', true)
    .eq('completado', false)
  const missing = pending ?? []
  if (missing.length > 0) {
    return readOk('mark_action_done', {
      canClose: false,
      reason: 'Faltan evidencias de checklist para marcar Hecho.',
      missing: missing.map((row) => row.texto),
      action: summarizeAction(resolved),
    })
  }
  const proposal = await createPendingOp(actor, {
    tool: 'mark_action_done',
    resourceId: resolved.id,
    expectedUpdatedAt: resolved.updated_at,
    payload: { action_id: resolved.id },
    proposal: {
      title: 'Marcar Hecho',
      summary: `"${actionTitle(resolved)}" pasará a Hecho y quedará pendiente de verificación.`,
      fields: [{ label: 'Estado', from: resolved.estado || '', to: 'Hecho' }],
      record: { id: resolved.id, title: actionTitle(resolved), href: actionHref(resolved.id) },
    },
  })
  return { ok: true, tool: 'mark_action_done', kind: 'proposal', proposal }
}

async function proposeVerify(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const resolved = await resolveAction(actor, args)
  if ('missing' in resolved) return denied('verify_action', resolved.missing)
  if ('question' in resolved) return clarification('verify_action', resolved)
  const canVerify = canManageActionsByRole(actor.rol) || resolved.created_by === actor.usuarioId
  if (!canVerify) {
    return denied(
      'verify_action',
      'No puedes verificar esta acción. La verificación corresponde a quien la creó o a un rol autorizado, no al responsable que reporta el cierre.'
    )
  }
  if (resolved.estado !== 'Hecho') {
    return denied('verify_action', 'Solo se pueden verificar acciones en estado Hecho.')
  }
  const proposal = await createPendingOp(actor, {
    tool: 'verify_action',
    resourceId: resolved.id,
    expectedUpdatedAt: resolved.updated_at,
    payload: { action_id: resolved.id },
    proposal: {
      title: 'Verificar accion',
      summary: `"${actionTitle(resolved)}" pasará de Hecho a Verificado.`,
      fields: [{ label: 'Estado', from: 'Hecho', to: 'Verificado' }],
      record: { id: resolved.id, title: actionTitle(resolved), href: actionHref(resolved.id) },
    },
  })
  return { ok: true, tool: 'verify_action', kind: 'proposal', proposal }
}

async function loadUsuarioNames(actor: CopilotActor, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id && id.trim())))]
  if (unique.length === 0) return new Map<string, string>()
  const { data } = await actor.supabase.from('usuarios').select('id,nombre').in('id', unique)
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    const id = typeof row.id === 'string' ? row.id : ''
    const nombre = typeof row.nombre === 'string' ? row.nombre.trim() : ''
    if (id && nombre) map.set(id, nombre)
  }
  return map
}

function actionEmailWorkspace(
  email: Record<string, unknown>,
  contact: { name: string; address: string; subject: string }
): CopilotWorkspacePreview {
  const message = asString(email.mensaje, 500)
  const checklist = Array.isArray(email.checklist) ? email.checklist.filter((item) => typeof item === 'string') : []
  const description = asString(email.descripcion_accion, 900)
  return {
    kind: 'email',
    recipientName: contact.name,
    to: contact.address ? [contact.address] : [],
    subject: contact.subject,
    message,
    needsInfo: !contact.address,
    needsInfoReason: contact.address ? undefined : 'El responsable no tiene correo disponible en Scrumban.',
    body: [
      `Acción: ${asString(email.titulo_accion, 250)}`,
      `Responsable: ${contact.name}`,
      `Fecha compromiso: ${asString(email.fecha_compromiso, 40) || 'Sin fecha'}`,
      message ? `Mensaje: ${message}` : '',
      description ? `Descripción:\n${description}` : '',
      checklist.length ? `Checklist:\n${checklist.map((item) => `• ${item}`).join('\n')}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export async function editActionEmailPendingOp(actor: CopilotActor, opId: string, body: string) {
  const { data, error } = await actor.supabase.from('assistant_pending_ops')
    .select('payload,preview,status,expires_at')
    .eq('id', opId)
    .eq('usuario_id', actor.usuarioId)
    .eq('tool', 'notify_action_email')
    .maybeSingle()
  if (error) throw new Error('DATABASE_ERROR: No se pudo leer el borrador de correo.')
  if (!data || data.status !== 'pending' || Date.parse(data.expires_at) <= Date.now()) {
    throw new Error('VALIDATION_FAILED: Solo puedes editar borradores pendientes y vigentes.')
  }
  const previous = data.payload as Record<string, unknown>
  if (!previous?.email_payload || typeof previous.email_payload !== 'object') {
    throw new Error('VALIDATION_FAILED: El borrador de correo está incompleto.')
  }
  const email: Record<string, unknown> = {
    ...previous.email_payload as Record<string, unknown>,
    mensaje: asString(body, 500),
  }
  const previousPreview = data.preview as Omit<CopilotProposal, 'id' | 'tool' | 'expiresAt'>
  const currentWorkspace = previousPreview.workspace
  const { data: address, error: emailError } = await actor.supabase.rpc('assistant_person_email', {
    p_usuario_id: previous.usuario_id,
  })
  if (emailError) throw new Error('DATABASE_ERROR: No se pudo verificar el correo del responsable.')
  const workspace = actionEmailWorkspace(email, {
    name: asString(email.responsable_nombre, 150) || currentWorkspace?.recipientName || currentWorkspace?.to?.[0] || 'Responsable',
    address: asString(address, 254),
    subject: currentWorkspace?.subject || ACCION_SHARE_EMAIL_TITLE,
  })
  const fields = previousPreview.fields.filter((field) => field.label !== 'Mensaje')
  if (workspace.message) fields.push({ label: 'Mensaje', to: workspace.message })
  const preview = { ...previousPreview, fields, workspace }
  const { data: updated, error: updateError } = await createServiceRoleClient().from('assistant_pending_ops')
    .update({ payload: { ...previous, email_payload: email }, preview })
    .eq('id', opId)
    .eq('usuario_id', actor.usuarioId)
    .eq('tool', 'notify_action_email')
    .eq('status', 'pending')
    .eq('payload', JSON.stringify(previous))
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle()
  if (updateError) throw new Error('DATABASE_ERROR: No se pudo guardar el mensaje del correo.')
  if (!updated) throw new Error('La operación cambió después de abrir el borrador. Vuelve a cargar el informe.')
  return { ...preview, id: opId, tool: 'notify_action_email' as const, expiresAt: String(data.expires_at) }
}

async function proposeNotifyActionEmail(
  actor: CopilotActor,
  args: Record<string, unknown>
): Promise<CopilotToolResult> {
  if (!asString(args.action_id, 80) && !asString(args.query, 160)) {
    return clarification('notify_action_email', {
      question: '¿De qué acción del tablero quieres que prepare el correo?',
      options: [],
    })
  }
  const resolved = await resolveAction(actor, args)
  if ('missing' in resolved) return denied('notify_action_email', resolved.missing)
  if ('question' in resolved) return clarification('notify_action_email', resolved)
  if (!resolved.responsable) {
    return denied(
      'notify_action_email',
      'La accion necesita un responsable para enviar el correo.'
    )
  }

  const { data: checkpoints, error: checklistError } = await actor.supabase
    .from('accion_checkpoints')
    .select('texto')
    .eq('accion_id', resolved.id)
    .eq('activo', true)
    .order('orden', { ascending: true })

  if (checklistError) throw new Error('DATABASE_ERROR: No se pudo consultar el checklist de la acción.')
  const { data: address, error: emailError } = await actor.supabase.rpc('assistant_person_email', {
    p_usuario_id: resolved.responsable,
  })
  if (emailError) throw new Error('DATABASE_ERROR: No se pudo verificar el correo del responsable.')

  const names = await loadUsuarioNames(actor, [
    resolved.responsable,
    resolved.created_by,
    actor.usuarioId,
  ])
  const requestedEmail = asString(args.requested_email, 254).toLowerCase()
  if (requestedEmail && requestedEmail !== asString(address, 254).toLowerCase()) {
    return clarification('notify_action_email', {
      question: 'La dirección que indicaste no coincide con el correo registrado del responsable de esta acción. ¿Quieres usar el correo del responsable o indicar otra acción?',
      options: [],
    })
  }
  const mensaje = asString(args.mensaje, 500)
  const prioridadRaw = asString(args.prioridad, 20)
  const prioridad =
    prioridadRaw === 'Alta' || prioridadRaw === 'Urgente' ? prioridadRaw : ('Normal' as const)

  const emailPayload: Record<string, unknown> = {
    ...buildAccionEmailPayload({
      accionId: resolved.id,
      tituloAccion: resolved.titulo_accion ?? '',
      descripcionAccion: resolved.descripcion_accion ?? '',
      responsableId: resolved.responsable,
      responsableNombre: names.get(resolved.responsable) ?? null,
      fecha: resolved.fecha,
      horaLimite: resolved.hora_limite,
      creadorId: resolved.created_by ?? null,
      creadorNombre: resolved.created_by ? names.get(resolved.created_by) ?? null : null,
      checklist: (checkpoints ?? [])
        .map((row) => (typeof row.texto === 'string' ? row.texto : ''))
        .filter(Boolean),
      titulo: ACCION_SHARE_EMAIL_TITLE,
      asignadorId: actor.usuarioId,
      asignadorNombre: names.get(actor.usuarioId) ?? null,
    }),
    ...(mensaje ? { mensaje } : {}),
    fecha_envio_manual: new Date().toISOString(),
  }

  const responsableNombre = names.get(resolved.responsable) || 'Responsable'
  const fechaCompromiso = String(emailPayload.fecha_compromiso ?? '') || 'Sin fecha'
  const proposal = await createPendingOp(actor, {
    tool: 'notify_action_email',
    resourceId: resolved.id,
    expectedUpdatedAt: resolved.updated_at,
    channel: actor.voiceChannel ? 'retell' : 'web',
    payload: {
      usuario_id: resolved.responsable,
      tipo: 'responsable',
      prioridad,
      email_payload: emailPayload,
    },
    proposal: {
      title: 'Correo de accion (tablero)',
      summary: `Se enviara la notificacion del tablero a ${responsableNombre} sobre "${actionTitle(resolved)}".`,
      fields: [
        { label: 'Destinatario', to: responsableNombre },
        { label: 'Asunto', to: ACCION_SHARE_EMAIL_TITLE },
        { label: 'Fecha compromiso', to: fechaCompromiso },
        ...(mensaje ? [{ label: 'Mensaje', to: mensaje }] : []),
      ],
      record: {
        id: resolved.id,
        title: actionTitle(resolved),
        href: actionHref(resolved.id),
      },
      workspace: actionEmailWorkspace(emailPayload, {
        name: responsableNombre,
        address: asString(address, 254),
        subject: ACCION_SHARE_EMAIL_TITLE,
      }),
    },
  })
  return { ok: true, tool: 'notify_action_email', kind: 'proposal', proposal }
}

async function proposeUserEmail(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const hint = asString(args.recipient, 254)
  const requestedEmail = asString(args.requested_email, 254).toLowerCase()
  const subject = sanitizeRecipientFacingText(asString(args.subject, 160), 160)
  const body = sanitizeRecipientFacingText(asString(args.body, 4000), 4000)
  if (!hint || !subject || !body) {
    return clarification('notify_user_email', { question: '¿Para quién y con qué contenido preparo el correo?', options: [] })
  }

  let toUserId: string | null
  let recipientName: string | null
  let address: string | null
  if (hint.includes('@')) {
    const { data: id, error } = await actor.supabase.rpc('usuario_id_by_auth_email', { p_email: hint })
    if (error) throw new Error('DATABASE_ERROR: No se pudo verificar el correo del destinatario.')
    const { data: person, error: personError } = id ? await actor.supabase.from('usuarios').select('id,nombre')
      .eq('id', id).eq('activo', true).maybeSingle() : { data: null, error: null }
    if (personError) throw new Error('DATABASE_ERROR: No se pudo verificar al destinatario.')
    toUserId = person?.id ?? null
    recipientName = person?.nombre ?? null
    address = person ? hint.toLowerCase() : null
  } else {
    const recipient = await resolveCommunicationRecipient(actor.supabase, hint, 'email', { selfId: actor.usuarioId })
    if (recipient.needsInfoReason) {
      return clarification('notify_user_email', { question: recipient.needsInfoReason, options: [] })
    }
    toUserId = recipient.toUserId
    recipientName = recipient.name
    address = recipient.email
  }
  if (!toUserId || !address || (requestedEmail && requestedEmail !== address.toLowerCase())) {
    return clarification('notify_user_email', {
      question: 'Indica el nombre o correo registrado de un usuario activo del tablero.',
      options: [],
    })
  }

  const proposal = await createPendingOp(actor, {
    tool: 'notify_user_email',
    payload: { usuario_id: toUserId, to_email: address, subject, body },
    proposal: {
      title: 'Correo de Scrumban',
      summary: `Correo para ${recipientName || 'el usuario seleccionado'}. Revisa el contenido antes de aprobar.`,
      fields: [{ label: 'Destinatario', to: address }, { label: 'Asunto', to: subject }],
      workspace: { kind: 'email', recipientName: recipientName || undefined, to: [address], subject, body },
    },
  })
  return { ok: true, tool: 'notify_user_email', kind: 'proposal', proposal }
}

export async function dispatchCopilotTool(
  actor: CopilotActor,
  name: string,
  rawArgs: unknown
): Promise<CopilotToolResult> {
  const args = asArgs(rawArgs)
  try {
    const google = await dispatchGoogleTool(actor, name, rawArgs)
    if (google) return google
    const board = await dispatchBoardReadTool(actor, name, args)
    if (board) return board
    switch (name) {
      case 'get_my_actions':
        return await toolGetMyActions(actor, args)
      case 'get_action_details':
        return await toolGetActionDetails(actor, args)
      case 'get_team_actions':
        return await toolGetTeamActions(actor, args)
      case 'get_pending_verifications':
        return await toolGetPendingVerifications(actor)
      case 'search_people':
        return await toolSearchPeople(actor, args)
      case 'create_action':
        return await proposeCreate(actor, args)
      case 'update_action':
        return await proposeUpdate(actor, args)
      case 'add_action_comment':
        return await proposeComment(actor, args)
      case 'update_checklist_item':
        return await proposeChecklist(actor, args)
      case 'mark_action_done':
        return await proposeDone(actor, args)
      case 'verify_action':
        return await proposeVerify(actor, args)
      case 'get_whatsapp_operation_status':
        return { ok: true, tool: name, kind: 'read', data: await readWhatsappStatus(actor, asString(args.pending_op_id, 80)) }
      case 'get_daily_action_summary':
        return { ok: true, tool: name, kind: 'read', data: await readDailySummary(actor, args.include_history === true) }
      case 'update_daily_action_summary':
        return { ok: true, tool: name, kind: 'proposal', proposal: await proposeDailySummaryUpdate(actor, args) }
      case 'whatsapp_prepare_send': {
        const recipient = asString(args.recipient, 160)
        if (!recipient) return denied(name, 'Indica a quién quieres enviar el WhatsApp.')
        const proposal = await prepareWhatsappDraft(actor, {
          recipient,
          body: asString(args.body, 1400),
          includeOverdue: args.include_overdue === true,
        })
        return { ok: true, tool: name, kind: 'proposal', proposal }
      }
      case 'notify_user_email':
        return await proposeUserEmail(actor, args)
      case 'notify_action_email':
        return await proposeNotifyActionEmail(actor, args)
      case 'confirm_pending_op':
        return await toolConfirmPendingOp(actor, args)
      case 'cancel_pending_op':
        return await toolCancelPendingOp(actor, args)
      default:
        return { ok: false, tool: name as CopilotToolName, kind: 'error', error: 'Herramienta no reconocida.' }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al ejecutar la herramienta.'
    return { ok: false, tool: name as CopilotToolName, kind: 'error', error: message.slice(0, 220) }
  }
}

export function serializeToolResultForModel(result: CopilotToolResult) {
  if (result.kind === 'proposal' && result.proposal) {
    return {
      status: 'needs_confirmation',
      pending_op_id: result.proposal.id,
      preview: result.proposal,
      instruction:
        'Resume la propuesta y pide confirmacion. En voz usa confirm_pending_op con pending_op_id. No digas que ya se ejecuto.',
    }
  }
  if (result.kind === 'clarification') return { status: 'needs_clarification', ...result.clarification }
  if (result.kind === 'denied' || result.kind === 'error') return { status: 'error', error: result.error }
  return result.data
}

async function toolConfirmPendingOp(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const opId = asString(args.pending_op_id || args.pendingOpId || args.op_id || args.id)
  if (!opId) {
    return {
      ok: false,
      tool: 'confirm_pending_op',
      kind: 'error',
      error: 'Falta pending_op_id para confirmar.',
    }
  }
  try {
    const confirmed = await confirmPendingOp(actor, opId, { fromTool: true })
    const result = (confirmed.result ?? {}) as { id?: string; href?: string; title?: string }
    return {
      ok: true,
      tool: 'confirm_pending_op',
      kind: 'read',
      data: {
        status: 'confirmed',
        pending_op_id: opId,
        id: result.id ?? null,
        href: result.href ?? null,
        title: result.title ?? (confirmed.preview as { title?: string } | undefined)?.title ?? null,
        spoken_hint: 'Listo, quedo registrada.',
      },
    }
  } catch (error) {
    return {
      ok: false,
      tool: 'confirm_pending_op',
      kind: 'error',
      error: error instanceof Error ? error.message : 'No se pudo confirmar.',
    }
  }
}

async function toolCancelPendingOp(actor: CopilotActor, args: Record<string, unknown>): Promise<CopilotToolResult> {
  const opId = asString(args.pending_op_id || args.pendingOpId || args.op_id || args.id)
  if (!opId) {
    return {
      ok: false,
      tool: 'cancel_pending_op',
      kind: 'error',
      error: 'Falta pending_op_id para cancelar.',
    }
  }
  try {
    await cancelPendingOp(actor, opId)
    return {
      ok: true,
      tool: 'cancel_pending_op',
      kind: 'read',
      data: {
        status: 'cancelled',
        pending_op_id: opId,
        spoken_hint: 'Cancelado. No se ejecuto nada.',
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cancelar.'
    if (/ya se ejecuto/i.test(message)) {
      return { ok: false, tool: 'cancel_pending_op', kind: 'error', error: message }
    }
    return { ok: false, tool: 'cancel_pending_op', kind: 'error', error: message }
  }
}

type PendingRow = {
  id: string
  usuario_id: string
  tool: string
  resource_id: string | null
  expected_updated_at: string | null
  payload: Record<string, unknown>
  preview: Record<string, unknown>
  status: string
  expires_at: string
  result: unknown
  channel?: string | null
  session_id?: string | null
}

async function executePayload(actor: CopilotActor, tool: string, payload: Record<string, unknown>) {
  if (tool === 'create_action') {
    const actionId = crypto.randomUUID()
    const checkpoints = sanitizeCheckpoints(payload.checkpoints)
    const fields = { ...payload }
    delete fields.checkpoints
    const insertPayload = { ...fields, id: actionId }
    const { error } = await actor.supabase.from('acciones_diarias').insert(insertPayload)
    if (error) throw error
    if (checkpoints.length > 0) {
      const { error: checkpointError } = await actor.supabase.from('accion_checkpoints').insert(
        checkpoints.map((texto, index) => ({
          accion_id: actionId,
          texto,
          orden: index + 1,
          obligatorio: true,
          activo: true,
          completado: false,
          created_by: actor.usuarioId,
        }))
      )
      if (checkpointError) throw checkpointError
    }
    return {
      id: actionId,
      href: actionHref(actionId),
      title: String(payload.titulo_accion ?? 'Accion'),
      fecha: payload.fecha ?? null,
      estado: 'Pendiente',
      checkpoints: checkpoints.length,
      created: true,
    }
  }
  if (tool === 'update_action') {
    const id = String(payload.action_id)
    const patch = (payload.patch ?? {}) as Record<string, unknown>
    const { error, count } = await actor.supabase
      .from('acciones_diarias')
      .update(patch, { count: 'exact' })
      .eq('id', id)
    if (error) throw error
    if (count === 0) throw new Error('No se pudo actualizar. Revisa permisos sobre esa accion.')
    return { id, href: actionHref(id) }
  }
  if (tool === 'add_action_comment') {
    const { error } = await actor.supabase.from('accion_comentarios').insert({
      accion_id: payload.action_id,
      contenido: payload.contenido,
      created_by: actor.usuarioId,
    })
    if (error) throw error
    return { id: payload.action_id, href: actionHref(String(payload.action_id)) }
  }
  if (tool === 'update_checklist_item') {
    const { error } = await actor.supabase.rpc('set_accion_checkpoint_completado', {
      p_checkpoint_id: payload.checkpoint_id,
      p_completado: payload.completado === true,
    })
    if (error) throw error
    return { id: payload.action_id, href: actionHref(String(payload.action_id)) }
  }
  if (tool === 'mark_action_done') {
    const { error } = await actor.supabase.rpc('try_set_accion_hecho', {
      p_accion_id: payload.action_id,
    })
    if (error) throw error
    return { id: payload.action_id, href: actionHref(String(payload.action_id)), estado: 'Hecho' }
  }
  if (tool === 'verify_action') {
    const { error, count } = await actor.supabase
      .from('acciones_diarias')
      .update({ estado: 'Verificado' }, { count: 'exact' })
      .eq('id', String(payload.action_id))
    if (error) throw error
    if (count === 0) throw new Error('No se pudo verificar. Revisa permisos.')
    return { id: payload.action_id, href: actionHref(String(payload.action_id)), estado: 'Verificado' }
  }
  if (tool === 'update_daily_action_summary') return executeDailySummaryUpdate(actor, payload)
  if (tool === 'notify_user_email') {
    const id = asString(payload.usuario_id, 80)
    const address = asString(payload.to_email, 254).toLowerCase()
    const subject = sanitizeRecipientFacingText(asString(payload.subject, 160), 160)
    const body = sanitizeRecipientFacingText(asString(payload.body, 4000), 4000)
    const { data: person, error } = await actor.supabase.from('usuarios').select('id')
      .eq('id', id).eq('activo', true).maybeSingle()
    if (error) throw new Error('DATABASE_ERROR: No se pudo verificar el destinatario.')
    if (!person || !address || !subject || !body) throw new Error('VALIDATION_FAILED: Revisa el destinatario y el contenido.')
    const { data: currentEmail, error: emailError } = await actor.supabase.rpc('assistant_person_email', { p_usuario_id: id })
    if (emailError) throw new Error('DATABASE_ERROR: No se pudo verificar el correo del destinatario.')
    if (asString(currentEmail, 254).toLowerCase() !== address) {
      throw new Error('VALIDATION_FAILED: El correo del destinatario cambió. Prepara un borrador nuevo.')
    }
    const result = await invokeNotificationEmail(actor.accessToken || '', {
      usuario_id: id,
      tipo: 'assistant_summary',
      payload: { titulo: subject, mensaje: body },
      reply_to_caller: true,
    })
    if (!result.email_id) throw new Error(result.message || 'PROVIDER_ERROR: El proveedor no confirmó el correo.')
    return { id: result.email_id, email_id: result.email_id, delivery_status: 'accepted' }
  }
  if (tool === 'notify_action_email') {
    const usuarioId = asString(payload.usuario_id, 80)
    const emailPayload =
      payload.email_payload && typeof payload.email_payload === 'object'
        ? (payload.email_payload as Record<string, unknown>)
        : null
    const actionId = asString(emailPayload?.accion_id, 80)
    if (!usuarioId || !emailPayload || !actionId) {
      throw new Error('Falta el destinatario o el contenido del correo de accion.')
    }
    const action = await loadAction(actor, actionId)
    if (!action || action.responsable !== usuarioId || !analystCanSeeAction(actor.rol, actor.usuarioId, action)) {
      throw new Error('PERMISSION_DENIED: Revisa el acceso a la acción y su responsable actual.')
    }
    const prioridadRaw = asString(payload.prioridad, 20)
    const prioridad =
      prioridadRaw === 'Alta' || prioridadRaw === 'Urgente' ? prioridadRaw : ('Normal' as const)
    const result = await invokeNotificationEmail(actor.accessToken || '', {
      usuario_id: usuarioId,
      tipo: asString(payload.tipo, 40) || 'responsable',
      prioridad,
      payload: emailPayload,
      reply_to_caller: true,
    })
    if (result.skipped === true) {
      const detail = [result.reason, result.message ?? result.error].filter(Boolean).join(': ')
      throw new Error(detail || 'El correo de notificacion fue omitido.')
    }
    if (result.ok === false) {
      throw new Error(
        [result.reason, result.message ?? result.error].filter(Boolean).join(': ') ||
          'No se pudo enviar el correo de notificacion.'
      )
    }
    if (!result.email_id) throw new Error('PROVIDER_ERROR: El correo no tiene un identificador de aceptación.')
    return {
      id: actionId || usuarioId,
      href: actionId ? actionHref(actionId) : undefined,
      title: asString(emailPayload.titulo_accion, 120) || ACCION_SHARE_EMAIL_TITLE,
      provider: result.provider ?? 'gmail',
      email_id: result.email_id,
      delivery_status: 'accepted',
      notified_usuario_id: usuarioId,
    }
  }
  if (isGoogleWriteTool(tool)) {
    return executeGoogleWrite(actor, tool, payload)
  }
  if (isCommunicationWriteTool(tool)) {
    throw new Error('whatsapp_prepare_send requiere pending_op_id en confirm.')
  }
  throw new Error('Herramienta de escritura no soportada.')
}

export async function confirmPendingOp(actor: CopilotActor, opId: string, options?: { fromTool?: boolean }) {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,usuario_id,tool,resource_id,expected_updated_at,payload,preview,status,expires_at,result,channel,session_id')
    .eq('id', opId)
    .maybeSingle()
  if (error || !data) throw new Error('No encontré esa operación pendiente.')
  const row = data as PendingRow
  if (row.usuario_id !== actor.usuarioId) throw new Error('Esa operación no te pertenece.')

  const sendsCommunication =
    isCommunicationWriteTool(row.tool) || row.tool.startsWith('gmail_') || (row.tool === 'notify_action_email' || row.tool === 'notify_user_email')
  if ((sendsCommunication || row.tool === 'update_daily_action_summary') && (options?.fromTool || !actor.accessToken)) {
    throw new Error('PERMISSION_DENIED: Aprueba el envío desde una sesión web autenticada.')
  }

  const transition = evaluatePendingTransition({ status: row.status, expiresAt: row.expires_at })
  if (!transition.ok && transition.reason === 'already_done') {
    return { status: 'confirmed' as const, result: row.result, preview: row.preview }
  }
  if (!transition.ok && transition.reason === 'expired') {
    await actor.supabase
      .from('assistant_pending_ops')
      .update({ status: 'expired', decided_at: new Date().toISOString() })
      .eq('id', opId)
      .eq('status', 'pending')
    await insertLog(actor, { tool: row.tool, result: 'expired', pendingOpId: opId, resourceId: row.resource_id })
    throw new Error('La autorización expiró. Solicita una nueva propuesta.')
  }
  if (!transition.ok) {
    throw new Error(
      transition.reason === 'cancelled'
        ? 'Esta operación fue cancelada.'
        : 'Esta operación ya no se puede confirmar.'
    )
  }

  if ((row.channel === 'retell' || (row.session_id && row.payload?.draft_kind === 'email')) && row.tool.startsWith('gmail_')) {
    throw new Error('VALIDATION_FAILED: Este borrador se creó con Gmail personal. Descártalo y pide en Enviardián el correo de la acción desde el Kanban.')
  }

  if (isGoogleWriteTool(row.tool) || isCommunicationWriteTool(row.tool)) {
    assertWorkspaceHash(row.payload ?? {})
    const payload = row.payload ?? {}
    if (isCommunicationWriteTool(row.tool) || String(row.tool).startsWith('gmail_')) {
      const mode = normalizeGuideAccessMode(actor.guideAccessMode ?? 'propose')
      if (actor.guideAccessMode != null && !canSendCommunication(mode)) {
        throw new Error(
          'PERMISSION_DENIED: Este modo de entrevista no permite enviar comunicaciones. Aprueba el envio con una sesion autorizada.'
        )
      }
    }
    if (payload.incomplete === true) {
      throw new Error(
        'Este borrador aun no esta listo. Espera el cierre de la llamada o completa los datos.'
      )
    }
    if (payload.needs_info === true) {
      throw new Error(
        typeof payload.needs_info_reason === 'string' && payload.needs_info_reason
          ? payload.needs_info_reason
          : 'Falta informacion del destinatario. Completala antes de enviar.'
      )
    }
    if (isGoogleWriteTool(row.tool) && String(row.tool).startsWith('gmail_')) {
      const to = Array.isArray(payload.to) ? payload.to.filter((item) => typeof item === 'string' && item.includes('@')) : []
      if (to.length === 0) {
        throw new Error('Falta un destinatario de correo valido.')
      }
    }
  }

  const { data: claimed, error: claimError } = await actor.supabase
    .from('assistant_pending_ops')
    .update({ status: 'executing' })
    .eq('id', opId)
    .eq('status', 'pending')
    .eq('payload', JSON.stringify(row.payload ?? {}))
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle()

  if (claimError) throw new Error('DATABASE_ERROR: No se pudo reservar la operación.')
  if (!claimed) {
    const { data: again } = await actor.supabase
      .from('assistant_pending_ops')
      .select('status,result')
      .eq('id', opId)
      .maybeSingle()
    if (again?.status === 'confirmed') {
      return { status: 'confirmed' as const, result: again.result, preview: row.preview }
    }
    throw new Error('La operación cambió después de la vista previa o ya está en ejecución. Revisa su estado.')
  }

  let result: Record<string, unknown>
  try {
    if (row.resource_id && row.expected_updated_at && isCopilotWriteTool(row.tool) && row.tool !== 'create_action') {
      const current = await loadAction(actor, row.resource_id)
      if (!current?.updated_at || current.updated_at !== row.expected_updated_at) {
        await actor.supabase
          .from('assistant_pending_ops')
          .update({ status: 'conflict', decided_at: new Date().toISOString(), error_message: 'stale' })
          .eq('id', opId)
          .eq('status', 'executing')
        await insertLog(actor, { tool: row.tool, result: 'conflict', pendingOpId: opId, resourceId: row.resource_id })
        throw new Error('El registro cambió después de la vista previa. Pide una nueva confirmación.')
      }
    }
    result = isCommunicationWriteTool(row.tool)
      ? await executeWhatsappWrite(actor, row.payload ?? {}, opId)
      : await executePayload(actor, row.tool, row.payload ?? {})
  } catch (err) {
    const needsPersonalConnection = row.tool.startsWith('gmail_') && err instanceof GoogleUserError &&
      ['not_connected', 'needs_reauth', 'missing_scope'].includes(err.code)
    const message = needsPersonalConnection
      ? 'VALIDATION_FAILED: Este borrador usa Gmail personal. Para enviar desde Scrumban, descártalo y pide el correo de la acción del Kanban al responsable.'
      : err instanceof Error ? err.message : 'No se pudo ejecutar.'
    await actor.supabase
      .from('assistant_pending_ops')
      .update({ status: 'pending', error_message: message.slice(0, 220) })
      .eq('id', opId)
      .eq('status', 'executing')
    await insertLog(actor, { tool: row.tool, result: 'error', pendingOpId: opId, resourceId: row.resource_id })
    throw new Error(message)
  }

  const { data: completed, error: completionError } = await actor.supabase
    .from('assistant_pending_ops')
    .update({ status: 'confirmed', result, decided_at: new Date().toISOString(), error_message: null })
    .eq('id', opId)
    .eq('status', 'executing')
    .select('id')
    .maybeSingle()
  if (completionError || !completed) {
    throw new Error('DATABASE_ERROR: No se pudo guardar el resultado de la operación. Consulta su estado.')
  }
  await insertLog(actor, {
    tool: row.tool,
    result: 'executed',
    pendingOpId: opId,
    resourceId: (result.id as string) ?? row.resource_id,
    summary: String(row.preview?.title ?? row.tool),
  })
  return { status: 'confirmed' as const, result, preview: row.preview }
}

export async function cancelPendingOp(
  actor: CopilotActor,
  opId: string,
  opts?: { reason?: string | null }
) {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,usuario_id,tool,resource_id,status')
    .eq('id', opId)
    .maybeSingle()
  if (error || !data) throw new Error('No encontré esa operación pendiente.')
  if (data.usuario_id !== actor.usuarioId) throw new Error('Esa operación no te pertenece.')
  if (data.status === 'confirmed') throw new Error('La operación ya se ejecutó.')
  if (data.status === 'executing') throw new Error('La operación está en ejecución.')
  if (data.status === 'cancelled') return { status: 'cancelled' as const }
  if (data.status === 'expired' || data.status === 'conflict') {
    throw new Error('Esta operación ya no se puede descartar.')
  }
  const reason =
    typeof opts?.reason === 'string' && opts.reason.trim()
      ? `discarded: ${opts.reason.trim().slice(0, 180)}`
      : `discarded_by:${actor.usuarioId}`
  const { data: cancelled, error: updateError } = await actor.supabase
    .from('assistant_pending_ops')
    .update({
      status: 'cancelled',
      decided_at: new Date().toISOString(),
      error_message: reason.slice(0, 220),
    })
    .eq('id', opId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (updateError) throw updateError
  if (!cancelled) throw new Error('La operación cambió de estado. Consulta su resultado.')
  await insertLog(actor, {
    tool: String(data.tool),
    result: 'cancelled',
    pendingOpId: opId,
    resourceId: data.resource_id as string | null,
    summary: reason.slice(0, 120),
  })
  return { status: 'cancelled' as const }
}
