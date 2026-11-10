import type { SupabaseClient } from '@supabase/supabase-js'
import { canManageActionsByRole, isAnalystByRole } from '../../src/features/auth/lib/permissions.js'
import { isCopilotWriteTool } from '../../src/features/ai-support/copilot/catalog.js'
import {
  evaluatePendingTransition,
  matchActionsByQuery,
  matchPeopleByName,
  wrapUntrustedToolData,
  type NamedPerson,
} from '../../src/features/ai-support/copilot/matching.js'
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
  CopilotWriteTool,
} from '../../src/features/ai-support/copilot/types.js'
import { dispatchBoardReadTool } from './assistantBoardReads.js'

export type CopilotActor = {
  supabase: SupabaseClient
  usuarioId: string
  authUserId: string
  rol: string | null
}

const OPEN_STATES = ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso']
const ACTION_COLS =
  'id,fecha,titulo_accion,descripcion_accion,responsable,created_by,hora_limite,evidencia_esperada,evidencia_cargada,estado,prioridad,area,updated_at,verificador_dato,verificador_gobierno'
const PENDING_TTL_MS = 10 * 60 * 1000
const STALE_DAYS = 3

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
  const { data, error } = await actor.supabase
    .from('usuarios')
    .select('id,nombre,rol,area')
    .eq('activo', true)
    .limit(80)
  if (error) throw error
  return matchPeopleByName((data ?? []) as NamedPerson[], name)
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
  const id = asString(args.action_id, 80)
  if (id) {
    const row = await loadAction(actor, id)
    if (!row) return { missing: 'No encontré esa acción o no tienes permiso para verla.' }
    return row
  }
  const query = asString(args.query, 160)
  if (!query) return { missing: 'Indica la acción (título o selección en el panel).' }
  const open = await loadOpenActions(actor, true)
  const matches = matchActionsByQuery(open, query) as ActionRow[]
  if (matches.length === 0) {
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

async function insertLog(
  actor: CopilotActor,
  input: {
    tool: string
    result: string
    pendingOpId?: string | null
    resourceId?: string | null
    summary?: string
  }
) {
  await actor.supabase.from('assistant_op_log').insert({
    usuario_id: actor.usuarioId,
    pending_op_id: input.pendingOpId ?? null,
    tool: input.tool,
    resource_id: input.resourceId ?? null,
    result: input.result,
    preview_summary: input.summary?.slice(0, 280) ?? null,
  })
}

async function createPendingOp(
  actor: CopilotActor,
  input: {
    tool: CopilotWriteTool
    resourceId?: string | null
    expectedUpdatedAt?: string | null
    payload: Record<string, unknown>
    proposal: Omit<CopilotProposal, 'id' | 'expiresAt' | 'tool'> & { tool?: CopilotWriteTool }
  }
): Promise<CopilotProposal> {
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString()
  const preview = {
    title: input.proposal.title,
    summary: input.proposal.summary,
    fields: input.proposal.fields,
    record: input.proposal.record ?? null,
  }
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .insert({
      usuario_id: actor.usuarioId,
      tool: input.tool,
      resource_id: input.resourceId ?? null,
      expected_updated_at: input.expectedUpdatedAt ?? null,
      payload: input.payload,
      preview,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id,expires_at')
    .single()
  if (error || !data) {
    throw new Error(
      error?.message?.includes('assistant_pending_ops')
        ? 'Falta aplicar la migracion de operaciones del asistente.'
        : error?.message || 'No se pudo guardar la propuesta.'
    )
  }
  await insertLog(actor, {
    tool: input.tool,
    result: 'proposed',
    pendingOpId: data.id as string,
    resourceId: input.resourceId,
    summary: input.proposal.title,
  })
  return {
    id: data.id as string,
    tool: input.tool,
    title: input.proposal.title,
    summary: input.proposal.summary,
    fields: input.proposal.fields,
    record: input.proposal.record,
    expiresAt: (data.expires_at as string) || expiresAt,
  }
}

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
  const filter = asString(args.filter, 32) || 'open'
  const today = todayWallClockCDMX()
  const weekEnd = addDays(today, 7)
  const now = Date.now()
  if (filter === 'verification') {
    const { data, error } = await actor.supabase
      .from('acciones_diarias')
      .select(ACTION_COLS)
      .eq('estado', 'Hecho')
      .or(
        `responsable.eq.${actor.usuarioId},verificador_dato.eq.${actor.usuarioId},verificador_gobierno.eq.${actor.usuarioId},created_by.eq.${actor.usuarioId}`
      )
      .limit(20)
    if (error) throw error
    return readOk('get_my_actions', {
      filter,
      items: ((data ?? []) as ActionRow[]).map(summarizeAction),
    })
  }
  const rows = await loadOpenActions(actor, false)
  const filtered = rows.filter((row) => {
    const action = row.id && row.estado && row.fecha
      ? { id: row.id, estado: row.estado, fecha: row.fecha, hora_limite: row.hora_limite }
      : null
    if (filter === 'overdue') return action != null && isCorporateOverdue(action)
    if (filter === 'due_week') return Boolean(row.fecha && row.fecha >= today && row.fecha <= weekEnd && !(action && isCorporateOverdue(action)))
    if (filter === 'blocked') return action != null && isCorporateBlocked(action)
    if (filter === 'stale') {
      const t = row.updated_at ? Date.parse(row.updated_at) : NaN
      return Number.isFinite(t) && now - t >= STALE_DAYS * 86_400_000
    }
    return true
  })
  const items = clipList(filtered.map(summarizeAction), asNumber(args.limit) ?? 10)
  return readOk('get_my_actions', {
    filter,
    today,
    population: 'acciones_corporativas',
    truncated: readWasTruncated(rows.length, 80) || filtered.length > items.length,
    items,
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
  // Misma amplitud que dashboard/search del tablero: Analista solo ve lo propio.
  if (isAnalystByRole(actor.rol)) {
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
  const { data, error } = await actor.supabase
    .from('acciones_diarias')
    .select(ACTION_COLS)
    .eq('estado', 'Hecho')
    .or(
      `responsable.eq.${actor.usuarioId},verificador_dato.eq.${actor.usuarioId},verificador_gobierno.eq.${actor.usuarioId},created_by.eq.${actor.usuarioId}`
    )
    .limit(20)
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
  return readOk('search_people', {
    items: matches.map((person) => ({
      id: person.id,
      nombre: person.nombre,
      area: person.area,
      rol: person.rol,
    })),
  })
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

export async function dispatchCopilotTool(
  actor: CopilotActor,
  name: string,
  rawArgs: unknown
): Promise<CopilotToolResult> {
  const args = asArgs(rawArgs)
  try {
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
      instruction: 'Muestra la propuesta y pide pulsar Confirmar. No digas que ya se ejecuto.',
    }
  }
  if (result.kind === 'clarification') return { status: 'needs_clarification', ...result.clarification }
  if (result.kind === 'denied' || result.kind === 'error') return { status: 'error', error: result.error }
  return result.data
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
  throw new Error('Herramienta de escritura no soportada.')
}

export async function confirmPendingOp(actor: CopilotActor, opId: string) {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,usuario_id,tool,resource_id,expected_updated_at,payload,preview,status,expires_at,result')
    .eq('id', opId)
    .maybeSingle()
  if (error || !data) throw new Error('No encontré esa operación pendiente.')
  const row = data as PendingRow
  if (row.usuario_id !== actor.usuarioId) throw new Error('Esa operación no te pertenece.')

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

  const { data: claimed } = await actor.supabase
    .from('assistant_pending_ops')
    .update({ status: 'executing' })
    .eq('id', opId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (!claimed) {
    const { data: again } = await actor.supabase
      .from('assistant_pending_ops')
      .select('status,result')
      .eq('id', opId)
      .maybeSingle()
    if (again?.status === 'confirmed') {
      return { status: 'confirmed' as const, result: again.result, preview: row.preview }
    }
    throw new Error('Otro intento está procesando esta operación.')
  }

  if (row.resource_id && row.expected_updated_at && isCopilotWriteTool(row.tool) && row.tool !== 'create_action') {
    const current = await loadAction(actor, row.resource_id)
    if (current?.updated_at && current.updated_at !== row.expected_updated_at) {
      await actor.supabase
        .from('assistant_pending_ops')
        .update({ status: 'conflict', decided_at: new Date().toISOString(), error_message: 'stale' })
        .eq('id', opId)
      await insertLog(actor, { tool: row.tool, result: 'conflict', pendingOpId: opId, resourceId: row.resource_id })
      throw new Error('El registro cambió después de la vista previa. Pide una nueva confirmación.')
    }
  }

  try {
    const result = await executePayload(actor, row.tool, row.payload ?? {})
    await actor.supabase
      .from('assistant_pending_ops')
      .update({
        status: 'confirmed',
        result,
        decided_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', opId)
    await insertLog(actor, {
      tool: row.tool,
      result: 'executed',
      pendingOpId: opId,
      resourceId: (result.id as string) ?? row.resource_id,
      summary: String(row.preview?.title ?? row.tool),
    })
    return { status: 'confirmed' as const, result, preview: row.preview }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo ejecutar.'
    await actor.supabase
      .from('assistant_pending_ops')
      .update({ status: 'pending', error_message: message.slice(0, 220) })
      .eq('id', opId)
    await insertLog(actor, { tool: row.tool, result: 'error', pendingOpId: opId, resourceId: row.resource_id })
    throw new Error(message)
  }
}

export async function cancelPendingOp(actor: CopilotActor, opId: string) {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,usuario_id,tool,resource_id,status')
    .eq('id', opId)
    .maybeSingle()
  if (error || !data) throw new Error('No encontré esa operación pendiente.')
  if (data.usuario_id !== actor.usuarioId) throw new Error('Esa operación no te pertenece.')
  if (data.status === 'confirmed') throw new Error('La operación ya se ejecutó.')
  if (data.status === 'cancelled') return { status: 'cancelled' as const }
  const { error: updateError } = await actor.supabase
    .from('assistant_pending_ops')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', opId)
    .in('status', ['pending', 'executing'])
  if (updateError) throw updateError
  await insertLog(actor, {
    tool: String(data.tool),
    result: 'cancelled',
    pendingOpId: opId,
    resourceId: data.resource_id as string | null,
  })
  return { status: 'cancelled' as const }
}
