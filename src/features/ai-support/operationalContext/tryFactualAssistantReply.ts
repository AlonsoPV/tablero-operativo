import {
  actionRecordLink,
  formatStructuredReplyContent,
  type AssistantStructuredReply,
} from '@/features/ai-support/assistantBriefing'
import type { AssistantIntent, OperationalSnapshot } from './types'

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
    /acciones bloqueadas/.test(t)
  )
}

function pack(structured: AssistantStructuredReply) {
  return {
    content: formatStructuredReplyContent(structured),
    structured,
  }
}

/**
 * Resuelve consultas factuales con datos del snapshot, sin llamar a Gemini.
 * Devuelve null cuando hace falta interpretacion o recomendacion.
 */
export function tryFactualAssistantReply(
  message: string,
  snapshot: OperationalSnapshot,
  intent: AssistantIntent
): { content: string; structured: AssistantStructuredReply } | null {
  if (intent === 'selected_action' || intent === 'selected_okr') return null
  if (intent === 'prioritize' && !isSimpleCountQuestion(message)) return null
  if (intent === 'okrs' && !isSimpleCountQuestion(message)) return null
  if (intent === 'general' && !isSimpleCountQuestion(message)) return null
  if (intent === 'team_delay' && !isSimpleCountQuestion(message) && message.trim().length > 90) {
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

  if (/verificacion/.test(normalized)) {
    const top = snapshot.pendingVerification[0]
    return pack({
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
    })
  }

  if (/bloquead/.test(normalized)) {
    const blocked = snapshot.mine.filter((item) => item.estado === 'Bloqueado')
    const top = blocked[0]
    return pack({
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
    })
  }

  if (intent === 'team_delay') {
    if (!snapshot.viewer.canSeeTeam) {
      return pack({
        finding: 'Tu perfil no tiene vista de tablero completo.',
        evidence: 'Solo puedo resumir acciones asignadas a ti.',
        recommendation: 'Pide un resumen de tus pendientes o priorizacion personal.',
        nextAction: 'Preguntar: Que tengo pendiente?',
      })
    }
    const top = snapshot.teamHot[0]
    return pack({
      finding: `En el tablero hay ${c.teamOverdue} acciones ajenas en retraso/vencidas y ${c.teamBlocked} bloqueadas.`,
      evidence: top
        ? `${listTitles(snapshot.teamHot, 4)}. ${fetchedLabel}.`
        : `Sin muestra caliente ahora. ${fetchedLabel}.`,
      recommendation: top
        ? `Intervenir primero en "${top.titulo}" por urgencia/bloqueo.`
        : 'Mantener monitoreo; no hay focos calientes en la muestra.',
      nextAction: top ? `Revisar "${top.titulo}" con el responsable.` : undefined,
      record: top ? actionRecordLink(top.id, top.titulo) : undefined,
    })
  }

  if (intent === 'okrs') {
    if (!snapshot.viewer.canSeeOkrs || !snapshot.board.okrs) {
      return pack({
        finding: 'No tienes acceso a OKRs en este perfil o no hay datos cargados.',
        evidence: fetchedLabel,
      })
    }
    const okrs = snapshot.board.okrs
    const names = okrs.items
      .slice(0, 5)
      .map((item) => item.nombre)
      .filter(Boolean)
      .join('; ')
    return pack({
      finding: `Tienes acceso a ${okrs.objectives} objetivos, ${okrs.keyResults} KRs y ${okrs.initiatives} iniciativas.`,
      evidence: [names ? `Objetivos: ${names}` : null, fetchedLabel].filter(Boolean).join('. '),
      recommendation:
        'Elige un objetivo concreto o pide diagnostico de calidad de KRs para profundizar.',
      nextAction: 'Preguntar por un OKR o seleccionarlo arriba.',
    })
  }

  const top = snapshot.mine[0]
  const mineTitles = listTitles(
    snapshot.mine.map((item) => ({
      titulo: item.titulo,
      estado: item.estado,
      fecha: item.fecha,
    }))
  )

  const finding =
    intent === 'prioritize'
      ? `En tu alcance hay ${c.open} abiertas; ${c.overdue} en retraso, ${c.dueThisWeek} vencen en 7 dias, ${c.blocked} bloqueadas y ${c.stale} sin actualizacion reciente.`
      : `Tienes ${c.open} acciones abiertas. ${c.overdue} estan en retraso o vencidas y ${c.dueThisWeek} vencen esta semana.`

  return pack({
    finding,
    evidence: [
      mineTitles ? `Registros: ${mineTitles}` : 'Sin acciones abiertas listadas',
      c.pendingVerification > 0
        ? `Hecho por verificar: ${c.pendingVerification}`
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
  })
}
