import {
  buildActiveQueryEntry,
  mergeActionQueryArgs,
} from '@/features/ai-support/actionQuery/mergeArgs'
import { matchPeopleByName, type NamedPerson } from '@/features/ai-support/copilot/matching'
import { looksLikeCommsPrepare } from '@/features/ai-support/operationalSemantics/classifyCreateWork'
import { parseFormatDirective } from '@/features/ai-support/responseFormat'
import { isConceptualQuestion } from '@/features/ai-support/consultation/classifyConsultation'
import { isMethodQuestion } from '@/features/ai-support/consultation/speechAct'
import {
  initialConversationState,
  toActiveQuery,
  type ApplyTurnInput,
  type ApplyTurnResult,
  type ConversationQueryState,
  type ConversationRelation,
  type PersonRef,
} from './types'

function normalize(text: string) {
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

const STOP_PERSON = new Set([
  'mi',
  'mis',
  'yo',
  'me',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'tablero',
  'equipo',
  'organizacion',
  'verificacion',
  'acciones',
  'accion',
  'abiertas',
  'pendientes',
  'todas',
  'todos',
  'total',
  'vencidas',
  'bloqueadas',
  'ayer',
  'hoy',
  'manana',
  'seguimiento',
  'actualizacion',
])

const NON_BARE_PERSON_RE =
  /\b(muestra|muestrame|lista|listame|enlista|enlistar|enlistalas|cuales|cuantas?|cuantos?|todas|todos|vencidas?|acciones?|asignad\w*|asigna\w*|reasigna\w*|crea\w*|dime|analiza|tablero|responsable|por mi|a mi|para|por|con|sobre|que|como|mejor|lo|la|los|las|un|una|al|del|prepara\w*|cambia\w*|reprograma\w*|cancela\w*|confirma\w*|edita\w*|haz|dile|avisa\w*|manda\w*|envia\w*|ponle|dejale|encargale|pasalo|pasala|quedo|anterior|correo|whatsapp|wasap)\b/

function looksLikeOperationOrControlTurn(t: string): boolean {
  const clean = t.replace(/^[¿¡\s]+/, '')
  return (
    /^(?:prepara(?:la|lo|r)?|mejor\b|cambia(?:la|lo|r)?|reprograma(?:la|lo|r)?|cancela(?:r|lo|la)?|confirma(?:r)?|edita(?:r|lo|la)?|agrega(?:r|le)?|anade(?:le)?|registra(?:r)?|reporta(?:r)?|marca(?:r|la|lo)?|cierra(?:r|la|lo)?|verifica(?:r|la|lo)?|haz lo mismo|dile|avisa(?:le)?|manda(?:le|les)?|envia(?:le|les)?|asigna(?:le|sela|selo|r)?|reasigna(?:le|sela|selo|r)?|ponle|dejale|encargale|pasalo|pasala|como quedo|muestrame la accion|borrador)\b/.test(
      clean
    ) ||
    /\b(por correo|por whatsapp|lo anterior|cambia la fecha|como quedo|preparala|preparalo|quien es el responsable|de quien es|cual es su situacion|como va esa accion|cual es su estado|que estatus tiene|resume esta accion)\b/.test(
      clean
    )
  )
}

function extractPersonHint(message: string): string | null {
  const t = normalize(message)
  if (looksLikeOperationOrControlTurn(t)) return null
  const patterns = [
    /\b(?:cuales?|que|cuantas?)?\s*(?:acciones?\s+)?(?:tiene|tienen)\s+([a-z][a-z0-9._-]{1,40})\b/,
    /\bacciones?\s+de\s+([a-z][a-z0-9._-]{1,40})\b/,
    /\bpendientes?\s+de\s+([a-z][a-z0-9._-]{1,40})\b/,
    /\b(?:para|a)\s+([a-z][a-z0-9._-]{1,40})(?:\s|$)/,
  ]
  for (const re of patterns) {
    const match = t.match(re)
    const name = match?.[1]?.trim()
    if (name && !STOP_PERSON.has(name)) return name
  }
  // Mensaje corto = solo un nombre ("Jorge" / "Jorge Perez"), no imperativos/consultas/chips/frases con preposiciones
  if (
    /^[a-z][a-z0-9._-]{1,40}(?:\s+[a-z][a-z0-9._-]{1,40}){0,2}$/.test(t) &&
    !STOP_PERSON.has(t) &&
    !NON_BARE_PERSON_RE.test(t)
  ) {
    return t
  }
  return null
}

function wantsList(message: string) {
  const t = normalize(message)
  if (/^(cuantas?|cuantos?)\b/.test(t) && !/\b(cuales|lista|muestra|enlista)\b/.test(t)) return false
  // Chips de filtro / imperativos de alcance → lista breve (no reporte ejecutivo)
  if (
    /^(asignadas? a mi|asignadas? por mi|las que yo asigne|tablero|vencidas?|enlistalas?|todas del tablero)([.!?\s]*)$/.test(
      t
    )
  ) {
    return true
  }
  return /\b(muestra|muestrame|lista|listame|enlista|enlistar|enlistalas|listalas|cuales|cual|todas|todos|detalle|detalla|las que|los que|que acciones|que paso|sin seguimiento)\b/.test(
    t
  )
}

function wantsCount(message: string) {
  const t = normalize(message)
  return /^(cuantas?|cuantos?)\b/.test(t) || /\ben total\b/.test(t)
}

function wantsRecommend(message: string) {
  return /\b(recomiend|analiz|prioriz|que (deberia|debo)|cual(es)? deberia|deberia atender|atenderse primero|diagnost)\b/.test(
    normalize(message)
  )
}

function looksLikeKanbanQuery(message: string, hasPendingClarify: boolean) {
  if (hasPendingClarify) return true
  if (wantsRecommend(message)) return true
  const t = normalize(message)
  if (
    /\b(acciones?|pendientes?|tablero|kanban|asign\w*|responsable|vencid\w*|retraso|bloquead\w*|en rojo|rojas?|abiertas?|enlist\w*|lista|listame|cuales?|cuantas?|cuantos?|tengo|mis acciones|cread\w*|solicite|en total|ayer|seguimiento|estancad|sin actualizaci|que paso)\b/.test(
      t
    )
  ) {
    return true
  }
  if (
    /^(todas?|esas|esos|enlista(las|los)?|muestra(las|los)?|muestra(?:me)?\s+(?:todas?|todos?|esas|esos)|si|sí|no)([.!?\s]*)$/.test(t) ||
    /^y\s+(vencid\w*|bloquead\w*|rojas?|abiertas?)\??$/.test(t)
  ) {
    return true
  }
  // Nombre corto como follow-up de persona (nunca imperativos/controles ni frases con preposiciones)
  if (
    /^[a-z][a-z0-9._-]{1,40}(?:\s+[a-z][a-z0-9._-]{1,40}){0,2}$/.test(t) &&
    !STOP_PERSON.has(t) &&
    !NON_BARE_PERSON_RE.test(t)
  ) {
    return true
  }
  return false
}

function looksLikeHandoff(message: string) {
  if (/https?:\/\/|\/(?:kanban(?:-equipos(?:\/tablero)?)?|okrs)(?:\?|#|\b)/i.test(message)) return true
  const t = normalize(message)
  // «Envia un correo / WhatsApp con el resumen de sus acciones» → tools, no lista Kanban.
  if (looksLikeCommsPrepare(message)) return true
  if (looksLikeOperationOrControlTurn(t)) return true
  if (
    /\b(okr|okrs|objetivo|iniciativa|whatsapp|wasap|correo|email|crea(r|me)?|genera(r|me)?)\b/.test(
      t
    ) && !/\b(acciones?|pendientes?|tablero|asign|responsable|vencid|rojo)\b/.test(t)
  ) {
    return true
  }
  return !looksLikeKanbanQuery(message, false)
}

function relationFromScope(
  scope: ConversationQueryState['scope'],
  person: PersonRef | null
): ConversationRelation {
  if (person) return 'person_responsable'
  if (scope === 'created_by_me') return 'created_by'
  if (scope === 'board_authorized') return 'board'
  if (scope === 'team_authorized') return 'team'
  return 'responsable'
}

function resolveYesNo(
  message: string,
  pending: NonNullable<ConversationQueryState['pendingClarification']>,
  people: NamedPerson[]
): { person: PersonRef } | { rejectHint: string } | null {
  const t = normalize(message)
  if (looksLikeCommsPrepare(message) || looksLikeOperationOrControlTurn(t)) return null
  if (/^(si|sí|ok|dale|correcto|ese|esa)([.!?\s]*)$/.test(t)) {
    const first = pending.candidates[0]
    if (!first) return null
    return { person: { id: first.id, nombre: first.nombre } }
  }
  if (/^(no|nop|nel)([.!?\s]*)$/.test(t)) {
    return { rejectHint: pending.hint }
  }
  // "No, Jorge Garcia" / "Jorge Garcia"
  const afterNo = t.startsWith('no') ? t.replace(/^no[,\s]+/, '') : null
  if (afterNo && looksLikeOperationOrControlTurn(afterNo)) return null
  const hinted = extractPersonHint(message) || afterNo
  if (hinted) {
    const matched = matchPeopleByName(people, hinted)
    if (matched.length === 1) {
      return { person: { id: matched[0]!.id, nombre: matched[0]!.nombre } }
    }
    if (matched.length > 1) {
      return { rejectHint: hinted }
    }
  }
  return null
}

/**
 * Interpreta un turno y actualiza el contrato de consulta.
 * No ejecuta datos: solo estado / aclaración / handoff.
 */
export function applyConversationTurn(input: ApplyTurnInput): ApplyTurnResult {
  const message = input.message.trim()
  const prev = input.previous
  const now = new Date().toISOString()

  // Directiva de formato («modo reporte», «automático»): no es un nombre de persona.
  // El orquestador aplica el formato y, si hay resto, consulta una sola vez.
  if (parseFormatDirective(message)) {
    const state = {
      ...(prev ?? initialConversationState()),
      entity: 'none' as const,
      intent: 'handoff' as const,
      pendingClarification: null,
      updatedAt: now,
    }
    return { kind: 'handoff', state, reason: 'format_directive' }
  }

  // Explicar o asesorar no busca un responsable, aunque la frase mencione acciones.
  if (isMethodQuestion(message) || isConceptualQuestion(message)) {
    return {
      kind: 'handoff',
      reason: 'non_kanban',
      state: {
        ...(prev ?? initialConversationState()),
        entity: 'none',
        intent: 'handoff',
        person: null,
        pendingClarification: null,
        updatedAt: now,
      },
    }
  }

  // --- Aclaración pendiente ---
  if (prev?.pendingClarification?.kind === 'person') {
    const resolved = resolveYesNo(message, prev.pendingClarification, input.people)
    if (resolved && 'person' in resolved) {
      const base = mergeActionQueryArgs(
        {},
        toActiveQuery({ ...prev, pendingClarification: null }),
        prev.pendingClarification.originalMessage
      )
      const state: ConversationQueryState = {
        ...prev,
        entity: 'kanban_action',
        intent: wantsList(prev.pendingClarification.originalMessage) ? 'list' : 'count',
        scope: base.scope === 'board_authorized' ? 'board_authorized' : prev.scope,
        status_group: base.status_group,
        visual: base.visual,
        person: resolved.person,
        relation: 'person_responsable',
        responseMode: wantsList(prev.pendingClarification.originalMessage) ? 'list' : 'list',
        pendingClarification: null,
        lastResultIds: [],
        updatedAt: now,
      }
      // Persona nombrada → siempre filtrar por responsable de esa persona (board pool).
      if (input.canSeeTeam) state.scope = 'board_authorized'
      return { kind: 'query', state }
    }
    if (resolved && 'rejectHint' in resolved) {
      const matched = matchPeopleByName(input.people, resolved.rejectHint)
      if (matched.length === 1) {
        const state: ConversationQueryState = {
          ...prev,
          person: { id: matched[0]!.id, nombre: matched[0]!.nombre },
          relation: 'person_responsable',
          scope: input.canSeeTeam ? 'board_authorized' : prev.scope,
          intent: 'list',
          responseMode: 'list',
          pendingClarification: null,
          lastResultIds: [],
          updatedAt: now,
        }
        return { kind: 'query', state }
      }
      if (matched.length > 1) {
        const state: ConversationQueryState = {
          ...prev,
          intent: 'clarify',
          responseMode: 'clarify',
          pendingClarification: {
            kind: 'person',
            candidates: matched.slice(0, 5),
            originalMessage: prev.pendingClarification.originalMessage,
            hint: resolved.rejectHint,
          },
          updatedAt: now,
        }
        return {
          kind: 'clarify',
          state,
          clarification: {
            question: `¿Te refieres a ${matched
              .slice(0, 3)
              .map((p) => p.nombre)
              .join(' o ')}?`,
            options: matched.slice(0, 5).map((p) => ({ id: p.id, label: p.nombre })),
          },
        }
      }
    }
    // Si no resuelve la aclaración y cambia de tema, cae al flujo normal (cancela pending abajo).
  }

  const hasPending = Boolean(prev?.pendingClarification)
  if (
    looksLikeHandoff(message) ||
    !looksLikeKanbanQuery(message, false)
  ) {
    const state = {
      ...(prev ?? initialConversationState()),
      entity: 'none' as const,
      intent: 'handoff' as const,
      pendingClarification: null,
      updatedAt: now,
    }
    return { kind: 'handoff', state, reason: 'non_kanban' }
  }
  void hasPending

  const previousActive = prev?.entity === 'kanban_action' ? toActiveQuery(prev) : null
  const merged = mergeActionQueryArgs({}, previousActive, message)

  // Persona en el mensaje
  const personHint = extractPersonHint(message)
  let person: PersonRef | null = prev?.person ?? null
  let pending: ConversationQueryState['pendingClarification'] = null

  // Si pide "mis/asigné/tablero" explícito, limpia persona previa
  const clearsPerson =
    /mis acciones|\btengo\b|asignad[ao]s? a mi|asignadas? por mi|he asignado|asigne|cread|tablero|\btablero\b|en total|soy responsable/.test(
      normalize(message)
    ) && !personHint

  if (clearsPerson) person = null

  if (personHint) {
    const matched = matchPeopleByName(input.people, personHint)
    if (matched.length === 1) {
      person = { id: matched[0]!.id, nombre: matched[0]!.nombre }
    } else if (matched.length > 1) {
      const state: ConversationQueryState = {
        ...(prev ?? initialConversationState()),
        entity: 'kanban_action',
        intent: 'clarify',
        scope: input.canSeeTeam ? 'board_authorized' : merged.scope,
        status_group: merged.status_group,
        visual: merged.visual,
        person: null,
        relation: 'person_responsable',
        responseMode: 'clarify',
        lastResultIds: [],
        pendingClarification: {
          kind: 'person',
          candidates: matched.slice(0, 5),
          originalMessage: message,
          hint: personHint,
        },
        updatedAt: now,
      }
      return {
        kind: 'clarify',
        state,
        clarification: {
          question: `¿Te refieres a ${matched
            .slice(0, 3)
            .map((p) => p.nombre)
            .join(' o ')}?`,
          options: matched.slice(0, 5).map((p) => ({ id: p.id, label: p.nombre })),
        },
      }
    } else {
      const state: ConversationQueryState = {
        ...(prev ?? initialConversationState()),
        entity: 'kanban_action',
        intent: 'clarify',
        responseMode: 'empty',
        person: null,
        pendingClarification: null,
        lastResultIds: [],
        updatedAt: now,
      }
      return {
        kind: 'clarify',
        state,
        clarification: {
          question: `No encontré a nadie llamado «${personHint}». ¿Puedes corregir el nombre?`,
          options: [],
        },
      }
    }
  }

  let scope = merged.scope
  if (person && input.canSeeTeam) scope = 'board_authorized'
  if (scope === 'board_authorized' && !input.canSeeTeam) {
    scope = 'assigned_to_me'
  }

  const list = wantsList(message)
  const count = wantsCount(message) && !list
  const recommend = wantsRecommend(message)

  // Follow-up corto: conservar persona
  const bareFollowUp =
    /^(enlista(las|los)?|listalas?|muestra(las|los|me)?|cuales|cuales son|todas|detalla|esas|esos)$/.test(
      normalize(message)
    ) || /^y\s+(vencidas?|bloqueadas?|rojas?|abiertas?)\??$/.test(normalize(message))

  if (bareFollowUp && prev?.person && !clearsPerson && !personHint) {
    person = prev.person
    if (input.canSeeTeam) scope = 'board_authorized'
  }

  const relation = relationFromScope(scope, person)
  const intent = recommend ? 'recommend' : list || bareFollowUp ? 'list' : count ? 'count' : list ? 'list' : 'count'
  // Default a list si hay persona o "cuales"; count si pregunta cuantas
  const responseMode = recommend
    ? 'analysis'
    : intent === 'list'
      ? 'list'
      : intent === 'count'
        ? 'count'
        : 'list'

  const state: ConversationQueryState = {
    entity: 'kanban_action',
    intent: intent === 'recommend' ? 'recommend' : intent,
    scope,
    status_group: merged.status_group,
    visual: merged.visual,
    person,
    relation,
    responseMode: responseMode === 'analysis' ? 'analysis' : responseMode,
    lastResultIds: [],
    pendingClarification: pending,
    updatedAt: now,
  }

  // Sync active query marker (útil para logs)
  void buildActiveQueryEntry(state)

  return { kind: 'query', state }
}
