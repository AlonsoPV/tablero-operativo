/**
 * Fusión de follow-ups sobre active_query (SSOT cliente/servidor).
 */
import type {
  ActionActiveQuery,
  ActionQueryScope,
  ActionQueryStatusGroup,
  ActionQueryVisual,
} from './types'

const SCOPES: ActionQueryScope[] = [
  'assigned_to_me',
  'created_by_me',
  'assigned_to_me_or_created',
  'team_authorized',
  'board_authorized',
]

const STATUS_GROUPS: ActionQueryStatusGroup[] = [
  'open',
  'overdue',
  'due_week',
  'stale',
  'blocked',
  'verification',
]

const VISUALS: ActionQueryVisual[] = ['none', 'priority_red', 'overdue', 'board_red']

function asString(value: unknown, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function parseActionQueryScope(raw: unknown): ActionQueryScope {
  const value = asString(raw, 40)
  if ((SCOPES as string[]).includes(value)) return value as ActionQueryScope
  return 'assigned_to_me'
}

export function parseActionQueryStatusGroup(
  raw: unknown,
  legacyFilter?: unknown
): ActionQueryStatusGroup {
  const value = asString(raw, 40) || asString(legacyFilter, 40)
  if ((STATUS_GROUPS as string[]).includes(value)) return value as ActionQueryStatusGroup
  if (value === 'open' || !value) return 'open'
  return 'open'
}

export function parseActionQueryVisual(raw: unknown): ActionQueryVisual {
  const value = asString(raw, 40)
  if ((VISUALS as string[]).includes(value)) return value as ActionQueryVisual
  if (/rojo|red|priority_red/i.test(value)) return 'board_red'
  return 'none'
}

export function isPersonalActionScope(scope: ActionQueryScope): boolean {
  return (
    scope === 'assigned_to_me' ||
    scope === 'created_by_me' ||
    scope === 'assigned_to_me_or_created'
  )
}

function normalizeUtterance(utterance?: string | null): string {
  return (utterance || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function buildActiveQueryEntry(input: {
  scope: ActionQueryScope
  status_group: ActionQueryStatusGroup
  visual: ActionQueryVisual
  at?: string
}): ActionActiveQuery {
  return {
    type: 'active_query',
    entity: 'actions',
    scope: input.scope,
    status_group: input.status_group,
    visual: input.visual,
    at: input.at || new Date().toISOString(),
  }
}

/**
 * Fusiona follow-ups hablados / args parciales sobre el active_query previo.
 */
export function mergeActionQueryArgs(
  args: Record<string, unknown>,
  previous: ActionActiveQuery | null,
  utterance?: string | null
): {
  scope: ActionQueryScope
  status_group: ActionQueryStatusGroup
  visual: ActionQueryVisual
  limit?: number
} {
  const text = normalizeUtterance(utterance)
  const hasExplicit =
    args.scope != null || args.status_group != null || args.visual != null || args.filter != null
  const continuityFollowUp =
    /^(todas?|esas|esos|enlista(las|los)?|listalas?)([.?!\s]*)$/.test(text) ||
    (/^(cuales|cual|mostr|list|detalle|enlista)\b/.test(text) &&
      !/(rojo|vencid|retraso|cree|cread|asign[eé]|he asignado|responsable|equipo|tablero|bloquead|prioridad|abiertas?|corporativ|org\b|en total)/.test(
        text
      ))

  let scope: ActionQueryScope = hasExplicit
    ? parseActionQueryScope(args.scope || previous?.scope)
    : previous?.scope || 'assigned_to_me'
  let status_group: ActionQueryStatusGroup = hasExplicit
    ? parseActionQueryStatusGroup(args.status_group, args.filter || previous?.status_group)
    : previous?.status_group || 'open'
  let visual: ActionQueryVisual = hasExplicit
    ? parseActionQueryVisual(args.visual ?? previous?.visual ?? 'none')
    : previous?.visual || 'none'

  if (previous && !hasExplicit && !text) {
    scope = previous.scope
    status_group = previous.status_group
    visual = previous.visual
  }

  if (
    /cree|cread[ao]s?|solicite|que yo pedi|asigne|asign[eé]|he asignado|asignadas? por mi|yo (le |les )?asign/.test(
      text
    )
  ) {
    scope = 'created_by_me'
  } else if (
    /soy responsable|me asignaron|asignad[ao]s? a mi|mis acciones|\btengo\b|a mi cargo/.test(text) &&
    !/he asignado|asigne|asign[eé]/.test(text)
  ) {
    scope = 'assigned_to_me'
  } else if (/todo el equipo|de mi equipo/.test(text)) {
    scope = 'team_authorized'
  } else if (
    /tablero|toda la org|corporativ|todas las acciones del tablero|en total|cuantas? (acciones? )?(hay|existen)/.test(
      text
    )
  ) {
    scope = 'board_authorized'
  }

  if (/prioridad\s*roj|p1|critica/.test(text)) visual = 'priority_red'
  else if (/\ben rojo\b|rojas?\b/.test(text)) visual = 'board_red'
  else if (/vencid|en retraso|atrasad/.test(text)) visual = 'overdue'

  if (/bloquead/.test(text)) status_group = 'blocked'
  else if (/vencid|en retraso/.test(text) && visual === 'overdue') status_group = 'overdue'
  else if (
    (/\babiertas?\b/.test(text) || /\btodas?\b/.test(text) || /\btodos?\b/.test(text)) &&
    !/vencid|en retraso|rojo|bloquead/.test(text)
  ) {
    status_group = 'open'
    visual = 'none'
  }

  if (previous && continuityFollowUp && isPersonalActionScope(previous.scope)) {
    scope = previous.scope
    status_group = previous.status_group
    visual = previous.visual
  } else if (previous && !hasExplicit && continuityFollowUp) {
    scope = previous.scope
    status_group = previous.status_group
    visual = previous.visual
  }

  const limitRaw = typeof args.limit === 'number' ? args.limit : null
  const wantsList = /cuales|todas|lista|mostr|detall|enlista/.test(text)
  return {
    scope,
    status_group,
    visual,
    limit: limitRaw ?? (wantsList ? 12 : undefined),
  }
}

export function looksLikePersonalFollowUp(utterance?: string | null): boolean {
  const text = normalizeUtterance(utterance)
  if (/todo el equipo|de mi equipo|tablero|toda la org|corporativ|\bdashboard\b/.test(text)) {
    return false
  }
  if (!text) return true
  if (/^(todas?|cuales|cual|mostr|list|detalle|esas|esos|enlista)/.test(text)) return true
  if (/\ben rojo\b|y en rojo|rojas?\b|vencid|en retraso|responsable|cree|solicite|abiertas?/.test(text)) {
    return true
  }
  return text.length <= 48
}
