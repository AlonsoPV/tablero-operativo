/**
 * Intención del turno (CV-01). Reglas deterministas primero; si el mensaje no es
 * una consulta operativa reconocible devuelve 'unknown' y el canal usa su LLM.
 */
import { interpretOperationalMessage } from '../operationalInterpret.js'
import { isCompoundInstruction, normalizeColloquialTypos } from './multiIntent.js'
import { extractResponsablePatch, isStructuredFollowUpUtterance } from './structuredActionDraft.js'
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
      entityHint?: 'acciones' | 'proyectos'
    }
  | { kind: 'query_okrs'; period: 'current_quarter' | 'all_active'; scope?: 'personal' | 'organization' }
  | {
      kind: 'query_initiatives'
      scope: 'personal' | 'team' | 'organization'
      activeOnly: boolean
      askOwner?: boolean
    }
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
      scope?: 'personal' | 'team' | 'organization'
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
  | { kind: 'inspect_referenced_action'; aspect: 'owner' | 'status' | 'summary' }
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
        | 'compound'
      request: string
      isFollowUp?: boolean
      estado?: 'Pendiente' | 'En_Ejecucion' | 'Hecho' | 'Verificado'
      motivo?: string
      canal?: 'email' | 'whatsapp'
      recipientHint?: string
      draftOnly?: boolean
      contextualComm?: boolean
      contenido?: string
      batch?: 'commitments' | 'decisions'
    }
  | { kind: 'communication_action'; action: 'edit' | 'confirm' | 'cancel'; utterance: string }
  | { kind: 'review_pending'; target: 'action' | 'communication' | 'unspecified'; recipientHint?: string }
  | { kind: 'edit_pending_date'; request: string }
  | { kind: 'cancel_write_draft' }
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
  pendingWrite?: { operation: string; request: string } | null
  hasPendingCommunication?: boolean
  pendingFocus?: 'action' | 'communication' | null
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
  const cleanedUtterance = normalizeColloquialTypos(utterance)
  const text = normalize(cleanedUtterance)
  if (!text) return { kind: 'unknown' }

  // A new, explicitly channelled communication is independent of older drafts.
  const freshCommunication = text.match(/^(?:prepara(?:r)?|redacta(?:r)?|arma(?:r)?|envia(?:r)?|manda(?:r)?)\s+(?:un\s+)?(whatsapp|correo|mail|email)\b/)
  if (freshCommunication) {
    return {kind:'write_request', operation:'notify_responsable', request:utterance,
      canal:freshCommunication[1] === 'whatsapp' ? 'whatsapp' : 'email', contextualComm:true,
      ...(/^(?:prepara|redacta|arma)/.test(text) ? {draftOnly:true} : {})}
  }

  // Resolve explicit draft navigation before recipient edits or executive navigation.
  const hasDraft = Boolean(session?.pendingWrite || session?.hasPendingCommunication)
  const draftReference = /\b(borrador|propuesta|mensaje|correo|whatsapp|accion)\b/.test(text)
  const reviewReference = /\b(muestra(?:me)?|revisa|retoma|regresa(?:r)?|vuelve|volvamos|volver|recupera)\b/.test(text)
  const explicitRecord = /\bemx_\d+\b|[0-9a-f]{8}-[0-9a-f]{4}-|https?:\/\//i.test(text)
  const historicReference = /\b(borrador|propuesta|preparamos|preparado|anterior)\b/.test(text)
  const briefStateQuestion =
    /^¿?como (?:quedo|queda)(?:\s+(?:la\s+accion|el\s+borrador|la\s+propuesta|el\s+mensaje|eso|todo))?[?.!]*$/.test(text)
  if (!explicitRecord && ((draftReference && reviewReference && (hasDraft || historicReference)) || (briefStateQuestion && hasDraft))) {
    const target = /\b(mensaje|correo|whatsapp)\b/.test(text) ? 'communication'
      : /\baccion\b/.test(text) ? 'action' : 'unspecified'
    const recipientHint = target === 'communication' ? extractResponsablePatch(cleanedUtterance).hint : null
    return {kind:'review_pending',target,...(recipientHint ? {recipientHint} : {})}
  }
  if (session?.pendingWrite && /\b(cambia(?:r)?|ajusta(?:r)?|modifica(?:r)?|reprograma(?:r)?)\b/.test(text) && /\bfecha\b/.test(text) &&
    (session.pendingFocus === 'action' || /\baccion\b/.test(text) || !session.hasPendingCommunication)) {
    return {kind:'edit_pending_date',request:cleanedUtterance}
  }

  if (session?.hasPendingCommunication) {
    if (/^(?:cancelar?|no lo envies|descarta(?:r)?|olvida(?:lo)?)\b/.test(text)) {
      return { kind: 'communication_action', action: 'cancel', utterance: cleanedUtterance }
    }
    if (/^(?:confirma(?:r)?(?:\s+envio(?:\s+grupal)?)?|confirmo|envialo|mandalo)$/.test(text)) {
      return { kind: 'communication_action', action: 'confirm', utterance: cleanedUtterance }
    }
    if (/^(?:si|ok|dale|va|confirma(?:r)?\s+(?:la\s+)?propuesta|confirma(?:r)?\s+(?:el\s+)?borrador)$/.test(text)) {
      if (session.pendingWrite) {
        return {
          kind: 'clarify',
          question:
            'Tienes más de una operación pendiente. Especifica si deseas «Confirmar envío» o confirmar la acción del tablero.',
        }
      }
      return { kind: 'communication_action', action: 'confirm', utterance: cleanedUtterance }
    }
    const personEdit = extractResponsablePatch(cleanedUtterance).hint
    const channelEdit = /^(?:mejor\s+)?(?:por\s+)?(?:correo|mail|email|whatsapp)\b/.test(text)
    const explicitEdit = /^(?:edita(?:r|la|lo)?|cambia(?:r|la|lo)?|pasa(?:r|la|lo)?|ajusta(?:r|la|lo)?|agregale|anadele|sumale|ponle que)\b/.test(text)
    const independentRequest = /[?¿]/.test(utterance) || /^(?:crea|crear|registra|genera|consulta|muestra|lista|busca|revisa|que|como|cuant[oa]s?|cual|quien|donde|cuando)\b/.test(text)
    if (!independentRequest && (personEdit || channelEdit || explicitEdit)) {
      if (session.pendingWrite && personEdit && !/\b(mensaje|correo|whatsapp|destinatario)\b/.test(text)) {
        return { kind: 'clarify', question: '¿Quieres cambiar el responsable de la acción o el destinatario del mensaje?' }
      }
      return { kind: 'communication_action', action: 'edit', utterance: cleanedUtterance }
    }
  }

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
    /\b(que (?:requiere|necesita)(?: mi)? atencion(?:\s+(?:inmediata|urgente|hoy))?|principales problemas|3 principales|tres principales|top 3|prioridades ejecutivas|que deberia priorizar hoy|que priorizar hoy|(?:que )?(?:acciones )?deberia priorizar(?: esta semana| hoy)?|que priorizar esta semana)\b/.test(
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
    /\b(compromisos pendientes|acuerdos pendientes|compromisos por responsable|pendientes de verificacion|pendientes de verificado|en hecho pendientes|situaciones sin actualizacion|compromisos? (?:que )?no se estan cumpliendo|compromisos? incumplidos?|compromisos? de (?:nuestra|la) ultima reunion|acuerdos? de (?:nuestra|la) ultima reunion|que acordamos en (?:la|nuestra) ultima reunion|mis compromisos?|que compromisos? tengo)\b/.test(
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
    const personalCommitments = /\b(mis compromisos?|que compromisos? tengo|compromisos? (?:que )?tengo|tengo pendientes)\b/.test(text)
    const teamCommitments = /\b(equipo|empresa|organizacion|corporativ[ao]s?|por responsable)\b/.test(text)
    return {
      kind: 'executive_commitments',
      filter,
      ...(personalCommitments && !teamCommitments ? { scope: 'personal' as const } : {}),
    }
  }

  const looksLikeWriteVerb =
    /\b(crea|crear|creame|registra|registrar|agrega|agregar|anota|anotar|actualiza|actualizar|cambia|cambiar|elimina|eliminar|borra|borrar|edita|editar|convierte|convertir|prepara|preparar)\b/.test(
      text
    )
  if (!looksLikeWriteVerb && /\biniciativas?\b/.test(text)) {
    const askOwner = /\b(quien es (?:el )?responsable|responsable de esta iniciativa|de quien es esta iniciativa)\b/.test(text)
    const personalInit = /\b(mis|tengo|asignad[ao]s? a mi|a mi cargo|mias?)\b/.test(text)
    const orgInit = /\b(empresa|organizacion|corporativ[ao]s?|compania|todas? las iniciativas|generales)\b/.test(text)
    const teamInit = /\b(equipo|mi equipo|area|departamento)\b/.test(text)
    const scope: 'personal' | 'team' | 'organization' = orgInit
      ? 'organization'
      : teamInit && !personalInit
        ? 'team'
        : personalInit
          ? 'personal'
          : 'organization'
    const activeOnly = !/\b(todas?|cerrad[ao]s?|completad[ao]s?|historicas?)\b/.test(text) && !askOwner
    return { kind: 'query_initiatives', scope, activeOnly, ...(askOwner ? { askOwner: true } : {}) }
  }
  if (
    !looksLikeWriteVerb &&
    /\b(avances estrategicos|avance estrategico|revisar avances estrategicos|resultados de los okrs?|objetivos estrategicos requieren atencion|objetivos estrategicos|que objetivos requieren atencion|objetivos corporativos|mis objetivos?|cuales son mis objetivos?|que objetivos? tengo|mis okrs?)\b/.test(
      text
    )
  ) {
    const personalOkr = /\b(mis objetivos?|que objetivos? tengo|mis okrs?|objetivos? asignados? a mi)\b/.test(text)
    const orgOkr = /\b(corporativ[ao]s?|empresa|organizacion|estrategicos?)\b/.test(text)
    return {
      kind: 'query_okrs',
      period: /\b(trimestre|trimestral|q[1-4])\b/.test(text) ? 'current_quarter' : 'all_active',
      scope: personalOkr && !orgOkr ? 'personal' : 'organization',
    }
  }

  if (
    !looksLikeWriteVerb &&
    (session?.lastEntityKind === 'action' || (session?.lastActionCount ?? 0) === 1) &&
    !/\biniciativas?\b/.test(text)
  ) {
    if (
      /\b(quien es (?:el |la )?responsable|de quien es|quien la tiene|quien trae (?:esta|esa) accion|a quien esta asignad[ao])\b/.test(
        text
      )
    ) {
      return { kind: 'inspect_referenced_action', aspect: 'owner' }
    }
    if (
      /\b(cual es su situacion|como va (?:esta|esa) accion|como esta (?:esta|esa) accion|cual es su estado|que estatus tiene|en que estado esta|cual es su avance|que situacion tiene)\b/.test(
        text
      )
    ) {
      return { kind: 'inspect_referenced_action', aspect: 'status' }
    }
    if (/\b(resume (?:esta|esa) accion|de que trata (?:esta|esa) accion|resumen de (?:esta|esa) accion)\b/.test(text)) {
      return { kind: 'inspect_referenced_action', aspect: 'summary' }
    }
  }

  if (/\b(prepara|preparar|genera|generar|arma|armar)\b/.test(text) && /\bborrador\b/.test(text) && /\b(accion|tarea)\b/.test(text)) {
    return { kind: 'write_request', operation: 'create_action', request: utterance.slice(0, 500) }
  }

  // Fase 2 — Revisión ejecutiva guiada (~15 min), disciplina operativa, inteligencia preventiva y trazabilidad
  if (
    /\b(revision ejecutiva|sesion ejecutiva|revisemos la operacion en 15|hagamos una revision|revision de 15 minutos|preparar (?:mi |la )?reunion de seguimiento|reunion de seguimiento|llegar preparado a la reunion|prepararme para la reunion)\b/.test(
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
    /\b(disciplina operativa|demasiado tiempo sin seguimiento|tiempo sin seguimiento|sin seguimiento|sin actualizacion reciente|bloqueos prolongados|donde estamos perdiendo disciplina|ya lleva demasiado tiempo detenido|lleva mucho tiempo detenido|demasiado tiempo detenido)\b/.test(
      text
    )
  ) {
    const focus = /\b(demasiado tiempo|sin seguimiento|sin actualizacion|detenido)\b/.test(text) ? 'stale' : 'overview'
    return { kind: 'executive_discipline', focus }
  }

  if (
    /\b(podemos prevenir|prevenir esta semana|problemas podemos prevenir|inteligencia preventiva|riesgos preventivos|proximos a vencer esta semana|antes de que se conviertan|que no se nos vuelva a pasar|cerrar los pendientes de esta semana)\b/.test(
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
    /\b(que deberia hacer|que hago( ahora)?|siguiente paso|por donde empiezo|que me recomiendas|que recomiendas|que decisiones deberia tomar|que decisiones tomar|que decision deberia tomar|cual de esos problemas deberia resolver primero|resolver primero|atender primero|necesito que esto avance|quiero que el equipo se ponga al corriente|equipo se ponga al corriente)\b/.test(
      text
    )
  ) {
    return { kind: 'recommend_next' }
  }

  const request = cleanedUtterance.slice(0, 500)
  if (
    /\b(ejecuta(?:r)? sql|corre esta consulta|insert into|update acciones_diarias|delete from)\b/.test(text) ||
    (/\b(sql)\b/.test(text) && /\b(ejecuta|correr|lanzar)\b/.test(text))
  ) {
    return { kind: 'unsupported_write', operation: 'sql' }
  }
  if (/\b(taguear|etiquetar|marcar como okr|tag_okr)\b/.test(text) && /\bokr\b/.test(text)) {
    return { kind: 'unsupported_write', operation: 'tag_okr_action' }
  }

  // Cancelación explícita de borrador activo antes de evaluar nuevas escrituras
  if (
    session?.pendingWrite &&
    /^(cancela|cancelar|olvida|olvidalo|ya no|descarta|descartar|dejalo|dejalo asi|no la crees|no crees nada)\b/.test(text)
  ) {
    return { kind: 'cancel_write_draft' }
  }

  // Instrucciones múltiples / encadenadas (incluye "Y mándale un WhatsApp" sobre borrador activo)
  const hasPendingCreate = session?.pendingWrite?.operation === 'create_action'
  if (!/[?¿]/.test(cleanedUtterance) && isCompoundInstruction(cleanedUtterance, hasPendingCreate)) {
    return {
      kind: 'write_request',
      operation: 'compound',
      request,
      isFollowUp: hasPendingCreate,
    }
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
  if (/\b(prepara|preparar|arma|armar|redacta|redactar)\b/.test(text) && /\b(mensaje|correo|whatsapp)\b/.test(text)) {
    return {
      kind: 'write_request',
      operation: 'notify_responsable',
      request,
      canal: /\b(correo|mail|email)\b/.test(text) ? 'email' : 'whatsapp',
      draftOnly: true,
      contextualComm: true,
    }
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
  const hasActiveActionRef = session?.lastEntityKind === 'action' || (session?.lastActionCount ?? 0) === 1
  const naturalBlockerReport =
    /\b(registra(?:r)?|reporta(?:r)?|anota(?:r)?)\s+(?:que\s+)?(?:seguimos|estamos|sigue|esta)\s+bloquead[oa]s?\b/.test(
      text
    )
  if (
    naturalBlockerReport ||
    /^(?:registra(?:r)?|reporta(?:r)?|agrega(?:r)?)\s+(?:un\s+)?bloqueo\b/.test(text) ||
    ((target || hasActiveActionRef) &&
      /\b(bloquea|bloquear|bloqueala|(registra|registrar|reporta|reportar)\s+(un\s+)?bloqueo)\b/.test(text))
  ) {
    const motivo =
      utterance.match(/\b(?:porque|por que|debido a|motivo:?)\s+(.+)$/i)?.[1]?.trim().slice(0, 500) ||
      utterance.match(/\bbloqueo\s*[:,-]\s*(.+)$/i)?.[1]?.trim().slice(0, 500) ||
      utterance.match(/\bbloquead[oa]s?\s+(por\s+.+)$/i)?.[1]?.trim().slice(0, 500)
    return { kind: 'write_request', operation: 'register_blocker', request, ...(motivo ? { motivo } : {}) }
  }
  const isFlexibleCommIntent =
    /\b(pon(?:er)?\s+a\s+[a-z]{2,}\s+al\s+tanto)\b/.test(text) ||
    /\b(mandales|enviales|avisales|recuerdales|notificales)\b/.test(text) ||
    (/\b(avisa|avisale|notifica|notificale|recuerdale|manda|mandale|mandame|envia|enviale|enviame|preguntale|pidele|dile|redacta|comparte|pasale)\b/.test(text) &&
      (/\b(responsables?|whatsapp|correo|mail|email|direccion|resumen semanal|compromisos?|fecha de compromiso|como va|lo que tiene|lo que vence|pendientes?|vencimientos?|vencid[oa]s?|bloqueos?|atrasad[oa]s?|prioridades?|indicadores?|su dia|dia de hoy|jornada|necesito el reporte|ya quedo|ya le asigne|de los cambios|acabamos de revisar|necesita resolver|ponga al corriente|avance de su equipo|reunion empieza)\b/.test(text) ||
        /\b(manda(?:le|me)?|envia(?:le|me)?)\s+(?:un\s+)?(?:whatsapp|correo|mail)\b/.test(text) ||
        /\b(?:dile|avisale|comentale|pidele)\s+(?:a\s+[a-z]{2,}\s+)?que\s+\S+/.test(text)))

  if (isFlexibleCommIntent) {
    const isEmail = /\b(correo|mail|email|resumen semanal)\b/.test(text)
    const isWhatsApp = /\bwhatsapp\b/.test(text)
    const draftOnly =
      /\b(redacta|redactar|prepara|preparar)\b/.test(text) &&
      !/\b(envia|enviale|enviame|enviales|manda|mandale|mandame|mandales|comparte|dile|avisale|recuerdale|preguntale|pasale|pon\s+a)\b/.test(text)
    const isLegacyActionNotify =
      /\b(avisa|notifica)\b/.test(text) &&
      /\b(al responsable|responsable)\b/.test(text) &&
      !/\b(responsables|todos|cada responsable|su dia|pendientes|vencimientos|bloqueos)\b/.test(text)
    const recMatch =
      cleanedUtterance.match(/\b(?:pon|poner)\s+a\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+)?)\s+al\s+tanto\b/i) ??
      cleanedUtterance.match(/\b(?:a|con)\s+(Direcci[oó]n|[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+)?)\b/) ??
      cleanedUtterance.match(/\b(?:dile|av[ií]sale|preg[uú]ntale|recu[eé]rdale|p[ií]dele|p[aá]sale|env[ií]ale|m[aá]ndale)\s+a\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\b/i)
    const recipientHint =
      recMatch?.[1] && !/^(los|las|el|la|un|una|mi|mis|este|esta|todos|todas|responsables)$/i.test(normalize(recMatch[1]))
        ? recMatch[1].trim()
        : undefined
    return {
      kind: 'write_request',
      operation: 'notify_responsable',
      request,
      canal: isWhatsApp ? 'whatsapp' : isEmail ? 'email' : /\b(preguntale|recuerdale|avisale|dile|pidele|pasale|mandale|enviale|mandales|enviales|pon\s+a)\b/.test(text) ? 'whatsapp' : 'email',
      ...(recipientHint ? { recipientHint } : {}),
      ...(draftOnly ? { draftOnly: true } : {}),
      ...(!isLegacyActionNotify ? { contextualComm: true } : {}),
    }
  }
  if (
    /^(?:agrega|anade|pon|deja)\s+(?:un\s+)?comentario\b/.test(text) ||
    (/\b(comenta|comentario|anota(?:r)?)\b/.test(text) && (/\b(accion|tarea|esa|esta|la)\b/.test(text) || hasActiveActionRef)) ||
    /^(?:agrega|anade|pon)\s+que\s+/.test(text)
  ) {
    const contenido = cleanedUtterance
      .replace(/^.*?\b(?:comentario|comenta(?:r)?|anota(?:r)?)\s*(?:que|:)?\s*/i, '')
      .replace(/^(?:agrega|a[ñn]ade|pon)\s+que\s+/i, '')
      .trim()
      .slice(0, 500)
    return { kind: 'write_request', operation: 'add_comment', request, ...(contenido ? { contenido } : {}) }
  }
  if (
    /\b(verifica|verificar)\b/.test(text) &&
    (/\b(accion|tarea|esa|esta)\b/.test(text) || hasActiveActionRef) &&
    !/\bmarca/.test(text)
  ) {
    return { kind: 'write_request', operation: 'verify_action', request }
  }
  if (
    (target || hasActiveActionRef || /\blo del\b|\beso\b/.test(text)) &&
    (/\b(marca|marcar|marcala|pon|poner|ponla|cambia|cambiar|mueve|pasa)\b/.test(text) || /\beso ya quedo\b/.test(text))
  ) {
    const estado = /\bverificad[ao]\b/.test(text) ? 'Verificado'
      : /\b(hech[ao]|terminad[ao]|completad[ao]|cerrad[ao]|ya quedo)\b/.test(text) ? 'Hecho'
        : /\ben (ejecucion|proceso|curso)\b/.test(text) ? 'En_Ejecucion'
          : /\bpendiente\b/.test(text) ? 'Pendiente'
            : null
    if (estado) return { kind: 'write_request', operation: 'update_status', request, estado }
  }

  const colloquialCreate =
    /\b(ponle (?:una (?:tarea|accion)|a [a-z]{2,})|dejale un pendiente|encargale\b|que se encargue [a-z]{2,}|apuntalo para|hay que (?:revisar|hacer|preparar|validar|enviar|ver|cerrar)|agregalo al kanban|que no se nos olvide)\b/.test(
      text
    )
  if (
    interpreted.intent === 'propose_create_kanban' ||
    colloquialCreate ||
    (/\b(crea|crear|creame|registra|registrar|agrega|agregar|propon|proponer)\b/.test(text) &&
      /\b(iniciativa|iniciativas|accion|tarea|pendiente)\b/.test(text))
  ) {
    return { kind: 'write_request', operation: 'create_action', request }
  }
  if (
    session?.pendingWrite?.operation === 'create_action' &&
    !/[?¿]/.test(cleanedUtterance) &&
    isStructuredFollowUpUtterance(cleanedUtterance)
  ) {
    return {
      kind: 'write_request',
      operation: 'create_action',
      request: cleanedUtterance.trim().slice(0, 500),
      isFollowUp: true,
    }
  }
  if (
    /\b(asigna(?:sela|selo|la|lo|r)?|reasigna(?:sela|selo|r)?|prioridad|fecha|reprograma(?:r|la)?|responsable|pasalo|pasala)\b/.test(text) &&
    (/\b(accion|tarea|esa|esta|lo de)\b/.test(text) ||
      (hasActiveActionRef &&
        /\b(cambia(?:r|la|lo)?|actualiza(?:r|la|lo)?|reprograma(?:r|la|lo)?|reasigna(?:r|la|lo)?|asigna(?:r|la|lo)?|pon(?:er|le|la)?|mueve|pasa(?:la|lo)?)\b/.test(
          text
        )) ||
      /\b(asignasela|asignaselo|mejor cambia la fecha|cambia la fecha al|reprograma(?:la)? al|responsable correspondiente|pasalo al|pasala al)\b/.test(text))
  ) {
    return { kind: 'write_request', operation: 'update_action', request }
  }
  if (/\b(marca|marcar|actualiza|actualizar|cambia|cambiar|cierra|cerrar|reprograma|mueve)\b/.test(text) &&
    /\b(accion|tarea|esa|esta)\b/.test(text)) {
    return { kind: 'write_request', operation: 'update_action', request }
  }

  if (!looksLikeWriteVerb) {
    const personAgenda = text.match(
      /\bque\s+(?:tiene|tienen)\s+([a-z][a-z0-9._-]{1,30})\s+(?:para\s+)?(hoy|manana|esta\s+semana|pendiente|abierto|vencido)\b/
    )
    if (
      personAgenda?.[1] &&
      !/^(el|la|los|las|un|una|mi|mis|tu|su|sus|este|esta|esto|ese|esa|que|quien|alguien|nadie)$/.test(personAgenda[1])
    ) {
      return {
        kind: 'query_actions',
        scope: 'board_authorized',
        statusGroup: /\bvencid/.test(text) ? 'overdue' : 'open',
        visual: 'none',
        focusToday: /\bhoy\b/.test(text),
        personHint: personAgenda[1],
        restrictedRequest: false,
      }
    }
    if (/\bque\s+tengo\s+(?:para\s+)?(hoy|manana|esta\s+semana)\b/.test(text)) {
      return {
        kind: 'query_actions',
        scope: 'assigned_to_me',
        statusGroup: 'open',
        visual: 'none',
        focusToday: /\bhoy\b/.test(text),
        restrictedRequest: false,
      }
    }
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

  if (
    !looksLikeWriteVerb &&
    /\b(que proyectos? tengo|mis proyectos?|proyectos? (?:que )?tengo asignados?|proyectos? asignados? a mi)\b/.test(text)
  ) {
    return {
      kind: 'query_actions',
      scope: 'assigned_to_me',
      statusGroup: 'open',
      visual: 'none',
      focusToday: false,
      restrictedRequest: false,
      entityHint: 'proyectos',
    }
  }

  if (interpreted.intent === 'query' && interpreted.module === 'okrs') {
    const personalOkr = /\b(mis objetivos?|que objetivos? tengo|mis okrs?|objetivos? asignados? a mi|cuantos objetivos? tengo)\b/.test(text)
    const orgOkr = /\b(corporativ[ao]s?|empresa|organizacion|estrategicos?)\b/.test(text)
    return {
      kind: 'query_okrs',
      period: /\b(trimestre|trimestral|q[1-4])\b/.test(text) ? 'current_quarter' : 'all_active',
      scope: personalOkr && !orgOkr ? 'personal' : 'organization',
    }
  }

  const boardActionsCount = interpreted.module === 'org' && /\b(accion(es)?|tareas?)\b/.test(text)
  const hasExplicitQuerySignal =
    /[?¿]/.test(utterance) ||
    /^(que|cual|cuales|cuantas|cuantos|quien|quienes|como|donde|cuando|muestrame|muestra|dame|lista|listar|ver|revisa|revisar|revisemos|resumen|resume|explica|explicame|profundiza|abre|hola|buenos|buenas|gracias|ayuda|cancela|cancelar|olvida|olvidalo|ya no|mejor)\b/.test(
      text
    ) ||
    /\b(okrs?|iniciativas?|objetivos?|resultados? clave|pendientes?|vencid[ao]s?|bloquead[ao]s?|bloqueos?|acciones abiertas|resumen ejecutivo|prioridades)\b/.test(
      text
    )
  if (
    session?.pendingWrite &&
    /^(cancela|cancelar|olvida|olvidalo|ya no|descarta|descartar|dejalo|dejalo asi|no la crees|no crees nada)\b/.test(text)
  ) {
    return { kind: 'cancel_write_draft' }
  }

  if (
    session?.pendingWrite?.operation === 'create_action' &&
    !hasExplicitQuerySignal &&
    !/^(crea|crear|creame|genera|generar|nueva accion|otra accion)\b/.test(text) &&
    text.length >= 2 &&
    text.length <= 240
  ) {
    return {
      kind: 'write_request',
      operation: 'create_action',
      request: utterance.trim().slice(0, 500),
      isFollowUp: true,
    }
  }
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
