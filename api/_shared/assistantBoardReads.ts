import type { SupabaseClient } from '@supabase/supabase-js'
import { ROUTES } from '../../src/constants/index.js'
import {
  canAccessOkrs,
  canAccessRouteByRole,
  canManageSupportTicketsByRole,
  canViewAllBoardData,
  isAnalystByRole,
  isAppSuperAdminByAppRole,
  isExcludedFromOrgChartByRole,
  isSuperAdminByRole,
} from '../../src/features/auth/lib/permissions.js'
import { wrapUntrustedToolData } from '../../src/features/ai-support/copilot/matching.js'
import { PLAN_ACCION_TRACKS } from '../../src/features/plan-accion/data/planAccionContent.js'
import { hasPlanAccionAccess } from '../../src/features/plan-accion/lib/planAccionAccess.js'
import type { CopilotToolName, CopilotToolResult } from '../../src/features/ai-support/copilot/types.js'
import { todayWallClockCDMX } from '../../src/lib/dateUtils.js'
import {
  CORPORATE_OPEN_READ_LIMIT,
  CORPORATE_TIMEZONE,
  countByArea,
  isCorporateBlocked,
  isCorporateOverdue,
  readWasTruncated,
  summarizeCorporateActions,
  type CorporateActionLike,
} from '../../src/features/metrics/corporateActionMetrics.js'
import {
  krProgress,
  objectivePaceStatus,
  objectiveProgress,
  type KrProgressInput,
  type Objective,
} from '../../src/features/okrs/model.js'
import { isTeamDeadlinePast, summarizeTeamActions } from '../../src/features/metrics/teamActionMetrics.js'

type BoardActor = {
  supabase: SupabaseClient
  usuarioId: string
  authUserId: string
  rol: string | null
}

export const BOARD_READ_TOOLS = [
  'get_dashboard_summary',
  'get_org_chart',
  'get_module_data',
  'search_board',
  'get_okr_progress',
] as const

type BoardReadTool = (typeof BOARD_READ_TOOLS)[number]

type ActorAccess = {
  appRole: string | null
  area: string | null
  areas: string[]
  areaIds: string[]
  moduleKeys: string[] | null
}

const MODULE_PATH: Record<string, string> = {
  dashboard: ROUTES.DASHBOARD,
  kpis: ROUTES.DASHBOARD_KPIS,
  gaps: ROUTES.DASHBOARD_GAPS,
  impacto: ROUTES.DASHBOARD_IMPACTO,
  org_chart: ROUTES.ORG_CHART,
  tickets: ROUTES.TICKETS,
  team_kanban: ROUTES.TEAM_KANBAN,
  calendar: ROUTES.CALENDARIO,
  challenges: ROUTES.CHALLENGES,
  notifications: ROUTES.NOTIFICACIONES,
  sprints: ROUTES.SPRINTS,
  strategy: ROUTES.ESTRATEGIA,
  disciplina: ROUTES.DISCIPLINA,
  academy: ROUTES.ACADEMIA,
  areas: ROUTES.AREAS,
  plan_accion: ROUTES.PLAN_ACCION,
  reports: ROUTES.REPORTES,
  distancias: ROUTES.DISTANCIAS,
  okrs: ROUTES.OKRS,
}

const MODULE_KEY_BY_PATH: Record<string, string> = {
  [ROUTES.DASHBOARD]: 'dashboard',
  [ROUTES.DASHBOARD_KPIS]: 'kpis',
  [ROUTES.DASHBOARD_GAPS]: 'gaps',
  [ROUTES.DASHBOARD_IMPACTO]: 'impact',
  [ROUTES.ORG_CHART]: 'org_chart',
  [ROUTES.TICKETS]: 'tickets',
  [ROUTES.TEAM_KANBAN]: 'team_kanban',
  [ROUTES.DASHBOARD_TEAMS]: 'team_dashboard',
  [ROUTES.CHALLENGES]: 'challenges',
  [ROUTES.CALENDARIO]: 'calendar',
  [ROUTES.NOTIFICACIONES]: 'notifications',
  [ROUTES.SPRINTS]: 'sprints',
  [ROUTES.ESTRATEGIA]: 'strategy',
  [ROUTES.DISCIPLINA]: 'discipline',
  [ROUTES.ACADEMIA]: 'academy',
  [ROUTES.REPORTES]: 'reports',
  [ROUTES.OKRS]: 'okrs',
}

const OPEN_STATES = ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso']
const accessCache = new WeakMap<BoardActor, Promise<ActorAccess>>()

function asString(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
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

function fold(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

function matchesQuery(hay: string | null | undefined, needle: string) {
  if (!needle) return true
  return fold(hay ?? '').includes(fold(needle))
}

function escapeIlike(term: string) {
  return term.replace(/\\/g, '\\\\').replace(/[%_]/g, (match) => `\\${match}`).replace(/[,()]/g, ' ')
}

function denied(tool: CopilotToolName, error: string): CopilotToolResult {
  return { ok: false, tool, kind: 'denied', error }
}

function readOk(tool: CopilotToolName, data: unknown): CopilotToolResult {
  return { ok: true, tool, kind: 'read', data: wrapUntrustedToolData(data) }
}

function clip<T>(rows: T[], limit = 12) {
  return rows.slice(0, Math.min(20, Math.max(1, limit)))
}

function addDays(today: string, days: number) {
  const base = Date.parse(`${today}T12:00:00`)
  const next = new Date(base + days * 86_400_000)
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function loadActorAccess(actor: BoardActor): Promise<ActorAccess> {
  const cached = accessCache.get(actor)
  if (cached) return cached
  const pending = (async (): Promise<ActorAccess> => {
    const [{ data: roles }, { data: usuario }, areasRes, modulesRes] = await Promise.all([
      actor.supabase.from('user_roles').select('app_role').eq('user_id', actor.authUserId),
      actor.supabase.from('usuarios').select('area').eq('id', actor.usuarioId).maybeSingle(),
      actor.supabase.from('usuario_areas').select('area_id, areas(nombre)').eq('user_id', actor.usuarioId),
      actor.supabase
        .from('usuario_catalog_roles')
        .select('catalog_roles(activo, catalog_role_modules(module_key))')
        .eq('user_id', actor.usuarioId),
    ])
    const appRole = roles?.[0] ? String((roles[0] as { app_role?: string }).app_role ?? '') || null : null
    const area = typeof usuario?.area === 'string' ? usuario.area : null
    const areaRows = (areasRes.data ?? []) as Array<{
      area_id?: string
      areas?: { nombre?: string } | { nombre?: string }[] | null
    }>
    const areaIds = areaRows.map((row) => row.area_id).filter((id): id is string => Boolean(id))
    const extraNames = areaRows.flatMap((row) => {
      const rel = row.areas
      if (!rel) return []
      const list = Array.isArray(rel) ? rel : [rel]
      return list.map((item) => item.nombre).filter((name): name is string => Boolean(name))
    })
    const areas = [...new Set([...(area ? [area] : []), ...extraNames])]
    let moduleKeys: string[] | null = null
    if (!modulesRes.error) {
      const keys = new Set<string>()
      for (const row of (modulesRes.data ?? []) as Array<{
        catalog_roles?: {
          activo?: boolean
          catalog_role_modules?: Array<{ module_key?: string }>
        } | Array<{
          activo?: boolean
          catalog_role_modules?: Array<{ module_key?: string }>
        }> | null
      }>) {
        const rel = row.catalog_roles
        const rolesList = !rel ? [] : Array.isArray(rel) ? rel : [rel]
        for (const catalogRole of rolesList) {
          if (catalogRole.activo === false) continue
          for (const item of catalogRole.catalog_role_modules ?? []) {
            if (item.module_key) keys.add(item.module_key)
          }
        }
      }
      moduleKeys = [...keys]
    }
    return { appRole, area, areas, areaIds, moduleKeys }
  })()
  accessCache.set(actor, pending)
  return pending
}

function canSeePath(actor: BoardActor, access: ActorAccess, pathname: string): boolean {
  if (pathname === ROUTES.OKRS || pathname.startsWith(`${ROUTES.OKRS}/`)) {
    if (!canAccessOkrs(actor.rol, access.appRole, access.area, access.areas)) return false
  }
  if (pathname === ROUTES.PLAN_ACCION) {
    return hasPlanAccionAccess({ id: actor.usuarioId }) && canAccessRouteByRole(actor.rol, pathname, access.appRole)
  }
  if (
    pathname === ROUTES.TEAM_KANBAN ||
    pathname.startsWith(`${ROUTES.TEAM_KANBAN}/`) ||
    pathname === ROUTES.DASHBOARD_TEAMS ||
    pathname.startsWith(`${ROUTES.DASHBOARD_TEAMS}/`)
  ) {
    return (
      canAccessRouteByRole(actor.rol, pathname, access.appRole) ||
      access.moduleKeys?.includes('team_kanban') === true ||
      access.moduleKeys?.includes('team_dashboard') === true
    )
  }
  if (isAnalystByRole(actor.rol)) return canAccessRouteByRole(actor.rol, pathname, access.appRole)
  if (isAppSuperAdminByAppRole(access.appRole) || isSuperAdminByRole(actor.rol)) return true
  const moduleKey = MODULE_KEY_BY_PATH[pathname]
  if (access.moduleKeys && moduleKey) return access.moduleKeys.includes(moduleKey)
  return canAccessRouteByRole(actor.rol, pathname, access.appRole)
}

async function denyUnlessModule(
  actor: BoardActor,
  tool: CopilotToolName,
  module: string
): Promise<{ access: ActorAccess } | CopilotToolResult> {
  const path = MODULE_PATH[module]
  if (!path) return denied(tool, 'Modulo no reconocido.')
  const access = await loadActorAccess(actor)
  if (!canSeePath(actor, access, path)) {
    return denied(tool, `No tienes permiso para ver ${module.replace('_', ' ')}.`)
  }
  return { access }
}

function seesAllCorporateActions(actor: BoardActor) {
  return !isAnalystByRole(actor.rol)
}

function toCorporateAction(row: {
  id?: string | null
  estado?: string | null
  fecha?: string | null
  hora_limite?: string | null
  area?: string | null
}): CorporateActionLike | null {
  if (!row.id || !row.estado || !row.fecha) return null
  return {
    id: row.id,
    estado: row.estado,
    fecha: row.fecha.slice(0, 10),
    hora_limite: row.hora_limite,
    area: row.area,
  }
}

async function loadOpenActions(actor: BoardActor, allBoard: boolean) {
  let q = actor.supabase
    .from('acciones_diarias')
    .select('id,fecha,hora_limite,titulo_accion,estado,prioridad,responsable,area,updated_at')
    .in('estado', OPEN_STATES)
  if (!allBoard) q = q.eq('responsable', actor.usuarioId)
  const { data, error } = await q.order('fecha', { ascending: true }).limit(CORPORATE_OPEN_READ_LIMIT)
  if (error) throw error
  return (data ?? []) as Array<{
    id: string
    fecha?: string | null
    hora_limite?: string | null
    titulo_accion?: string | null
    estado?: string | null
    prioridad?: string | null
    responsable?: string | null
    area?: string | null
    updated_at?: string | null
  }>
}

function countBy(values: Array<string | null | undefined>) {
  const counts: Record<string, number> = {}
  for (const value of values) {
    const key = (value ?? 'sin_dato').trim() || 'sin_dato'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

async function dashboardSummary(actor: BoardActor, tool: CopilotToolName): Promise<CopilotToolResult> {
  const gate = await denyUnlessModule(actor, tool, 'dashboard')
  if ('kind' in gate) return gate
  const today = todayWallClockCDMX()
  const seesAll = seesAllCorporateActions(actor)
  const rows = await loadOpenActions(actor, seesAll)
  const actions = rows.flatMap((row) => {
    const action = toCorporateAction(row)
    return action ? [action] : []
  })
  const summary = summarizeCorporateActions(actions, {
    scope: seesAll ? 'organizacion' : 'responsable',
    today,
    truncated: readWasTruncated(rows.length, CORPORATE_OPEN_READ_LIMIT),
  })
  const overdue = actions.filter((row) => isCorporateOverdue(row))
  const blocked = actions.filter((row) => isCorporateBlocked(row))
  let hechoQ = actor.supabase
    .from('acciones_diarias')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'Hecho')
  if (!seesAllCorporateActions(actor)) hechoQ = hechoQ.eq('responsable', actor.usuarioId)
  const { count: hechoCount } = await hechoQ
  let operational: Record<string, unknown> | null = null
  const okrRes = await actor.supabase.rpc('get_operational_okr_dashboard')
  if (!okrRes.error && okrRes.data && typeof okrRes.data === 'object') {
    const payload = okrRes.data as {
      ok?: boolean
      okr?: { title?: string; overall_progress?: number; status?: string }
      key_results?: Array<{ title?: string; progress?: number; current_value?: number; target_value?: number }>
    }
    if (payload.ok !== false) {
      operational = {
        title: payload.okr?.title,
        status: payload.okr?.status,
        progress: payload.okr?.overall_progress,
        key_results: clip(
          (payload.key_results ?? []).map((kr) => ({
            title: kr.title,
            progress: kr.progress,
            current: kr.current_value,
            target: kr.target_value,
          })),
          8
        ),
      }
    }
  }
  return readOk(tool, {
    today,
    scope: summary.scope,
    scope_note: seesAll ? 'Tablero corporativo' : 'Solo acciones propias',
    timezone: CORPORATE_TIMEZONE,
    population: summary.population,
    truncated: summary.truncated,
    open: summary.open,
    overdue: summary.overdue,
    blocked: summary.blocked,
    due_today: summary.dueToday,
    pending_verification: hechoCount ?? 0,
    blocked_by_area: countByArea(blocked),
    by_estado: countBy(rows.map((row) => row.estado)),
    by_prioridad: countBy(rows.map((row) => row.prioridad)),
    hecho_abiertos_verificacion: hechoCount ?? 0,
    sample_overdue: clip(
      overdue.map((row) => {
        const source = rows.find((item) => item.id === row.id)
        return { id: row.id, title: source?.titulo_accion, fecha: row.fecha, estado: row.estado }
      }),
      8
    ),
    operational_okr: operational,
  })
}

type OrgRow = {
  id: string
  nombre: string
  rol: string | null
  area: string | null
  activo: boolean | null
  manager_user_id: string | null
}

function summarizeOrg(users: OrgRow[], focusId?: string) {
  const byId = new Map(users.map((user) => [user.id, user]))
  const reportsOf = (id: string) => users.filter((user) => user.manager_user_id === id)
  const toItem = (user: OrgRow) => ({
    id: user.id,
    nombre: user.nombre,
    rol: user.rol,
    area: user.area,
    reporta_a: user.manager_user_id ? byId.get(user.manager_user_id)?.nombre ?? null : null,
    equipo: reportsOf(user.id).length,
  })
  if (focusId) {
    const focus = byId.get(focusId)
    if (!focus) return { items: [] }
    const chain: OrgRow[] = []
    let current: OrgRow | undefined = focus
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      chain.push(current)
      seen.add(current.id)
      current = current.manager_user_id ? byId.get(current.manager_user_id) : undefined
      if (chain.length > 12) break
    }
    return {
      persona: toItem(focus),
      cadena_hacia_arriba: chain.slice(1).map((user) => user.nombre),
      reportes_directos: clip(reportsOf(focus.id).map(toItem), 12),
    }
  }
  const roots = users.filter((user) => !user.manager_user_id || !byId.has(user.manager_user_id))
  return {
    total: users.length,
    raices: clip(roots.map(toItem), 12),
    items: clip(users.map(toItem), 20),
  }
}

async function loadOrgUsers(actor: BoardActor): Promise<OrgRow[]> {
  const { data, error } = await actor.supabase
    .from('usuarios')
    .select('id,nombre,rol,area,activo,manager_user_id')
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .limit(400)
  if (error) throw error
  return ((data ?? []) as OrgRow[]).filter((user) => !isExcludedFromOrgChartByRole(user.rol))
}

async function orgChart(actor: BoardActor, tool: CopilotToolName, name: string): Promise<CopilotToolResult> {
  const gate = await denyUnlessModule(actor, tool, 'org_chart')
  if ('kind' in gate) return gate
  const users = await loadOrgUsers(actor)
  if (name) {
    const needle = fold(name)
    const matches = users.filter((user) => fold(user.nombre).includes(needle))
    if (matches.length === 0) return readOk(tool, { items: [], message: 'No hay coincidencias en el organigrama.' })
    if (matches.length === 1) return readOk(tool, summarizeOrg(users, matches[0].id))
    return readOk(tool, {
      coincidencias: clip(
        matches.map((user) => ({ id: user.id, nombre: user.nombre, rol: user.rol, area: user.area })),
        8
      ),
      message: 'Hay varias personas. Pide aclarar a cual te refieres.',
    })
  }
  return readOk(tool, summarizeOrg(users))
}

const OKR_OBJECTIVE_LIMIT = 20
const OKR_INITIATIVE_LIMIT = 40

type OkrReadRow = {
  id: string
  nombre_okr?: string | null
  scope?: string | null
  activo?: boolean | null
  start_date?: string | null
  end_date?: string | null
}

type KrReadRow = {
  id: string
  okr_id: string
  title?: string | null
  unit?: string | null
  baseline_value: number | null
  target_value: number | null
  current_value: number | null
  computed_progress?: number
}

function asProgressInput(kr: KrReadRow): KrProgressInput {
  return {
    baseline_value: kr.baseline_value,
    target_value: kr.target_value as number,
    current_value: kr.current_value,
    computed_progress: kr.computed_progress,
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asKrRow(row: Record<string, unknown>): KrReadRow | null {
  const id = typeof row.id === 'string' ? row.id : ''
  const okrId = typeof row.okr_id === 'string' ? row.okr_id : ''
  if (!id || !okrId) return null
  return {
    id,
    okr_id: okrId,
    title: typeof row.title === 'string' ? row.title : null,
    baseline_value: numberOrNull(row.baseline_value),
    target_value: numberOrNull(row.target_value),
    current_value: numberOrNull(row.current_value),
    unit: typeof row.unit === 'string' ? row.unit : null,
    computed_progress: numberOrNull(row.computed_progress) ?? undefined,
  }
}

function shapeOkrProgress(input: {
  objectives: OkrReadRow[]
  keyResults: KrReadRow[]
  initiatives: Array<{ key_result_id?: string | null }>
  today: string
  truncated: boolean
}) {
  const items = input.objectives.map((okr) => {
    const krs = input.keyResults.filter((kr) => kr.okr_id === okr.id)
    const krIds = new Set(krs.map((kr) => kr.id))
    const linked = input.initiatives.filter(
      (item) => item.key_result_id && krIds.has(item.key_result_id)
    )
    const objective: Pick<Objective, 'activo' | 'start_date' | 'end_date'> = {
      activo: okr.activo !== false,
      start_date: okr.start_date ?? null,
      end_date: okr.end_date ?? null,
    }
    const progress = objectiveProgress(krs.map(asProgressInput))
    const visibleKrs = krs.slice(0, 6)
    return {
      id: okr.id,
      nombre: okr.nombre_okr,
      scope: okr.scope,
      periodo: [okr.start_date, okr.end_date].filter(Boolean).join(' a '),
      progress,
      pace: objectivePaceStatus(objective, progress, input.today),
      insufficient_krs: krs.filter((kr) => krProgress(asProgressInput(kr)) == null).length,
      without_initiatives: linked.length === 0,
      krs_truncated: krs.length > visibleKrs.length,
      krs: visibleKrs.map((kr) => {
        const value = krProgress(asProgressInput(kr))
        return {
          id: kr.id,
          title: kr.title,
          actual: kr.current_value,
          meta: kr.target_value,
          baseline: kr.baseline_value,
          unidad: kr.unit,
          progress: value,
          progress_label: value == null ? 'sin_datos_suficientes' : 'medible',
        }
      }),
    }
  })
  const visible = items.slice(0, 8)
  return {
    objectives: input.objectives.length,
    keyResults: input.keyResults.length,
    initiatives: input.initiatives.length,
    without_initiatives: items.filter((item) => item.without_initiatives).length,
    insufficient_krs: items.reduce((sum, item) => sum + item.insufficient_krs, 0),
    truncated:
      input.truncated ||
      items.length > visible.length ||
      visible.some((item) => item.krs_truncated),
    items: visible,
  }
}

async function toolOkrProgress(actor: BoardActor): Promise<CopilotToolResult> {
  const gate = await denyUnlessModule(actor, 'get_okr_progress', 'okrs')
  if ('kind' in gate) return gate
  const today = todayWallClockCDMX()
  const { data, error } = await actor.supabase
    .from('okrs')
    .select('id,nombre_okr,scope,area_id,owner_user_id,start_date,end_date,activo')
    .eq('activo', true)
    .order('start_date', { ascending: false })
    .limit(OKR_OBJECTIVE_LIMIT)
  if (error) {
    const rpc = await actor.supabase.rpc('okr_dashboard')
    if (rpc.error) return denied('get_okr_progress', 'No tienes acceso a OKRs o el tablero no está disponible.')
    const payload = rpc.data as {
      objectives?: unknown[]
      keyResults?: unknown[]
      initiatives?: unknown[]
    }
    const objectives = (Array.isArray(payload?.objectives) ? payload.objectives : []).flatMap((item) => {
      const row = item as Record<string, unknown>
      return typeof row.id === 'string'
        ? [{
            id: row.id,
            nombre_okr: typeof row.nombre_okr === 'string' ? row.nombre_okr : null,
            scope: typeof row.scope === 'string' ? row.scope : null,
            activo: row.activo !== false,
            start_date: typeof row.start_date === 'string' ? row.start_date : null,
            end_date: typeof row.end_date === 'string' ? row.end_date : null,
          } satisfies OkrReadRow]
        : []
    })
    const keyResults = (Array.isArray(payload?.keyResults) ? payload.keyResults : []).flatMap((item) => {
      const row = asKrRow(item as Record<string, unknown>)
      return row ? [row] : []
    })
    const initiatives = (Array.isArray(payload?.initiatives) ? payload.initiatives : []).flatMap((item) => {
      const row = item as Record<string, unknown>
      return typeof row.key_result_id === 'string' ? [{ key_result_id: row.key_result_id }] : []
    })
    return readOk('get_okr_progress', shapeOkrProgress({
      objectives,
      keyResults,
      initiatives,
      today,
      truncated: objectives.length >= OKR_OBJECTIVE_LIMIT,
    }))
  }
  const objectives = (data ?? []) as OkrReadRow[]
  const ids = objectives.map((row) => row.id)
  const krQuery = ids.length
    ? await actor.supabase
        .from('okr_key_results')
        .select('id,okr_id,title,current_value,target_value,baseline_value,unit')
        .in('okr_id', ids)
        .order('display_order', { ascending: true })
    : { data: [] as unknown[] }
  const keyResults = ((krQuery.data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
    const parsed = asKrRow(row)
    return parsed ? [parsed] : []
  })
  const krIds = keyResults.map((kr) => kr.id)
  const initiativeQuery = krIds.length
    ? await actor.supabase
        .from('okr_initiatives')
        .select('id,key_result_id')
        .in('key_result_id', krIds)
        .limit(OKR_INITIATIVE_LIMIT)
    : { data: [] as unknown[] }
  const initiatives = (initiativeQuery.data ?? []) as Array<{ key_result_id?: string | null }>
  return readOk('get_okr_progress', shapeOkrProgress({
    objectives,
    keyResults,
    initiatives,
    today,
    truncated:
      readWasTruncated(objectives.length, OKR_OBJECTIVE_LIMIT) ||
      readWasTruncated(initiatives.length, OKR_INITIATIVE_LIMIT),
  }))
}

async function moduleKpis(supabase: SupabaseClient, query: string) {
  let q = supabase
    .from('catalog_kpis')
    .select('id,nombre,current_value,meta_objetivo,unidad,calc_type,direction,gap_id,owner_usuario,in_global_portfolio,activo')
    .eq('activo', true)
    .order('orden', { ascending: true })
    .limit(40)
  const { data, error } = await q
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) => matchesQuery(String(row.nombre ?? ''), query))
  return { items: clip(rows, 16) }
}

async function moduleGaps(supabase: SupabaseClient, query: string) {
  const { data, error } = await supabase
    .from('gaps')
    .select('id,nombre,status,area,prioridad,owner_usuario,total_story_points,activo')
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .limit(40)
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) => matchesQuery(String(row.nombre ?? ''), query))
  return { items: clip(rows, 16) }
}

async function moduleImpacto(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('catalog_kpis')
    .select('id,nombre,current_value,meta_objetivo,unidad,calc_type,weight,in_global_portfolio,activo')
    .eq('activo', true)
    .eq('in_global_portfolio', true)
    .order('orden', { ascending: true })
    .limit(40)
  if (error) throw error
  return { items: clip((data ?? []) as Array<Record<string, unknown>>, 16) }
}

async function moduleTickets(actor: BoardActor, access: ActorAccess, query: string) {
  let q = actor.supabase
    .from('support_tickets')
    .select('id,titulo,status,prioridad,modulo,tipo,created_by,created_at')
    .order('created_at', { ascending: false })
    .limit(30)
  if (!canManageSupportTicketsByRole(actor.rol) && !isAppSuperAdminByAppRole(access.appRole)) {
    q = q.eq('created_by', actor.usuarioId)
  }
  const { data, error } = await q
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) =>
    matchesQuery(`${row.titulo ?? ''} ${row.modulo ?? ''}`, query)
  )
  return { items: clip(rows, 12) }
}

async function moduleTeamKanban(actor: BoardActor, access: ActorAccess, query: string) {
  let q = actor.supabase
    .from('acciones_equipo')
    .select('id,area_id,titulo,prioridad,asignado_a,fecha_limite,bloqueada,escalada,completed_at,estado_id')
    .is('completed_at', null)
    .order('fecha_limite', { ascending: true })
    .limit(40)
  if (!canViewAllBoardData(actor.rol, access.appRole) && !isAppSuperAdminByAppRole(access.appRole)) {
    if (access.areaIds.length > 0) q = q.in('area_id', access.areaIds)
    else q = q.eq('asignado_a', actor.usuarioId)
  }
  const { data, error } = await q
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) => matchesQuery(String(row.titulo ?? ''), query))
  const now = new Date()
  const teamSummary = summarizeTeamActions(
    rows.map((row) => ({
      id: String(row.id ?? ''),
      fecha_limite: typeof row.fecha_limite === 'string' ? row.fecha_limite : null,
      bloqueada: row.bloqueada === true,
      completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    })),
    now
  )
  const overdue = rows.filter((row) =>
    isTeamDeadlinePast(typeof row.fecha_limite === 'string' ? row.fecha_limite : null, now)
  ).length
  return {
    population: 'acciones_equipo',
    timezone: CORPORATE_TIMEZONE,
    open: teamSummary.open,
    overdue,
    blocked: teamSummary.blocked,
    truncated: readWasTruncated((data ?? []).length, 40),
    items: clip(
      rows.map((row) => ({
        id: row.id,
        titulo: row.titulo,
        prioridad: row.prioridad,
        fecha_limite: row.fecha_limite,
        bloqueada: row.bloqueada,
        escalada: row.escalada,
      })),
      16
    ),
  }
}

async function moduleCalendar(actor: BoardActor, query: string) {
  const today = todayWallClockCDMX()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query) ? query : today
  const from = addDays(date, -1)
  const to = addDays(date, 14)
  let actionsQ = actor.supabase
    .from('acciones_diarias')
    .select('id,fecha,hora_limite,titulo_accion,estado,responsable')
    .gte('fecha', from)
    .lte('fecha', to)
    .order('fecha', { ascending: true })
    .limit(40)
  if (!seesAllCorporateActions(actor)) actionsQ = actionsQ.eq('responsable', actor.usuarioId)
  const remindersQ = actor.supabase
    .from('calendar_reminders')
    .select('id,titulo,fecha_limite,completed_at,user_id')
    .gte('fecha_limite', `${from}T00:00:00`)
    .lte('fecha_limite', `${to}T23:59:59`)
    .or(`user_id.eq.${actor.usuarioId},user_id.eq.${actor.authUserId}`)
    .order('fecha_limite', { ascending: true })
    .limit(20)
  const [actions, reminders] = await Promise.all([actionsQ, remindersQ])
  if (actions.error) throw actions.error
  return {
    from,
    to,
    acciones: clip(
      ((actions.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id,
        titulo: row.titulo_accion,
        fecha: row.fecha,
        hora: row.hora_limite,
        estado: row.estado,
      })),
      16
    ),
    recordatorios: clip(
      ((reminders.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id,
        titulo: row.titulo,
        fecha: row.fecha_limite,
        completado: Boolean(row.completed_at),
      })),
      8
    ),
  }
}

async function moduleChallenges(supabase: SupabaseClient, query: string) {
  const { data, error } = await supabase
    .from('challenges')
    .select('id,title,status,start_date,end_date,area_id')
    .in('status', ['active', 'pending', 'finished'])
    .order('updated_at', { ascending: false })
    .limit(20)
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) => matchesQuery(String(row.title ?? ''), query))
  return { items: clip(rows, 12) }
}

async function moduleNotifications(actor: BoardActor) {
  const { data, error } = await actor.supabase
    .from('notificaciones')
    .select('id,tipo,prioridad,leido,created_at,payload')
    .eq('usuario_id', actor.usuarioId)
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) throw error
  return {
    items: clip(
      ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id,
        tipo: row.tipo,
        prioridad: row.prioridad,
        leido: row.leido,
        created_at: row.created_at,
      })),
      12
    ),
  }
}

async function moduleSprints(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('sprints')
    .select('id,nombre,estado,fecha_inicio,fecha_fin')
    .order('fecha_inicio', { ascending: false })
    .limit(8)
  if (error) throw error
  return { items: clip((data ?? []) as Array<Record<string, unknown>>, 8) }
}

async function moduleStrategy(supabase: SupabaseClient) {
  const [north, fces, pillars] = await Promise.all([
    supabase.from('strategic_north').select('mision,vision,bhag,bhag_anio,valores').order('updated_at', { ascending: false }).limit(1),
    supabase.from('fce').select('codigo,nombre,descripcion,orden').eq('activo', true).order('orden', { ascending: true }).limit(12),
    supabase.from('strategic_pillars').select('id,nombre,descripcion').eq('activo', true).limit(12),
  ])
  return {
    norte: north.error ? null : north.data?.[0] ?? null,
    fce: fces.error ? [] : clip((fces.data ?? []) as Array<Record<string, unknown>>, 12),
    pilares: pillars.error ? [] : clip((pillars.data ?? []) as Array<Record<string, unknown>>, 8),
  }
}

async function moduleDisciplina(actor: BoardActor) {
  const today = todayWallClockCDMX()
  const { data: medicion } = await actor.supabase
    .from('medicion_disciplina')
    .select(
      'fecha,acciones_asignadas,acciones_cerradas_en_tiempo,porcentaje_cumplimiento,acciones_sin_evidencia,reincidencias,dias_consecutivos_en_verde'
    )
    .eq('usuario_id', actor.usuarioId)
    .eq('fecha', today)
    .maybeSingle()
  const scoreRes = await actor.supabase
    .from('user_org_chart_scores')
    .select('profile_complete_points,total_points')
    .eq('user_id', actor.usuarioId)
    .maybeSingle()
  const score = scoreRes.error ? null : scoreRes.data
  const rows = await loadOpenActions(actor, false)
  return {
    fecha: today,
    medicion: medicion ?? null,
    organigrama_puntos: score ?? null,
    acciones_abiertas: rows.length,
    retraso: rows.filter((row) => row.estado === 'Retraso').length,
    bloqueadas: rows.filter((row) => row.estado === 'Bloqueado').length,
  }
}

async function moduleAcademy(actor: BoardActor) {
  const [{ data: progress }, { data: modules }] = await Promise.all([
    actor.supabase
      .from('academy_progress')
      .select('completed_modules,completed_steps,passed_quizzes,updated_at')
      .eq('user_id', actor.authUserId)
      .maybeSingle(),
    actor.supabase.from('academy_modules').select('id,title,is_active').eq('is_active', true).order('id', { ascending: true }).limit(20),
  ])
  const completed = Array.isArray(progress?.completed_modules) ? progress.completed_modules : []
  return {
    actualizado: progress?.updated_at ?? null,
    modulos_completados: completed.length,
    quizzes_aprobados: Array.isArray(progress?.passed_quizzes) ? progress.passed_quizzes.length : 0,
    catalogo: clip(
      ((modules ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id,
        title: row.title,
        completado: completed.includes(row.id as number),
      })),
      16
    ),
  }
}

async function moduleAreas(supabase: SupabaseClient, query: string) {
  const { data, error } = await supabase.from('areas').select('id,nombre').order('nombre', { ascending: true }).limit(40)
  if (error) throw error
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) => matchesQuery(String(row.nombre ?? ''), query))
  return { items: clip(rows, 20) }
}

function modulePlanAccion() {
  return {
    pistas: PLAN_ACCION_TRACKS.map((track) => ({
      id: track.id,
      label: track.label,
      fase: track.phaseLabel,
      tarjetas: track.cards.map((card) => ({ badge: card.badge, title: card.title, tag: card.tag ?? null })),
    })),
  }
}

async function moduleReports(actor: BoardActor) {
  const today = todayWallClockCDMX()
  const from = addDays(today, -30)
  let q = actor.supabase
    .from('acciones_diarias')
    .select('id,estado,prioridad,area,fecha')
    .gte('fecha', from)
    .lte('fecha', today)
    .limit(800)
  if (!seesAllCorporateActions(actor)) q = q.eq('responsable', actor.usuarioId)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Array<{ estado?: string | null; prioridad?: string | null; area?: string | null }>
  return {
    periodo: { from, to: today },
    total: rows.length,
    by_estado: countBy(rows.map((row) => row.estado)),
    by_prioridad: countBy(rows.map((row) => row.prioridad)),
    by_area: countBy(rows.map((row) => row.area)),
  }
}

async function moduleDistancias(actor: BoardActor) {
  const { data, error } = await actor.supabase
    .from('distance_requests')
    .select('id,created_at,created_by')
    .or(`created_by.eq.${actor.usuarioId},created_by.eq.${actor.authUserId}`)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return { items: clip((data ?? []) as Array<Record<string, unknown>>, 10) }
}

async function toolModuleData(
  actor: BoardActor,
  module: string,
  query: string
): Promise<CopilotToolResult> {
  if (module === 'dashboard') return dashboardSummary(actor, 'get_module_data')
  if (module === 'org_chart') return orgChart(actor, 'get_module_data', query)
  const gate = await denyUnlessModule(actor, 'get_module_data', module)
  if ('kind' in gate) return gate
  const { access } = gate
  switch (module) {
    case 'kpis':
      return readOk('get_module_data', { module, ...(await moduleKpis(actor.supabase, query)) })
    case 'gaps':
      return readOk('get_module_data', { module, ...(await moduleGaps(actor.supabase, query)) })
    case 'impacto':
      return readOk('get_module_data', { module, ...(await moduleImpacto(actor.supabase)) })
    case 'tickets':
      return readOk('get_module_data', { module, ...(await moduleTickets(actor, access, query)) })
    case 'team_kanban':
      return readOk('get_module_data', { module, ...(await moduleTeamKanban(actor, access, query)) })
    case 'calendar':
      return readOk('get_module_data', { module, ...(await moduleCalendar(actor, query)) })
    case 'challenges':
      return readOk('get_module_data', { module, ...(await moduleChallenges(actor.supabase, query)) })
    case 'notifications':
      return readOk('get_module_data', { module, ...(await moduleNotifications(actor)) })
    case 'sprints':
      return readOk('get_module_data', { module, ...(await moduleSprints(actor.supabase)) })
    case 'strategy':
      return readOk('get_module_data', { module, ...(await moduleStrategy(actor.supabase)) })
    case 'disciplina':
      return readOk('get_module_data', { module, ...(await moduleDisciplina(actor)) })
    case 'academy':
      return readOk('get_module_data', { module, ...(await moduleAcademy(actor)) })
    case 'areas':
      return readOk('get_module_data', { module, ...(await moduleAreas(actor.supabase, query)) })
    case 'plan_accion':
      return readOk('get_module_data', { module, ...modulePlanAccion() })
    case 'reports':
      return readOk('get_module_data', { module, ...(await moduleReports(actor)) })
    case 'distancias':
      return readOk('get_module_data', { module, ...(await moduleDistancias(actor)) })
    case 'okrs': {
      const okr = await toolOkrProgress(actor)
      if (!okr.ok) return { ...okr, tool: 'get_module_data' }
      return readOk('get_module_data', { module, data: okr.data })
    }
    default:
      return denied('get_module_data', 'Modulo no reconocido.')
  }
}

async function toolSearchBoard(actor: BoardActor, query: string): Promise<CopilotToolResult> {
  if (fold(query).length < 2) return denied('search_board', 'Indica al menos 2 caracteres para buscar.')
  const access = await loadActorAccess(actor)
  const hits: Record<string, unknown> = {}
  const jobs: Array<Promise<void>> = []

  const run = async (key: string, job: () => Promise<unknown>) => {
    try {
      hits[key] = await job()
    } catch {
      hits[key] = []
    }
  }

  jobs.push(
    run('acciones', async () => {
      let q = actor.supabase
        .from('acciones_diarias')
        .select('id,titulo_accion,estado,fecha,responsable')
        .ilike('titulo_accion', `%${escapeIlike(query)}%`)
        .limit(8)
      if (!seesAllCorporateActions(actor)) q = q.eq('responsable', actor.usuarioId)
      const { data } = await q
      return clip(data ?? [], 8)
    })
  )

  jobs.push(
    run('personas', async () => {
      const { data } = await actor.supabase
        .from('usuarios')
        .select('id,nombre,rol,area')
        .eq('activo', true)
        .ilike('nombre', `%${escapeIlike(query)}%`)
        .limit(8)
      return clip(data ?? [], 8)
    })
  )

  if (canSeePath(actor, access, ROUTES.TICKETS)) {
    jobs.push(run('tickets', async () => (await moduleTickets(actor, access, query)).items))
  }
  if (canSeePath(actor, access, ROUTES.DASHBOARD_KPIS)) {
    jobs.push(run('kpis', async () => (await moduleKpis(actor.supabase, query)).items))
  }
  if (canSeePath(actor, access, ROUTES.DASHBOARD_GAPS)) {
    jobs.push(run('gaps', async () => (await moduleGaps(actor.supabase, query)).items))
  }
  if (canSeePath(actor, access, ROUTES.CHALLENGES)) {
    jobs.push(run('retos', async () => (await moduleChallenges(actor.supabase, query)).items))
  }
  if (canSeePath(actor, access, ROUTES.ORG_CHART)) {
    jobs.push(
      run('organigrama', async () => {
        const users = await loadOrgUsers(actor)
        const needle = fold(query)
        return clip(
          users
            .filter((user) => fold(user.nombre).includes(needle) || fold(user.area ?? '').includes(needle))
            .map((user) => ({ id: user.id, nombre: user.nombre, rol: user.rol, area: user.area })),
          8
        )
      })
    )
  }
  if (canSeePath(actor, access, ROUTES.TEAM_KANBAN)) {
    jobs.push(run('kanban_equipos', async () => (await moduleTeamKanban(actor, access, query)).items))
  }
  if (canSeePath(actor, access, ROUTES.OKRS)) {
    jobs.push(
      run('okrs', async () => {
        const { data } = await actor.supabase
          .from('okrs')
          .select('id,nombre_okr,scope,activo')
          .eq('activo', true)
          .ilike('nombre_okr', `%${escapeIlike(query)}%`)
          .limit(8)
        return clip(data ?? [], 8)
      })
    )
    jobs.push(
      run('key_results', async () => {
        const { data } = await actor.supabase
          .from('okr_key_results')
          .select('id,okr_id,title,current_value,target_value,unit')
          .ilike('title', `%${escapeIlike(query)}%`)
          .limit(8)
        return clip(data ?? [], 8)
      })
    )
  }

  await Promise.all(jobs)
  return readOk('search_board', { query, ...hits })
}

export function isBoardReadTool(name: string): name is BoardReadTool {
  return (BOARD_READ_TOOLS as readonly string[]).includes(name)
}

export async function dispatchBoardReadTool(
  actor: BoardActor,
  name: string,
  rawArgs: unknown
): Promise<CopilotToolResult | null> {
  if (!isBoardReadTool(name)) return null
  const args = asArgs(rawArgs)
  const query = asString(args.query, 80) || asString(args.name, 80)
  switch (name) {
    case 'get_dashboard_summary':
      return dashboardSummary(actor, name)
    case 'get_org_chart':
      return orgChart(actor, name, query)
    case 'get_module_data':
      return toolModuleData(actor, asString(args.module, 40), query)
    case 'search_board':
      return toolSearchBoard(actor, query)
    case 'get_okr_progress':
      return toolOkrProgress(actor)
    default:
      return null
  }
}
