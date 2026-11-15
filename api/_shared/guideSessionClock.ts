export type GuideClockPhase = 'conversation' | 'closing' | 'final_close'

export type GuideClockState = {
  phase: GuideClockPhase
  remaining_seconds: number
  must_close: boolean
  session_closed: boolean
  found: boolean
}

export const GUIDE_CLOCK_FALLBACK: GuideClockState = {
  phase: 'conversation',
  remaining_seconds: 900,
  must_close: false,
  session_closed: false,
  found: false,
}

export function remainingSecondsUntil(expiresAt: string | null | undefined, nowMs = Date.now()) {
  if (!expiresAt) return 900
  const ms = Date.parse(expiresAt) - nowMs
  if (!Number.isFinite(ms)) return 900
  return Math.max(0, Math.floor(ms / 1000))
}

export function clockPhaseOf(remaining: number, status: string | null | undefined): GuideClockPhase {
  if (status && !['active', 'closing'].includes(status)) return 'final_close'
  if (remaining <= 60) return 'final_close'
  if (remaining <= 180) return 'closing'
  return 'conversation'
}

export function clockStateFromSession(
  session: { status?: string | null; expires_at?: string | null } | null | undefined,
  nowMs = Date.now()
): GuideClockState {
  if (!session) return { ...GUIDE_CLOCK_FALLBACK }
  const remaining = remainingSecondsUntil(session.expires_at, nowMs)
  const phase = clockPhaseOf(remaining, session.status)
  return {
    phase,
    remaining_seconds: remaining,
    must_close: phase === 'final_close',
    session_closed: !['active', 'closing'].includes(String(session.status || 'active')),
    found: true,
  }
}

export function parseRetellArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

export function sessionIdFromRetellBody(body: {
  session_id?: unknown
  args?: unknown
  arguments?: unknown
  call?: { metadata?: unknown; retell_llm_dynamic_variables?: unknown }
} | null | undefined) {
  const args = parseRetellArgs(body?.args ?? body?.arguments)
  const metadata = (body?.call?.metadata ?? {}) as { guide_session_id?: unknown }
  const dyn = (body?.call?.retell_llm_dynamic_variables ?? {}) as { session_id?: unknown }
  const asId = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  return (
    asId(args.session_id) ||
    asId(body?.session_id) ||
    asId(metadata.guide_session_id) ||
    asId(dyn.session_id)
  )
}
