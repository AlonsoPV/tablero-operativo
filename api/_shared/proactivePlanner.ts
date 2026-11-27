import { DISCIPLINE_THRESHOLDS } from './orchestrator/executiveDiagnosis.js'
import {
  evaluateProactiveFollowup,
  planGroupedProactiveDigest,
  type GroupedProactiveDigest,
  type ProactiveCandidate,
  type ProactiveCategory,
  type ProactiveUserPreferences,
} from './whatsappProactive.js'

const OPEN = new Set(['Pendiente', 'En_Ejecucion', 'Bloqueado', 'Retraso'])

type ActionRow = {
  id: string
  titulo_accion: string | null
  estado: string | null
  fecha: string | null
  responsable: string | null
  updated_at: string | null
}

function daysBetween(fromIso: string | null, today: string): number | null {
  if (!fromIso) return null
  const from = fromIso.slice(0, 10)
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.floor((b - a) / 86_400_000)
}

export function buildProactiveCandidates(
  actions: ActionRow[],
  today: string
): ProactiveCandidate[] {
  const candidates: ProactiveCandidate[] = []
  for (const action of actions) {
    const owner = action.responsable
    if (!owner) continue
    const title = (action.titulo_accion ?? 'Acción').slice(0, 120)
    const href = `/kanban?accion=${action.id}`
    const estado = action.estado ?? ''
    const staleDays = daysBetween(action.updated_at, today)
    const dueDays = daysBetween(action.fecha, today)

    if (OPEN.has(estado) && dueDays !== null && dueDays > 0) {
      candidates.push({
        category: 'overdue_alert',
        usuarioId: owner,
        entityId: action.id,
        title,
        detail: `Vencida desde ${action.fecha}. Estado ${estado}.`,
        dateBucket: today,
        href,
      })
    }
    if (estado === 'Bloqueado' && staleDays !== null && staleDays >= DISCIPLINE_THRESHOLDS.prolongedBlockerDays) {
      candidates.push({
        category: 'stale_blocker',
        usuarioId: owner,
        entityId: action.id,
        title,
        detail: `Bloqueo sin actualización ${staleDays} días.`,
        dateBucket: today,
        href,
      })
    }
    if (OPEN.has(estado) && staleDays !== null && staleDays >= DISCIPLINE_THRESHOLDS.staleActiveDays) {
      candidates.push({
        category: 'stale_commitment',
        usuarioId: owner,
        entityId: action.id,
        title,
        detail: `Sin avance registrado ${staleDays} días.`,
        dateBucket: today,
        href,
      })
    }
    if (estado === 'Hecho') {
      candidates.push({
        category: 'pending_verification',
        usuarioId: owner,
        entityId: action.id,
        title,
        detail: 'En Hecho, pendiente de verificación.',
        dateBucket: today,
        href,
      })
    }
  }
  return candidates
}

export function prefsFromRow(
  row: {
    usuario_id: string
    consent?: boolean | null
    timezone?: string | null
    window_start_hour?: number | null
    window_end_hour?: number | null
    allowed_weekdays?: number[] | null
    enabled_categories?: string[] | null
    max_per_day?: number | null
    min_interval_minutes?: number | null
  },
  waId = ''
): ProactiveUserPreferences {
  const categories = new Set<ProactiveCategory>(
    (row.enabled_categories ?? []).filter((c): c is ProactiveCategory =>
      [
        'daily_summary',
        'due_reminder',
        'overdue_alert',
        'stale_blocker',
        'stale_commitment',
        'pending_verification',
        'agreement_followup',
        'weekly_executive_summary',
        'okr_risk_alert',
      ].includes(c)
    )
  )
  return {
    usuarioId: row.usuario_id,
    waId,
    active: true,
    consent: row.consent === true,
    timezone: row.timezone || 'America/Mexico_City',
    windowStartHour: row.window_start_hour ?? 8,
    windowEndHour: row.window_end_hour ?? 19,
    allowedWeekdays: row.allowed_weekdays?.length ? row.allowed_weekdays : [1, 2, 3, 4, 5],
    enabledCategories: categories,
    maxPerDay: row.max_per_day ?? 3,
    minIntervalMinutes: row.min_interval_minutes ?? 180,
  }
}

export function decideDryRun(
  candidates: ProactiveCandidate[],
  prefsByUser: Map<string, ProactiveUserPreferences>,
  sentKeys: Set<string>,
  nowIso: string
) {
  return candidates.map((candidate) => {
    const prefs = prefsByUser.get(candidate.usuarioId)
    if (!prefs) {
      return {
        candidate,
        decision: {
          allowed: false as const,
          dryRun: true as const,
          dedupeKey: `${candidate.category}:${candidate.usuarioId}:${candidate.entityId}:${candidate.dateBucket}`,
          reason: 'missing_consent' as const,
        },
      }
    }
    return {
      candidate,
      decision: evaluateProactiveFollowup(candidate, prefs, {
        nowIso,
        sentTodayCount: 0,
        sentDedupeKeys: sentKeys,
        costControl: { zeroCostOnly: true },
      }),
    }
  })
}

export function decideGroupedDryRun(
  candidates: ProactiveCandidate[],
  prefsByUser: Map<string, ProactiveUserPreferences>,
  sentKeys: Set<string>,
  nowIso: string
): Array<{ usuarioId: string; digest: GroupedProactiveDigest; missingConsent: boolean }> {
  const byUser = new Map<string, ProactiveCandidate[]>()
  for (const candidate of candidates) {
    const list = byUser.get(candidate.usuarioId) ?? []
    list.push(candidate)
    byUser.set(candidate.usuarioId, list)
  }
  const grouped: Array<{ usuarioId: string; digest: GroupedProactiveDigest; missingConsent: boolean }> = []
  for (const [usuarioId, items] of byUser) {
    const prefs = prefsByUser.get(usuarioId)
    if (!prefs) {
      grouped.push({
        usuarioId,
        missingConsent: true,
        digest: {
          dryRun: true,
          allowed: false,
          usuarioId,
          transport: null,
          includedCount: 0,
          suppressedCount: items.length,
          dedupeKeys: [],
          bodyText: null,
          suppressedReasons: Array.from({ length: items.length }, () => 'missing_consent' as const),
        },
      })
      continue
    }
    grouped.push({
      usuarioId,
      missingConsent: false,
      digest: planGroupedProactiveDigest(items, prefs, {
        nowIso,
        lastInboundAt: nowIso,
        sentTodayCount: 0,
        sentDedupeKeys: sentKeys,
        costControl: { zeroCostOnly: true },
      }),
    })
  }
  return grouped
}
