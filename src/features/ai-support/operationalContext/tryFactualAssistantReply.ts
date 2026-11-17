import {
  actionRecordLink,
  formatStructuredReplyContent,
  type AssistantStructuredReply,
} from '@/features/ai-support/assistantBriefing'
import {
  buildAssistantUiFromSnapshot,
  extractPersonNameQuery,
  isAssignedByMeRequest,
  isAssignedToMeRequest,
  isBoardScopeRequest,
  isBriefCountRequest,
  isCreatedByMeRequest,
  isListRequest,
  resolveFollowUpScope,
} from '@/features/ai-support/chatViews'
import type { AssistantUiPayload } from '@/features/ai-support/chatViews/types'
import type { AssistantIntent, OperationalActionItem, OperationalSnapshot } from './types'

function listTitles(
  items: Array<{ titulo: string; estado?: string; fecha?: string }>,
  max = 5
): string {
  if (items.length === 0) return ''
  return items
    .slice(0, max)
    .map((item) => {
      const meta = [item.estado, item.fecha].filter(Boolean).join(' · ')
      return meta ? `${item.titulo} (${meta})` : item.titulo
    })
    .join('; ')
}

function isSimpleCountQuestion(text: string) {
  const t = text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
  return (
    /^(cuantas?|cuantos?|que tengo pendiente|que tengo|mis pendientes|resumen( de mi (dia|tablero))?|como estoy|estado de mis acciones)\b/.test(
      t
    ) ||
    (/pendiente/.test(t) && t.length < 60 && !/recomiend|prioriz|estrateg|analiz/.test(t)) ||
    /pendiente de verificacion/.test(t) ||
    /acciones bloqueadas/.test(t) ||
    (/\ben rojo\b|rojas?\b/.test(t) && t.length < 80 && !/recomiend|analiz|estrateg/.test(t)) ||
    isBoardScopeRequest(text)
  )
}

function pack(
  structured: AssistantStructuredReply,
  ui: AssistantUiPayload
) {
  return {
    content: formatStructuredReplyContent(structured),
    structured,
    ui,
  }
}

function withUi(
  message: string,
  snapshot: OperationalSnapshot,
  intent: AssistantIntent,
  structured: AssistantStructuredReply,
  priorUserMessages?: string[]
) {
  const ui = buildAssistantUiFromSnapshot({
    message,
    snapshot,
    intent,
    finding: structured.finding,
    recommendation: structured.recommendation,
    nextAction: structured.nextAction,
    priorUserMessages,
  })
  return pack(structured, ui)
}

function filterByPerson(items: OperationalActionItem[], personQuery: string) {
  const needle = personQuery
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
  return items.filter((item) => {
    const name = (item.responsableNombre || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-MX')
    if (!name) return false
    return name === needle || name.startsWith(needle) || name.split(/\s+/).includes(needle)
  })
}

/**
 * Resuelve consultas factuales con datos del snapshot, sin llamar a Gemini.
 * Devuelve null cuando hace falta interpretacion o recomendacion.
 */
export function tryFactualAssistantReply(
  message: string,
  snapshot: OperationalSnapshot,
  intent: AssistantIntent,
  options: { priorUserMessages?: string[] } = {}
): { content: string; structured: AssistantStructuredReply; ui: AssistantUiPayload } | null {
  if (intent === 'selected_action' || intent === 'selected_okr') return null

  const listAsk = isListRequest(message)
  const briefAsk = isBriefCountRequest(message) || isSimpleCountQuestion(message)
  const priorUserMessages = options.priorUserMessages
  const followUp = resolveFollowUpScope(message, priorUserMessages)
  const personQuery = extractPersonNameQuery(message) || followUp?.person || null
  const wantBoard =
    isBoardScopeRequest(message) || followUp?.scope === 'board'
  const wantCreated =
    isCreatedByMeRequest(message) ||
    isAssignedByMeRequest(message) ||
    followUp?.scope === 'created'

  if (intent === 'prioritize' && !briefAsk && !listAsk && !personQuery && !wantCreated) return null
  // Las consultas OKR se resuelven siempre con el snapshot (lista estructurada).
  if (
    intent === 'general' &&
    !briefAsk &&
    !listAsk &&
    !personQuery &&
    !wantCreated &&
    !wantBoard &&
    !followUp
  ) {
    return null
  }
  if (intent === 'team_delay' && !briefAsk && !listAsk && message.trim().length > 90) {
    return null
  }

  const c = snapshot.counts
  const fetchedLabel = snapshot.fetchedAt
    ? `Consulta ${snapshot.fetchedAt.replace('T', ' ').slice(0, 19)} UTC`
    : 'Consulta reciente'

  const normalized = message
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')

  if (personQuery) {
    if (!snapshot.viewer.canSeeTeam) {
      return withUi(
        message,
        snapshot,
        intent,
        {
          finding: 'Tu perfil no puede consultar acciones de otras personas.',
          evidence: 'Solo veo acciones donde eres responsable o creador.',
          nextAction: 'Preguntar por tus pendientes o las que tu asignaste.',
        },
        priorUserMessages
      )
    }
    const pool = snapshot.boardOpenItems
    const matched = filterByPerson(pool, personQuery)
    const top = matched[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding:
          matched.length > 0
            ? `${personQuery} tiene ${matched.length} accion(es) abierta(s) en el tablero (muestra).`
            : `No encontre acciones abiertas de "${personQuery}" en la muestra del tablero.`,
        evidence: top
          ? `${listTitles(matched, Math.min(10, matched.length))}. ${fetchedLabel}.`
          : `${fetchedLabel}. Prueba el nombre completo o revisa el kanban.`,
        recommendation: top
          ? `Revisa primero "${top.titulo}" (${top.estado}, ${top.fecha}).`
          : undefined,
        nextAction: top ? `Abrir "${top.titulo}".` : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }

  if (wantBoard) {
    if (!snapshot.viewer.canSeeTeam) {
      return withUi(
        message,
        snapshot,
        intent,
        {
          finding: 'Tu perfil no tiene vista de tablero completo.',
          evidence: `En tu alcance personal hay ${c.open} abiertas.`,
          nextAction: 'Preguntar: Que tengo pendiente?',
        },
        priorUserMessages
      )
    }
    const items = snapshot.boardOpenItems
    const top = items[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding: `En el tablero hay ${c.boardOpen} acciones abiertas.`,
        evidence: top
          ? `${listTitles(items, Math.min(10, items.length))}. ${fetchedLabel}. Alcance: tablero completo.`
          : fetchedLabel,
        recommendation: listAsk
          ? undefined
          : top
            ? `Si quieres el detalle, pide: Enlistalas.`
            : undefined,
        nextAction: top
          ? listAsk
            ? `Abrir "${top.titulo}".`
            : 'Pedir: Enlistalas.'
          : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }

  if (/verificacion/.test(normalized)) {
    const top = snapshot.pendingVerification[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding:
          c.pendingVerification > 0
            ? `Tienes ${c.pendingVerification} accion(es) en Hecho pendientes de verificacion.`
            : 'No tienes acciones en Hecho pendientes de verificacion en tu alcance.',
        evidence: top
          ? `${listTitles(snapshot.pendingVerification, 4)}. ${fetchedLabel}.`
          : fetchedLabel,
        recommendation:
          c.pendingVerification > 0
            ? 'Revisa evidencia y checklist antes de marcar Verificado.'
            : undefined,
        nextAction: top ? `Abrir "${top.titulo}" en el kanban.` : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }

  if (/bloquead/.test(normalized) && !wantCreated) {
    const blocked = snapshot.mine.filter((item) => item.estado === 'Bloqueado')
    const top = blocked[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding:
          blocked.length > 0
            ? `Tienes ${blocked.length} accion(es) bloqueada(s) en tu alcance.`
            : 'No hay acciones bloqueadas en tu alcance actual.',
        evidence: top ? `${listTitles(blocked, 4)}. ${fetchedLabel}.` : fetchedLabel,
        recommendation: top
          ? `Atiende primero "${top.titulo}" e identifica al responsable del desbloqueo.`
          : undefined,
        nextAction: top ? `Abrir "${top.titulo}" y definir siguiente movimiento.` : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }

  if (/\ben rojo\b|rojas?\b/.test(normalized) && !wantCreated) {
    const boardRed = snapshot.mine.filter(
      (item) => item.color === 'rojo' || item.dueBucket === 'overdue' || item.estado === 'Retraso'
    )
    const total = c.red
    const top = boardRed[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding:
          total > 0
            ? `Tienes ${total} accion(es) en rojo asignadas a ti (prioridad roja o vencida/retraso).`
            : 'No tienes acciones en rojo (prioridad roja o vencida) asignadas a ti.',
        evidence: top
          ? `${listTitles(boardRed, Math.min(8, boardRed.length))}. ${fetchedLabel}. Alcance: responsable = tu.`
          : `${fetchedLabel}. Alcance: responsable = tu.`,
        recommendation: undefined,
        nextAction: top ? `Abrir "${top.titulo}" o pedir el listado completo.` : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }

  if (
    /vencid|retraso|atrasad/.test(normalized) &&
    (listAsk || briefAsk || intent === 'pending') &&
    !wantCreated
  ) {
    const overdue = snapshot.mine.filter(
      (item) => item.dueBucket === 'overdue' || item.estado === 'Retraso'
    )
    const total = c.overdue
    const top = overdue[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding:
          total > 0
            ? `Tienes ${total} accion(es) vencida(s) o en retraso asignadas a ti.`
            : 'No tienes acciones vencidas o en retraso asignadas a ti.',
        evidence: top
          ? `${listTitles(overdue, Math.min(8, overdue.length))}. ${fetchedLabel}.`
          : fetchedLabel,
        recommendation: top
          ? `Cierra o replanifica primero "${top.titulo}".`
          : undefined,
        nextAction: top ? `Abrir "${top.titulo}".` : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }

  const wantAssigned = isAssignedToMeRequest(message) || followUp?.scope === 'mine'
  if (wantCreated && !wantAssigned) {
    const created = snapshot.created
    const total = c.createdOpen
    const top = created[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding:
          total > 0
            ? `Tienes ${total} accion(es) abiertas que tu asignaste o creaste.`
            : 'No tienes acciones abiertas asignadas/creadas por ti en el alcance actual.',
        evidence: top
          ? `${listTitles(created, Math.min(10, created.length))}. ${fetchedLabel}. Alcance: created_by = tu.`
          : `${fetchedLabel}. Alcance: created_by = tu.`,
        recommendation: top
          ? `Revisa primero "${top.titulo}" (${top.estado}, ${top.fecha}).`
          : undefined,
        nextAction: top ? `Abrir "${top.titulo}".` : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }
  if (wantCreated && wantAssigned) {
    const byId = new Map(snapshot.mine.map((item) => [item.id, item]))
    for (const item of snapshot.created) byId.set(item.id, item)
    const merged = [...byId.values()]
    const top = merged[0] ?? snapshot.mine[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding: `Tienes ${c.open} asignadas a ti y ${c.createdOpen} asignadas/creadas por ti (${merged.length} unicas en la muestra).`,
        evidence: top
          ? `${listTitles(merged, Math.min(8, merged.length))}. ${fetchedLabel}.`
          : fetchedLabel,
        recommendation: top
          ? `Empieza por "${top.titulo}" (${top.estado}, ${top.fecha}).`
          : undefined,
        nextAction: top ? `Abrir "${top.titulo}".` : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }

  if (intent === 'team_delay') {
    if (!snapshot.viewer.canSeeTeam) {
      return withUi(
        message,
        snapshot,
        intent,
        {
          finding: 'Tu perfil no tiene vista de tablero completo.',
          evidence: 'Solo puedo resumir acciones asignadas a ti.',
          recommendation: 'Pide un resumen de tus pendientes o priorizacion personal.',
          nextAction: 'Preguntar: Que tengo pendiente?',
        },
        priorUserMessages
      )
    }
    const top = snapshot.teamHot[0]
    return withUi(
      message,
      snapshot,
      intent,
      {
        finding: `En el tablero hay ${c.teamOverdue} acciones ajenas en retraso/vencidas y ${c.teamBlocked} bloqueadas.`,
        evidence: top
          ? `${listTitles(snapshot.teamHot, 4)}. ${fetchedLabel}.`
          : `Sin muestra caliente ahora. ${fetchedLabel}.`,
        recommendation: top
          ? `Intervenir primero en "${top.titulo}" por urgencia/bloqueo.`
          : 'Mantener monitoreo; no hay focos calientes en la muestra.',
        nextAction: top ? `Revisar "${top.titulo}" con el responsable.` : undefined,
        record: top ? actionRecordLink(top.id, top.titulo) : undefined,
      },
      priorUserMessages
    )
  }

  if (intent === 'okrs') {
    if (!snapshot.viewer.canSeeOkrs || !snapshot.board.okrs) {
      const finding = 'No tienes acceso a OKRs en este perfil o no hay datos cargados.'
      return {
        content: finding,
        structured: { finding, evidence: fetchedLabel },
        ui: buildAssistantUiFromSnapshot({
          message,
          snapshot,
          intent,
          finding,
          priorUserMessages,
        }),
      }
    }

    const board = snapshot.board.okrs
    const scopeNeedle = message
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-MX')
    const wantTeam =
      /\b(de equipo|del equipo|team|area|de mi area)\b/.test(scopeNeedle) &&
      !/\b(empresa|company|corporativ)\b/.test(scopeNeedle)
    const wantCompany = /\b(de empresa|company|corporativ|de la org)\b/.test(scopeNeedle)
    const filtered = board.items.filter((item) => {
      const scope = String(item.scope || '').toLowerCase()
      if (wantTeam) return scope === 'team'
      if (wantCompany) return scope === 'company'
      return true
    })
    const label = wantTeam ? 'de equipo' : wantCompany ? 'de empresa' : 'visibles'
    const finding =
      filtered.length > 0
        ? `Tienes ${filtered.length} OKR(s) ${label}.`
        : wantTeam
          ? 'No hay OKRs de equipo en la muestra cargada.'
          : wantCompany
            ? 'No hay OKRs de empresa en la muestra cargada.'
            : 'No hay OKRs en la muestra cargada.'

    const ui = buildAssistantUiFromSnapshot({
      message,
      snapshot,
      intent,
      finding,
      priorUserMessages,
    })

    return {
      content: finding,
      structured: { finding },
      ui,
    }
  }

  const top = snapshot.mine[0]
  const mineTitles = listTitles(
    snapshot.mine.map((item) => ({
      titulo: item.titulo,
      estado: item.estado,
      fecha: item.fecha,
    })),
    Math.min(10, snapshot.mine.length)
  )

  const finding =
    intent === 'prioritize'
      ? `Tienes ${c.open} abiertas asignadas a ti; ${c.overdue} en retraso, ${c.dueThisWeek} vencen en 7 dias, ${c.blocked} bloqueadas y ${c.stale} sin actualizacion reciente.`
      : listAsk
        ? `Tienes ${c.open} acciones abiertas asignadas a ti.`
        : `Tienes ${c.open} acciones abiertas asignadas a ti. ${c.overdue} estan en retraso o vencidas y ${c.dueThisWeek} vencen esta semana.`

  return withUi(
    message,
    snapshot,
    intent,
    {
      finding,
      evidence: [
        mineTitles ? `Registros: ${mineTitles}` : 'Sin acciones abiertas listadas',
        c.pendingVerification > 0
          ? `Hecho por verificar: ${c.pendingVerification}`
          : null,
        snapshot.viewer.canSeeTeam && c.boardOpen > c.open
          ? `Tablero completo: ${c.boardOpen} abiertas (pide "acciones del tablero" o "enlistalas" despues de preguntar el total).`
          : null,
        fetchedLabel,
      ]
        .filter(Boolean)
        .join('. '),
      recommendation: top
        ? `Empieza por "${top.titulo}" (${top.estado}, ${top.fecha}).`
        : undefined,
      nextAction: top
        ? `Abrir "${top.titulo}" o pedir un plan de cierre.`
        : 'Crear una accion si necesitas un nuevo compromiso.',
      record: top ? actionRecordLink(top.id, top.titulo) : undefined,
    },
    priorUserMessages
  )
}
