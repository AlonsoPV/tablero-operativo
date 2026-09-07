import type { ChallengeListItem, ChallengeStatus } from './types'

const DAY_MS = 86_400_000

export const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = {
  pending: 'Pendiente de aprobacion',
  active: 'Activo',
  finished: 'Finalizado',
  rejected: 'Rechazado',
}

export const CHALLENGE_STATUS_BADGE: Record<ChallengeStatus, string> = {
  pending: 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  active: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  finished: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200',
  rejected: 'border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200',
}

export function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

export function daysRemaining(challenge: Pick<ChallengeListItem, 'effective_status' | 'end_date'>): number {
  if (challenge.effective_status !== 'active' || !challenge.end_date) return 0
  const today = Date.parse(`${todayYmd()}T00:00:00Z`)
  const end = Date.parse(`${challenge.end_date}T00:00:00Z`)
  if (!Number.isFinite(today) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.ceil((end - today) / DAY_MS))
}

export function challengeDurationDays(challenge: Pick<ChallengeListItem, 'start_date' | 'end_date'>): number | null {
  if (!challenge.start_date || !challenge.end_date) return null
  const start = Date.parse(`${challenge.start_date}T00:00:00Z`)
  const end = Date.parse(`${challenge.end_date}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1)
}

/** Progreso 0–100 del periodo del challenge (inicio → cierre). */
export function challengeTimeProgress(
  challenge: Pick<ChallengeListItem, 'start_date' | 'end_date' | 'proposed_start_date' | 'proposed_end_date' | 'effective_status'>
): number | null {
  const startRaw = challenge.start_date ?? challenge.proposed_start_date
  const endRaw = challenge.end_date ?? challenge.proposed_end_date
  if (!startRaw || !endRaw) return null
  const start = Date.parse(`${startRaw}T00:00:00Z`)
  const end = Date.parse(`${endRaw}T00:00:00Z`)
  const today = Date.parse(`${todayYmd()}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  if (challenge.effective_status === 'finished') return 100
  if (challenge.effective_status === 'pending') return 0
  const ratio = (today - start) / (end - start)
  return Math.max(0, Math.min(100, Math.round(ratio * 100)))
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return 'Sin definir'
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase() || '?'
}
