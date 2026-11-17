/**
 * Motor de interpretación operativa (previo a tools).
 * No ejecuta escrituras ni genera SQL.
 */
import {
  mergeActionQueryArgs,
  type ActionActiveQuery,
  type ActionQueryScope,
  type ActionQueryStatusGroup,
  type ActionQueryVisual,
} from './actionQueryContract.js'
import { classifyCommunicationIntent } from './communicationIntent.js'
import {
  findTermsInText,
  OPERATIONAL_DICTIONARY_VERSION,
  type OperationalModule,
} from '../../src/features/ai-support/operationalSemantics/operationalDictionary.js'

export type OperationalIntent =
  | 'query'
  | 'propose_create_kanban'
  | 'propose_create_initiative'
  | 'prepare_comms'
  | 'recommend'
  | 'clarify'

export type OperationalIdentity = {
  kind: 'self' | 'named' | 'team' | 'unresolved'
  hint?: string
}

export type OperationalFilters = {
  scope?: ActionQueryScope
  status_group?: ActionQueryStatusGroup
  visual?: ActionQueryVisual
  limit?: number
}

export type OperationalInterpretation = {
  intent: OperationalIntent
  module: OperationalModule | 'unknown'
  entity: string
  identity: OperationalIdentity
  filters?: OperationalFilters
  toolHint?: string
  ambiguity?: { question: string }
  dictionaryVersion: string
  matchedTermIds: string[]
}

export type InterpretOperationalOptions = {
  activeQuery?: ActionActiveQuery | null
  workIntent?: string | null
  hasSelectedAction?: boolean
  hasSelectedOkr?: boolean
  hasOpenDraft?: boolean
}

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function looksLikeCreate(text: string) {
  return /\b(crea(r|me)?|genera(r|me)?|agrega(r|me)?|registra(r)?|anota(r)?|arma(r|me)?|propon(e|me|er)?)\b/.test(
    text
  )
}

function looksLikeRecommend(text: string) {
  return /\b(recomiend|que (hago|deberia|debo)|analiza|diagnost|prioriz|estrateg)\b/.test(text)
}

function extractNamedHint(text: string): string | undefined {
  const m =
    text.match(/\ba\s+([a-z]{3,}(?:\s+[a-z]{3,}){0,2})\b/) ||
    text.match(/\bpara\s+([a-z]{3,}(?:\s+[a-z]{3,}){0,2})\b/)
  if (!m?.[1]) return undefined
  const name = m[1].trim()
  if (/^(mi|mis|yo|el|la|los|las|una|un|equipo|tablero|org)\b/.test(name)) return undefined
  return name
}

/**
 * Interpreta un mensaje operativo sin ejecutar tools.
 */
export function interpretOperationalMessage(
  message: string,
  options: InterpretOperationalOptions = {}
): OperationalInterpretation {
  const text = normalize(message)
  const terms = findTermsInText(text)
  const ids = new Set(terms.map((t) => t.id))
  const matchedTermIds = [...ids]
  const base: Pick<OperationalInterpretation, 'dictionaryVersion' | 'matchedTermIds'> = {
    dictionaryVersion: OPERATIONAL_DICTIONARY_VERSION,
    matchedTermIds,
  }

  const hasKanbanWork = ids.has('kanban_action') || /\b(tarea|accion|incidencia|pendiente|compromiso)\b/.test(text)
  const hasInitiative = ids.has('okr_initiative') || /\biniciativa(s)?\b/.test(text)
  const hasOkr = ids.has('okr_objective') || ids.has('okr_key_result') || /\b(okr|objetivo|key result|\bkr\b)\b/.test(text)
  const create = looksLikeCreate(text)
  const linkToObjective = /\b(objetivo|okr|al objetivo|al okr)\b/.test(text)
  const explicitCommsChannel = /\b(whatsapp|wasap|correo|email|mail)\b/.test(text)

  // --- Comunicaciones: solo si hay canal/mensaje explícito, no «genera una acción…» ---
  const comms = classifyCommunicationIntent(message, { hasOpenDraft: options.hasOpenDraft })
  const commsAction =
    comms.action === 'prepare' || comms.action === 'update' || comms.action === 'cancel'
  const looksLikeWorkCreate = create && (hasKanbanWork || hasInitiative || hasOkr || linkToObjective)
  if (
    !looksLikeWorkCreate &&
    commsAction &&
    (comms.shouldQueue || comms.askChannel) &&
    (explicitCommsChannel || /\bmensaje\b/.test(text) || ids.has('comms_draft'))
  ) {
    return {
      ...base,
      intent: 'prepare_comms',
      module: 'comms',
      entity: 'comms_draft',
      identity: { kind: extractNamedHint(text) ? 'named' : 'self', hint: extractNamedHint(text) },
      toolHint: 'queue_workspace_draft',
      ambiguity:
        comms.askChannel
          ? { question: '¿Lo prefieres por WhatsApp o correo?' }
          : undefined,
    }
  }

  // --- Creación: Kanban vs iniciativa ---
  if (create) {
    if (hasInitiative && !hasKanbanWork) {
      return {
        ...base,
        intent: 'propose_create_initiative',
        module: 'okrs',
        entity: 'okr_initiative',
        identity: { kind: 'self' },
        toolHint: 'get_okr_progress',
      }
    }
    // Acción/tarea + mención de objetivo/OKR → aclarar (no ambas operaciones).
    if (
      (hasKanbanWork && hasInitiative) ||
      (hasKanbanWork && linkToObjective) ||
      (linkToObjective && !hasInitiative && !hasKanbanWork)
    ) {
      return {
        ...base,
        intent: 'clarify',
        module: 'unknown',
        entity: 'kanban_action|okr_initiative',
        identity: { kind: 'unresolved' },
        ambiguity: {
          question:
            '¿La registramos como tarea del Kanban o como iniciativa del OKR?',
        },
      }
    }
    if (hasKanbanWork && !hasInitiative) {
      return {
        ...base,
        intent: 'propose_create_kanban',
        module: 'kanban',
        entity: 'kanban_action',
        identity: { kind: 'self' },
        toolHint: 'create_action',
      }
    }
    if (hasOkr && !hasKanbanWork) {
      return {
        ...base,
        intent: 'propose_create_initiative',
        module: 'okrs',
        entity: hasInitiative ? 'okr_initiative' : 'okr_objective',
        identity: { kind: 'self' },
        toolHint: 'get_okr_progress',
      }
    }
    if (hasKanbanWork || options.workIntent === 'action' || options.workIntent === 'create') {
      return {
        ...base,
        intent: 'propose_create_kanban',
        module: 'kanban',
        entity: 'kanban_action',
        identity: { kind: 'self' },
        toolHint: 'create_action',
      }
    }
  }

  // --- Recomendación ---
  if (looksLikeRecommend(text) && !create) {
    const merged = mergeActionQueryArgs({}, options.activeQuery ?? null, message)
    return {
      ...base,
      intent: 'recommend',
      module: hasOkr && !hasKanbanWork ? 'okrs' : 'kanban',
      entity: hasOkr && !hasKanbanWork ? 'okr_objective' : 'kanban_action',
      identity: { kind: 'self' },
      filters: merged,
      toolHint: hasOkr && !hasKanbanWork ? 'get_okr_progress' : 'get_my_actions',
    }
  }

  // --- Consulta OKR ---
  if (hasOkr && !hasKanbanWork && !ids.has('visual_board_red')) {
    return {
      ...base,
      intent: 'query',
      module: 'okrs',
      entity: ids.has('okr_initiative')
        ? 'okr_initiative'
        : ids.has('okr_key_result')
          ? 'okr_key_result'
          : 'okr_objective',
      identity: { kind: 'self' },
      toolHint: 'get_okr_progress',
    }
  }

  // --- Dashboard explícito ---
  if (ids.has('bau_dashboard') || /\b(dashboard|bau|tablero corporativo|toda la org)\b/.test(text)) {
    if (!/\b(mis|tengo|responsable|cree)\b/.test(text)) {
      return {
        ...base,
        intent: 'query',
        module: 'org',
        entity: 'bau_dashboard',
        identity: { kind: 'team' },
        toolHint: 'get_dashboard_summary',
      }
    }
  }

  // --- Consulta Kanban (personal / filtros) ---
  const merged = mergeActionQueryArgs({}, options.activeQuery ?? null, message)
  let identity: OperationalIdentity = { kind: 'self' }
  if (merged.scope === 'team_authorized' || merged.scope === 'board_authorized' || ids.has('role_team')) {
    identity = { kind: 'team' }
  }
  const named = extractNamedHint(text)
  if (named && /\b(asigne|asigne a|de|para)\b/.test(text)) {
    identity = { kind: 'named', hint: named }
  }

  if (ids.has('role_verificador') || /\bverific/.test(text)) {
    merged.status_group = 'verification'
  }

  return {
    ...base,
    intent: 'query',
    module: 'kanban',
    entity: 'kanban_action',
    identity,
    filters: {
      scope: merged.scope,
      status_group: merged.status_group,
      visual: merged.visual,
      limit: merged.limit,
    },
    toolHint: 'get_my_actions',
  }
}

/** ¿Debe el canal pedir aclaración Kanban vs OKR en vez de despachar create? */
export function shouldClarifyCreate(interpretation: OperationalInterpretation): boolean {
  return interpretation.intent === 'clarify' && Boolean(interpretation.ambiguity?.question)
}
