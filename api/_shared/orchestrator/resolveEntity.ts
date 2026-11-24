/**
 * Resolución de referencias (CV-03): «la más urgente», «esa», personas por nombre.
 * Con más de un candidato devuelve aclaración; nunca elige por el usuario.
 */
import type { CopilotClarification } from '../../../src/features/ai-support/copilot/types.js'
import type { ReferencedAction } from './sessionContext.js'

export type PersonCandidate = { id: string; nombre: string; area?: string | null }

export type PersonResolution =
  | { kind: 'resolved'; person: PersonCandidate }
  | { kind: 'ambiguous'; clarification: CopilotClarification }
  | { kind: 'none' }

const RED_PRIORITY = /\b(p1|alta|urgente|critica|crítica|roja?)\b/i

/** 0 vencida/retraso · 1 bloqueada · 2 prioridad roja · 3 vence hoy · 4 resto. */
export function urgencyRank(item: Pick<ReferencedAction, 'estado' | 'fecha' | 'prioridad'>, today: string): number {
  if (item.estado === 'Retraso' || (item.fecha != null && item.fecha < today && item.estado !== 'Hecho')) return 0
  if (item.estado === 'Bloqueado') return 1
  if (item.prioridad && RED_PRIORITY.test(item.prioridad.replace(/_/g, ' '))) return 2
  if (item.fecha === today) return 3
  return 4
}

export function rankByUrgency<T extends Pick<ReferencedAction, 'estado' | 'fecha' | 'prioridad'>>(
  items: T[],
  today: string
): T[] {
  return [...items].sort((a, b) => {
    const diff = urgencyRank(a, today) - urgencyRank(b, today)
    if (diff !== 0) return diff
    return (a.fecha ?? '9999-12-31').localeCompare(b.fecha ?? '9999-12-31')
  })
}

export type UrgentResolution =
  | { kind: 'resolved'; action: ReferencedAction }
  | { kind: 'ambiguous'; clarification: CopilotClarification }
  | { kind: 'none' }

/** La más urgente del último resultado. Empate exacto en rango y fecha → aclaración. */
export function pickMostUrgent(items: ReferencedAction[], today: string): UrgentResolution {
  if (items.length === 0) return { kind: 'none' }
  const ranked = rankByUrgency(items, today)
  const top = ranked[0]!
  const ties = ranked.filter(
    (item) => urgencyRank(item, today) === urgencyRank(top, today) && item.fecha === top.fecha
  )
  if (ties.length > 1) {
    return {
      kind: 'ambiguous',
      clarification: {
        question: 'Hay varias igual de urgentes. ¿Cuál te interesa?',
        options: ties.slice(0, 6).map((item) => ({
          id: item.id,
          label: `${item.title} · ${item.estado ?? ''} · ${item.fecha ?? ''}`,
        })),
      },
    }
  }
  return { kind: 'resolved', action: top }
}

export function resolvePerson(candidates: PersonCandidate[]): PersonResolution {
  if (candidates.length === 0) return { kind: 'none' }
  if (candidates.length === 1) return { kind: 'resolved', person: candidates[0]! }
  return {
    kind: 'ambiguous',
    clarification: {
      question: 'Hay varias personas con ese nombre. ¿A quién te refieres?',
      options: candidates.slice(0, 6).map((p) => ({
        id: p.id,
        label: `${p.nombre}${p.area ? ` · ${p.area}` : ''}`,
      })),
    },
  }
}
