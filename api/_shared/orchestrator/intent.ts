/**
 * Intención del turno (CV-01). Reglas deterministas primero; si el mensaje no es
 * una consulta operativa reconocible devuelve 'unknown' y el canal usa su LLM.
 */
import { interpretOperationalMessage } from '../operationalInterpret.js'
import type {
  ActionActiveQuery,
  ActionQueryScope,
  ActionQueryStatusGroup,
  ActionQueryVisual,
} from '../../../src/features/ai-support/actionQuery/types.js'

export type AgentIntent =
  | {
      kind: 'query_actions'
      scope: ActionQueryScope
      statusGroup: ActionQueryStatusGroup
      visual: ActionQueryVisual
      focusToday: boolean
      limit?: number
      personHint?: string
      /** El usuario pidió explícitamente datos fuera de su ámbito (otro equipo, privadas). */
      restrictedRequest: boolean
    }
  | { kind: 'query_okrs'; period: 'current_quarter' | 'all_active' }
  | { kind: 'query_knowledge'; focus: 'documents' | 'memory' | 'either' }
  | {
      kind: 'aggregate_execution'
      groupBy: 'area' | 'responsable' | 'estado'
      statusGroup: 'open' | 'overdue' | 'blocked'
    }
  | { kind: 'analyze_risk' }
  | {
      kind: 'executive_brief'
      focus: 'overview' | 'priorities' | 'execution' | 'recurrence'
    }
  | {
      kind: 'executive_commitments'
      filter: 'all' | 'verification' | 'by_owner' | 'overdue'
    }
  | {
      kind: 'executive_discipline'
      focus: 'stale' | 'overview'
    }
  | { kind: 'executive_preventive' }
  | { kind: 'executive_evidence'; priorityIndex?: number }
  | {
      kind: 'executive_review'
      action: 'start' | 'next' | 'previous' | 'skip' | 'focus_priority' | 'record_decision' | 'summary'
      priorityIndex?: number
      note?: string
    }
  | { kind: 'who_most_urgent' }
  | { kind: 'recommend_next' }
  | { kind: 'unsupported_metric'; domain: 'finance' }
  | {
      kind: 'write_request'
      operation:
        | 'create_action'
        | 'update_action'
        | 'update_status'
        | 'register_blocker'
        | 'notify_responsable'
        | 'add_comment'
        | 'verify_action'
      request: string
      estado?: 'Pendiente' | 'En_Ejecucion' | 'Hecho' | 'Verificado'
      motivo?: string
      canal?: 'email' | 'whatsapp'
      contenido?: string
      batch?: 'commitments' | 'decisions'
    }
  | { kind: 'unsupported_write'; operation: 'tag_okr_action' | 'sql' | 'generic' }
  | { kind: 'clarify'; question: string }
  | { kind: 'unknown' }

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const OPERATIONAL_TERMS =
  /\b(accion(es)?|tarea(s)?|pendiente(s)?|vencid[ao]s?|atrasad[ao]s?|retraso|bloquead[ao]s?|bloqueo(s)?|ejecucion|prioridad(es)?|urgente(s)?|asigne|asignad[ao]s?|responsable|equipo(s)?|kanban|okrs?|objetivo(s)?|kr|key results?|iniciativa(s)?|verificar|verificacion|tengo|cuales|todas?|en rojo)\b/

const FINANCE = /\b(dinero|pesos|dolares|costo(s)?|cuesta|perdiendo|perdida(s)?|ingreso(s)?|ventas?|presupuesto|margen|utilidad(es)?|financier[ao]s?)\b|\$/

const NOT_A_PERSON =
  /^(mi|mis|yo|el|la|los|las|una|un|equipo|tablero|org|hoy|manana|semana|pendiente|pendientes|todas?|todos?|ellas?|ellos?|alguien|nadie|que|cual|cuales|prioridad|retraso)$/

export type IntentSessionHints = {
  hasExecutiveSession?: boolean
  lastActionCount?: number
  lastEntityKind?: 'action' | 'person' | null
}

function priorityIndexFromText(text: string): number | undefined {
  const numbered = text.match(/\bprioridad\s*#?\s*([1-3])\b/)
  if (numbered) return Number(numbered[1]) - 1
  if (/\b(primera|la 1(?:ra)?|prioridad principal)\b/.test(text)) return 0
  if (/\b(segunda|la 2(?:da)?)\b/.test(text)) return 1
  if (/\b(tercera|la 3(?:ra)?)\b/.test(text)) return 2
  return undefined
}

function isDocumentaryAsk(text: string): boolean {
  const documentary =
    /\b(documentos?|documentacion|en la memoria|busca(?:r)? (?:en )?(?:la )?memoria|acuerdos? confirmados?|politicas? (oficiales?|de la (empresa|organizacion))|procedimientos? (oficiales?|de la (empresa|organizacion)))\b/.test(
      text
    ) || /\bbusca(?:r)? documentos?\b/.test(text)
  if (!documentary) return false
  const boardExclusive =
    /\b(okrs?|objetivos estrategicos|acciones del tablero|kanban|mis acciones)\b/.test(text) &&
    !/\b(documentos?|memoria|documentacion|politica|procedimiento)\b/.test(text)
  return !boardExclusive
}

function isFollowUpReference(text: string, session?: IntentSessionHints | null): boolean {
  const hasContext = Boolean(session?.hasExecutiveSession || (session?.lastActionCount ?? 0) > 0)
  if (!hasContext) return false
  return (
    /\b(esa|este|esta|ese)\s+(accion|problema|prioridad|hallazgo|objetivo)\b/.test(text) ||
    /\b(la (?:primera|segunda|tercera) prioridad|prioridad\s*#?\s*[1-3]|prioridad principal)\b/.test(text) ||
    /\b(profundiza(?:r)?|cual era|de esta revision|sigue con eso|mas detalle|abre esa)\b/.test(text)
  )
}

function extractPersonHint(text: string): string | undefined {
  const m =
    text.match(/\b(?:tiene|tienen)\s+([a-z]{3,}(?:\s+[a-z]{3,})?)\s*[?.!]*$/) ||
    text.match(/\ba cargo de\s+([a-z]{3,}(?:\s+[a-z]{3,})?)/) ||
    text.match(/\b(?:acciones|pendientes?|tareas?)\s+de\s+([a-z]{3,}(?:\s+[a-z]{3,})?)/)
  const name = m?.[1]?.trim()
  if (!name || NOT_A_PERSON.test(name.split(' ')[0] ?? '')) return undefined
  return name
}

export function classifyAgentIntent(
  utterance: string,
  previous: ActionActiveQuery | null,
  session?: IntentSessionHints | null
): AgentIntent {
  const text = normalize(utterance)
  if (!text) return { kind: 'unknown' }

  if (FINANCE.test(text) && /\b(cuant[oa]s?|monto|calcula|estima|impacto)\b|\$/.test(text)) {
    return { kind: 'unsupported_metric', domain: 'finance' }
  }

  if (isDocumentaryAsk(text)) {
    const focus = /\bdocumentos?\b/.test(text) && !/\bmemoria\b/.test(text)
      ? 'documents'
      : /\bmemoria\b/.test(text) && !/\bdocumentos?\b/.test(text)
        ? 'memory'
        : 'either'
    return { kind: 'query_knowledge', focus }
  }

  if (/\b(riesgos?|en peligro|amenaza|comprometiendo|poniendo en riesgo)\b/.test(text)) {
    return { kind: 'analyze_risk' }
  }

  // Inteligencia ejecutiva: diagnóstico operativo, prioridades, patrones repetidos y compromisos
  if (
    /\b(como esta mi empresa|como va mi empresa|como estamos hoy|estado general de la operacion|panorama ejecutivo|diagnostico operativo|analizar ejecucion de la empresa|analiza la ejecucion de la empresa|donde tenemos problemas de ejecucion|que esta frenando|frenando a mi equipo|frenando al equipo|cuellos de botella)\b/.test(
      text
    )
  ) {
    const focus = /\b(problemas de ejecucion|analizar ejecucion|analiza la ejecucion|que esta frenando|frenando a mi equipo|frenando al equipo|cuellos de botella)\b/.test(text)
      ? 'execution'
      : 'overview'
    return { kind: 'executive_brief', focus }
  }

  if (
    /\b(que requiere mi atencion|que necesita mi atencion|principales problemas|3 principales|tres principales|top 3|prioridades ejecutivas|que deberia priorizar hoy|que priorizar hoy|(?:que )?(?:acciones )?deberia priorizar(?: esta semana| hoy)?|que priorizar esta semana)\b/.test(
      text
    )
  ) {
    return { kind: 'executive_brief', focus: 'priorities' }
  }

  if (/\b(que situaciones se estan repitiendo|situaciones repetidas|problemas repetitivos|reincidencia)\b/.test(text)) {
    return { kind: 'executive_brief', focus: 'recurrence' }
  }

  if (
    /\b(que departamentos presentan mayores retrasos|departamentos con mayores retrasos|areas con mas retrasos|que areas tienen mas retrasos)\b/.test(
      text
    )
  ) {
    return { kind: 'aggregate_execution', groupBy: 'area', statusGroup: 'overdue' }
  }

  if (
    /\b(compromisos pendientes|acuerdos pendientes|compromisos por responsable|pendientes de verificacion|pendientes de verificado|en hecho pendientes|situaciones sin actualizacion|compromisos? (?:que )?no se estan cumpliendo|compromisos? incumplidos?|compromisos? de (?:nuestra|la) ultima reunion|acuerdos? de (?:nuestra|la) ultima reunion|que acordamos en (?:la|nuestra) ultima reunion)\b/.test(
      text
    )
  ) {
    const filter = /\b(verificacion|verificado|en hecho)\b/.test(text)
      ? 'verification'
      : /\bpor responsable\b/.test(text)
        ? 'by_owner'
        : /\b(no se estan cumpliendo|incumplidos?)\b/.test(text)
          ? 'overdue'
          : 'all'
    return { kind: 'executive_commitments', filter }
  }

  const looksLikeWriteVerb =
    /\b(crea|crear|creame|registra|registrar|agrega|agregar|anota|anotar|actualiza|actualizar|cambia|cambiar|elimina|eliminar|borra|borrar|edita|editar|convierte|convertir|prepara|preparar)\b/.test(
      text
    )
  if (
    !looksLikeWriteVerb &&
    /\b(avances estrategicos|avance estrategico|revisar avances estrategicos|resultados de los okrs?|objetivos estrategicos requieren atencion|objetivos estrategicos|que objetivos requieren atencion|iniciativas? activas?|iniciativas? en curso|iniciativas? estrategicas?|mis iniciativas?|nuestras iniciativas?|que iniciativas?|cuales son (?:mis |las )?iniciativas?|como van las iniciativas?|como vamos con las iniciativas?)\b/.test(
      text
    )
  ) {
    return { kind: 'query_okrs', period: /\b(trimestre|trimestral|q[1-4])\b/.test(text) ? 'current_quarter' : 'all_active' }
  }

  if (/\b(prepara|preparar|genera|generar|arma|armar)\b/.test(text) && /\bborrador\b/.test(text) && /\b(accion|tarea)\b/.test(text)) {
    return { kind: 'write_request', operation: 'create_action', request: utterance.slice(0, 500) }
  }

  // Fase 2 — Revisión ejecutiva guiada (~15 min), disciplina operativa, inteligencia preventiva y trazabilidad
  if (
    /\b(revision ejecutiva|sesion ejecutiva|revisemos la operacion en 15|hagamos una revision|revision de 15 minutos|preparar (?:mi |la )?reunion de seguimiento|reunion de seguimiento)\b/.test(
      text
    )
  ) {
    return { kind: 'executive_review', action: 'start' }
  }

  if (
    /\b(resume nuestras decisiones|resumen de decisiones|resumen ejecutivo final|resumen final|resumen de la sesion|prepara los compromisos|cerrar revision ejecutiva|cierra la revision)\b/.test(
      text
    )
  ) {
    return { kind: 'executive_review', action: 'summary' }
  }

  if (/^(?:decision|registra(?:r)?\s+(?:esta\s+)?decision|acordamos)\s*[:,-]?\s*(.+)$/i.test(text)) {
    const note = utterance.replace(/^(?:decisi[oó]n|registra(?:r)?\s+(?:esta\s+)?decisi[oó]n|acordamos)\s*[:,-]?\s*/i, '').trim()
    return { kind: 'executive_review', action: 'record_decision', ...(note ? { note: note.slice(0, 300) } : {}) }
  }

  if (
    /\b(siguiente etapa|siguiente punto|avanza(?:r)? (?:a la )?siguiente|continuar revision)\b/.test(text) ||
    (session?.hasExecutiveSession && /^(siguiente|avanza(?:r)?|continuar)$/.test(text))
  ) {
    return { kind: 'executive_review', action: 'next' }
  }

  if (
    /\b(etapa anterior|regresa(?:r)?(?: a la etapa)?|volver(?: a)?(?: la)? etapa|atras en la revision)\b/.test(text) ||
    (session?.hasExecutiveSession && /^(volver|regresar|atras|anterior)$/.test(text))
  ) {
    return { kind: 'executive_review', action: 'previous' }
  }

  if (
    /\b(omitir etapa|saltar etapa|saltar (?:riesgos|prioridades|decisiones|bloqueos)|omitir este punto)\b/.test(text) ||
    (session?.hasExecutiveSession && /^(omitir|saltar)$/.test(text))
  ) {
    return { kind: 'executive_review', action: 'skip' }
  }

  if (
    /\b(disciplina operativa|demasiado tiempo sin seguimiento|tiempo sin seguimiento|sin seguimiento|sin actualizacion reciente|bloqueos prolongados|donde estamos perdiendo disciplina)\b/.test(
      text
    )
  ) {
    const focus = /\b(demasiado tiempo|sin seguimiento|sin actualizacion)\b/.test(text) ? 'stale' : 'overview'
    return { kind: 'executive_discipline', focus }
  }

  if (
    /\b(podemos prevenir|prevenir esta semana|problemas podemos prevenir|inteligencia preventiva|riesgos preventivos|proximos a vencer esta semana|antes de que se conviertan)\b/.test(
      text
    )
  ) {
    return { kind: 'executive_preventive' }
  }

  const looksLikeWriteFollowUp =
    /\b(marca|marcar|marcala|cambia|cambiar|bloquea|bloquear|avisa|avisale|notifica|actualiza|cierra|cerrar|mueve|pon|poner|ponla|comenta|comentario|verifica|verificar|reasigna|asigna|convierte|crea|crear|prepara|preparar|arma|armar)\b/.test(
      text
    )

  if (
    !looksLikeWriteFollowUp &&
    (/\b(sustentan esta recomendacion|acciones que sustentan|respaldan esta recomendacion|ver evidencia|muestrame la evidencia|profundiza(?:r)? en la (prioridad|accion|primera|segunda|tercera)|detalle de (?:la )?(prioridad|primera|segunda|tercera|accion)|detalle de esa (accion|tarea)|cual era la prioridad|abre (?:esa|la) accion|explicame por que|explica por que)\b/.test(
      text
    ) ||
      isFollowUpReference(text, session))
  ) {
    const priorityIndex = priorityIndexFromText(text)
    if (session?.hasExecutiveSession && /\b(profundiza|prioridad|esa accion|ese problema)\b/.test(text) &&
      /\b(revision|etapa|sesion)\b/.test(text) === false &&
      /\b(siguiente etapa|omitir)\b/.test(text) === false &&
      priorityIndex !== undefined) {
      return { kind: 'executive_review', action: 'focus_priority', priorityIndex }
    }
    return { kind: 'executive_evidence', ...(priorityIndex !== undefined ? { priorityIndex } : {}) }
  }

  if (
    /\b(quien(?:es)? tienen? acciones vencidas|quien(?:es)? tienen? (?:tareas|compromisos) vencid[oa]s|quien(?:es)? van? atrasad[oa]s)\b/.test(
      text
    )
  ) {
    return { kind: 'aggregate_execution', groupBy: 'responsable', statusGroup: 'overdue' }
  }

  if (
    /\bcomo vamos con\b/.test(text) &&
    !/\b(okrs?|objetivos?|resultados? clave|krs?|metas?|iniciativas?)\b/.test(text)
  ) {
    return {
      kind: 'query_actions',
      scope: 'team_authorized',
      statusGroup: 'open',
      visual: 'none',
      focusToday: false,
      restrictedRequest: false,
    }
  }

  if (
    /\b(mas urgente|mas critica|mas atrasada|mas vencida)\b/.test(text) &&
    /\b(quien|cual|cuales|el mas|la mas)\b/.test(text)
  ) {
    return { kind: 'who_most_urgent' }
  }

  if (
    /\b(que deberia hacer|que hago( ahora)?|siguiente paso|por donde empiezo|que me recomiendas|que recomiendas|que decisiones deberia tomar|que decisiones tomar|que decision deberia tomar|cual de esos problemas deberia resolver primero|resolver primero|atender primero)\b/.test(
      text
    )
  ) {
    return { kind: 'recommend_next' }
  }

  const request = utterance.slice(0, 500)
  if (
    /\b(ejecuta(?:r)? sql|corre esta consulta|insert into|update acciones_diarias|delete from)\b/.test(text) ||
    (/\b(sql)\b/.test(text) && /\b(ejecuta|correr|lanzar)\b/.test(text))
  ) {
    return { kind: 'unsupported_write', operation: 'sql' }
  }
  if (/\b(taguear|etiquetar|marcar como okr|tag_okr)\b/.test(text) && /\bokr\b/.test(text)) {
    return { kind: 'unsupported_write', operation: 'tag_okr_action' }
  }
  if (
    /\bconvierte\b/.test(text) &&
    /\b(compromisos|decisiones|acuerdos)\b/.test(text) &&
    /\b(acciones|propuestas|accion)\b/.test(text)
  ) {
    return {
      kind: 'write_request',
      operation: 'create_action',
      request,
      batch: /\bdecisiones\b/.test(text) && !/\b(compromisos|acuerdos)\b/.test(text) ? 'decisions' : 'commitments',
    }
  }
  if (/\b(convierte(?:lo|la)?|transforma(?:lo|la)?)\b/.test(text) && /\b(accion|tarea)\b/.test(text)) {
    return { kind: 'write_request', operation: 'create_action', request }
  }
  if (/\b(prepara|preparar|arma|armar)\b/.test(text) && /\b(seguimiento|aviso|recordatorio)\b/.test(text)) {
    return {
      kind: 'write_request',
      operation: 'notify_responsable',
      request,
      canal: /\bwhatsapp\b/.test(text) ? 'whatsapp' : 'email',
    }
  }

  const interpreted = interpretOperationalMessage(utterance, { activeQuery: previous })

  if (interpreted.intent === 'clarify' && interpreted.ambiguity) {
    return { kind: 'clarify', question: interpreted.ambiguity.question }
  }
  const target = /\b(accion|tarea|esa|esta|la)\b/.test(text)
  const naturalBlockerReport =
    /\b(registra(?:r)?|reporta(?:r)?|anota(?:r)?)\s+(?:que\s+)?(?:seguimos|estamos|sigue|esta)\s+bloquead[oa]s?\b/.test(
      text
    )
  if (
    naturalBlockerReport ||
    (target && /\b(bloquea|bloquear|bloqueala|(registra|registrar|reporta|reportar)\s+(un\s+)?bloqueo)\b/.test(text))
  ) {
    const motivo =
      utterance.match(/\b(?:porque|por que|debido a|motivo:?)\s+(.+)$/i)?.[1]?.trim().slice(0, 500) ||
      utterance.match(/\bbloquead[oa]s?\s+(por\s+.+)$/i)?.[1]?.trim().slice(0, 500)
    return { kind: 'write_request', operation: 'register_blocker', request, ...(motivo ? { motivo } : {}) }
  }
  if (
    /\b(avisa|avisale|notifica|notificale|recuerdale|manda|mandale|envia|enviale)\b/.test(text) &&
    /\bresponsables?\b/.test(text)
  ) {
    return {
      kind: 'write_request',
      operation: 'notify_responsable',
      request,
      canal: /\bwhatsapp\b/.test(text) ? 'whatsapp' : 'email',
    }
  }
  if (
    /\b(comenta|comentario|anota(?:r)?)\b/.test(text) &&
    /\b(accion|tarea|esa|esta|la)\b/.test(text)
  ) {
    const contenido = utterance
      .replace(/^.*?\b(?:comentario|comenta(?:r)?|anota(?:r)?)\s*(?:que|:)?\s*/i, '')
      .trim()
      .slice(0, 500)
    return { kind: 'write_request', operation: 'add_comment', request, ...(contenido ? { contenido } : {}) }
  }
  if (
    /\b(verifica|verificar)\b/.test(text) &&
    /\b(accion|tarea|esa|esta)\b/.test(text) &&
    !/\bmarca/.test(text)
  ) {
    return { kind: 'write_request', operation: 'verify_action', request }
  }
  if (target && /\b(marca|marcar|marcala|pon|poner|ponla|cambia|cambiar|mueve|pasa)\b/.test(text)) {
    const estado = /\bverificad[ao]\b/.test(text) ? 'Verificado'
      : /\b(hech[ao]|terminad[ao]|completad[ao]|cerrad[ao])\b/.test(text) ? 'Hecho'
        : /\ben (ejecucion|proceso|curso)\b/.test(text) ? 'En_Ejecucion'
          : /\bpendiente\b/.test(text) ? 'Pendiente'
            : null
    if (estado) return { kind: 'write_request', operation: 'update_status', request, estado }
  }

  if (
    interpreted.intent === 'propose_create_kanban' ||
    (/\b(crea|crear|creame|registra|registrar|agrega|agregar|propon|proponer)\b/.test(text) &&
      /\b(iniciativa|iniciativas)\b/.test(text))
  ) {
    return { kind: 'write_request', operation: 'create_action', request }
  }
  if (
    /\b(asigna(?:sela|selo|la|lo|r)?|reasigna(?:sela|selo|r)?|prioridad|fecha|reprograma(?:r|la)?|responsable)\b/.test(text) &&
    (/\b(accion|tarea|esa|esta)\b/.test(text) ||
      /\b(asignasela|asignaselo|mejor cambia la fecha|cambia la fecha al|reprograma(?:la)? al|responsable correspondiente)\b/.test(text))
  ) {
    return { kind: 'write_request', operation: 'update_action', request }
  }
  if (/\b(marca|marcar|actualiza|actualizar|cambia|cambiar|cierra|cerrar|reprograma|mueve)\b/.test(text) &&
    /\b(accion|tarea|esa|esta)\b/.test(text)) {
    return { kind: 'write_request', operation: 'update_action', request }
  }

  if (!OPERATIONAL_TERMS.test(text)) return { kind: 'unknown' }

  const groupBy = /\bpor (area|areas|departamento)s?\b/.test(text)
    ? 'area'
    : /\bpor (responsable|persona|colaborador)(es|s)?\b/.test(text)
      ? 'responsable'
      : /\bpor estado(s)?\b/.test(text)
        ? 'estado'
        : null
  if (groupBy && /\b(accion(es)?|tareas?|vencid[ao]s?|atrasad[ao]s?|bloquead[ao]s?|bloqueos?|pendientes?|abiertas?|ejecucion)\b/.test(text)) {
    return {
      kind: 'aggregate_execution',
      groupBy,
      statusGroup: /\b(vencid|atrasad|retraso)/.test(text) ? 'overdue' : /\bbloque/.test(text) ? 'blocked' : 'open',
    }
  }

  if (interpreted.intent === 'query' && interpreted.module === 'okrs') {
    return {
      kind: 'query_okrs',
      period: /\b(trimestre|trimestral|q[1-4])\b/.test(text) ? 'current_quarter' : 'all_active',
    }
  }

  const boardActionsCount = interpreted.module === 'org' && /\b(accion(es)?|tareas?)\b/.test(text)
  if (interpreted.intent !== 'query' || (interpreted.module !== 'kanban' && !boardActionsCount)) {
    return { kind: 'unknown' }
  }

  const filters = boardActionsCount ? { scope: 'board_authorized' as const } : interpreted.filters ?? {}
  const restrictedRequest = /\b(otro equipo|otra area|otros equipos|privad[ao]s?|ajen[ao]s?|de los demas)\b/.test(text)
  let scope: ActionQueryScope = filters.scope ?? previous?.scope ?? 'assigned_to_me'
  if (restrictedRequest) scope = 'team_authorized'
  const personHint = restrictedRequest
    ? undefined
    : extractPersonHint(text) ?? (interpreted.identity.kind === 'named' ? interpreted.identity.hint : undefined)
  if (personHint) scope = 'board_authorized'

  return {
    kind: 'query_actions',
    scope,
    statusGroup: filters.status_group ?? 'open',
    visual: filters.visual ?? 'none',
    focusToday: /\bhoy\b/.test(text),
    limit: filters.limit,
    personHint,
    restrictedRequest,
  }
}
