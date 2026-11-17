/**
 * Contrato estructurado de consultas de acciones (get_my_actions + active_query).
 * Sin SQL libre: el backend resuelve identidad y filtros autorizados.
 * Merge/types SSOT: src/features/ai-support/actionQuery/
 */
import { priorityColorFor } from '../../src/features/operations/utils/priorityColors.js'
import { findPriorityForAccion } from '../../src/features/operations/utils/resolveAccionPrioridad.js'
import {
  isCorporateBlocked,
  isCorporateOverdue,
} from '../../src/features/metrics/corporateActionMetrics.js'
import { canViewAllBoardData, isAnalystByRole } from '../../src/features/auth/lib/permissions.js'
import type {
  ActionActiveQuery,
  ActionQueryScope,
  ActionQueryStatusGroup,
  ActionQueryVisual,
} from '../../src/features/ai-support/actionQuery/types.js'
import {
  buildActiveQueryEntry,
  isPersonalActionScope,
  looksLikePersonalFollowUp,
  mergeActionQueryArgs,
  parseActionQueryScope,
  parseActionQueryStatusGroup,
  parseActionQueryVisual,
} from '../../src/features/ai-support/actionQuery/mergeArgs.js'

export type {
  ActionActiveQuery,
  ActionQueryScope,
  ActionQueryStatusGroup,
  ActionQueryVisual,
} from '../../src/features/ai-support/actionQuery/types.js'

export {
  buildActiveQueryEntry,
  isPersonalActionScope,
  looksLikePersonalFollowUp,
  mergeActionQueryArgs,
  parseActionQueryScope,
  parseActionQueryStatusGroup,
  parseActionQueryVisual,
}

export type PriorityCatalogRow = {
  id: string
  nombre: string
  color?: string | null
  activo?: boolean
}

export function populationLabel(scope: ActionQueryScope): string {
  if (scope === 'assigned_to_me') return 'responsable_actual'
  if (scope === 'created_by_me') return 'creadas_por_mi'
  if (scope === 'assigned_to_me_or_created') return 'responsable_o_creador'
  if (scope === 'team_authorized') return 'equipo_autorizado'
  return 'tablero_autorizado'
}

export function canUseWideActionScope(
  scope: ActionQueryScope,
  input: { rol?: string | null; boardScope?: 'role' | 'organization' }
): boolean {
  if (scope === 'assigned_to_me' || scope === 'created_by_me' || scope === 'assigned_to_me_or_created') {
    return true
  }
  if (input.boardScope === 'organization') return true
  if (canViewAllBoardData(input.rol, null)) return true
  // Misma regla que get_team_actions: Analista sin org scope no ve ajenas.
  return !isAnalystByRole(input.rol)
}

/** ¿La acción cuenta como "roja" del tablero? (prioridad roja o retraso/vencida). */
export function actionMatchesVisual(
  row: {
    id?: string
    estado?: string | null
    fecha?: string | null
    hora_limite?: string | null
    prioridad?: string | null
    prioridad_id?: string | null
  },
  visual: ActionQueryVisual,
  priorities: PriorityCatalogRow[],
  now = Date.now()
): boolean {
  if (visual === 'none') return true
  const catalog = priorities.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    color: p.color ?? null,
    descripcion: null,
    orden: 0,
    activo: p.activo !== false,
    created_at: '',
    updated_at: '',
  }))
  const priority = findPriorityForAccion(
    { prioridad: row.prioridad ?? '', prioridad_id: row.prioridad_id },
    catalog
  )
  const color = priorityColorFor(priority?.nombre ?? row.prioridad ?? '', priority?.color)
  const nowDate = new Date(now)
  const overdue =
    row.estado === 'Retraso' ||
    (Boolean(row.id && row.estado && row.fecha) &&
      isCorporateOverdue(
        {
          id: row.id!,
          estado: row.estado!,
          fecha: row.fecha!,
          hora_limite: row.hora_limite,
        },
        nowDate
      ))

  if (visual === 'priority_red') return color === 'rojo'
  if (visual === 'overdue') return overdue
  // board_red: misma unión que AiAssistPage / snapshot
  return color === 'rojo' || overdue
}

export function actionMatchesStatusGroup(
  row: {
    id?: string
    estado?: string | null
    fecha?: string | null
    hora_limite?: string | null
    updated_at?: string | null
  },
  statusGroup: ActionQueryStatusGroup,
  opts: { today: string; weekEnd: string; now: number; staleDays: number }
): boolean {
  if (statusGroup === 'verification') return row.estado === 'Hecho'
  if (statusGroup === 'blocked') {
    return (
      Boolean(row.id && row.estado && row.fecha) &&
      isCorporateBlocked({
        id: row.id!,
        estado: row.estado!,
        fecha: row.fecha!,
        hora_limite: row.hora_limite,
      })
    )
  }
  const action =
    row.id && row.estado && row.fecha
      ? { id: row.id, estado: row.estado, fecha: row.fecha, hora_limite: row.hora_limite }
      : null
  if (statusGroup === 'overdue') return action != null && isCorporateOverdue(action, new Date(opts.now))
  if (statusGroup === 'due_week') {
    return Boolean(
      row.fecha &&
        row.fecha >= opts.today &&
        row.fecha <= opts.weekEnd &&
        !(action && isCorporateOverdue(action, new Date(opts.now)))
    )
  }
  if (statusGroup === 'stale') {
    const t = row.updated_at ? Date.parse(row.updated_at) : NaN
    return Number.isFinite(t) && opts.now - t >= opts.staleDays * 86_400_000
  }
  return true
}

function asString(value: unknown, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function readLatestActiveQuery(log: unknown): ActionActiveQuery | null {
  const rows = Array.isArray(log) ? log : []
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    if (item.type === 'active_query' && item.entity === 'actions') {
      return {
        type: 'active_query',
        entity: 'actions',
        scope: parseActionQueryScope(item.scope),
        status_group: parseActionQueryStatusGroup(item.status_group),
        visual: parseActionQueryVisual(item.visual),
        at: asString(item.at, 40) || new Date().toISOString(),
      }
    }
    // Compat: summary JSON embebido en consult_log normal
    if (typeof item.summary === 'string' && item.summary.includes('"type":"active_query"')) {
      try {
        const parsed = JSON.parse(item.summary) as Record<string, unknown>
        if (parsed.type === 'active_query') {
          return {
            type: 'active_query',
            entity: 'actions',
            scope: parseActionQueryScope(parsed.scope),
            status_group: parseActionQueryStatusGroup(parsed.status_group),
            visual: parseActionQueryVisual(parsed.visual),
            at: asString(parsed.at, 40) || new Date().toISOString(),
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null
}

/**
 * Si el LLM elige dashboard/team en un follow-up personal, reescribe a get_my_actions
 * fusionando el active_query (caso «53 → Todas»).
 */
export function maybeRewriteWideToolToMyActions(input: {
  tool: string
  args: Record<string, unknown>
  previous: ActionActiveQuery | null
  utterance?: string | null
}): { tool: string; args: Record<string, unknown>; rewrote: boolean; rewrote_from?: string } {
  const { tool, args, previous, utterance } = input
  const wide = tool === 'get_dashboard_summary' || tool === 'get_team_actions'
  if (!wide || !previous || !isPersonalActionScope(previous.scope)) {
    return { tool, args, rewrote: false }
  }
  if (!looksLikePersonalFollowUp(utterance)) {
    return { tool, args, rewrote: false }
  }
  const merged = mergeActionQueryArgs(args, previous, utterance)
  const scope = isPersonalActionScope(merged.scope) ? merged.scope : previous.scope
  const nextArgs: Record<string, unknown> = {
    ...args,
    scope,
    status_group: merged.status_group,
    visual: merged.visual,
    include_count: true,
  }
  if (merged.limit != null) nextArgs.limit = merged.limit
  delete nextArgs.utterance
  delete nextArgs.user_utterance
  delete nextArgs.follow_up
  return {
    tool: 'get_my_actions',
    args: nextArgs,
    rewrote: true,
    rewrote_from: tool,
  }
}
