/**
 * R0 Local Resilience & Reconciliation helpers for WhatsApp inbound jobs.
 * Pure, deterministic state transitions for:
 * - Duplicate event suppression
 * - Out-of-order Meta webhook messages & delivery status ordering
 * - Interrupted lease recovery without blind replays
 * - Uncertain provider outcome classification
 * - CAS-guarded reconciliation of jobs held in review
 */

export type InboundJobStatus = 'pending' | 'processing' | 'done' | 'review' | 'failed'
export type InboundJobKind = 'message' | 'status'
export type MetaDeliveryStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed'

export type InboundJobRecord = {
  id: string
  eventKey: string
  phoneId: string
  sender: string
  kind: InboundJobKind
  status: InboundJobStatus
  attempts: number
  effectStarted: boolean
  stage: string
  errorCode: string | null
  availableAt: string
  leaseToken: string | null
  leaseUntil: string | null
  createdAt: string
  updatedAt: string
  trace: ReconciliationTraceEntry[]
}

export type ReconciliationTraceEntry = {
  at: string
  event: string
  stage: string
  code?: string | null
  detail?: string
}

export type InboundEventEnvelope = {
  eventKey: string
  phoneId: string
  sender: string
  kind: InboundJobKind
  metaMessageId?: string | null
  providerTimestampMs?: number | null
  status?: MetaDeliveryStatus
}

export const DELIVERY_STATUS_RANK: Record<MetaDeliveryStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
}

export function deduplicateInboundEvents(
  incoming: readonly InboundEventEnvelope[],
  seenEventKeys: ReadonlySet<string>
): { accepted: InboundEventEnvelope[]; duplicates: InboundEventEnvelope[] } {
  const seen = new Set(seenEventKeys)
  const accepted: InboundEventEnvelope[] = []
  const duplicates: InboundEventEnvelope[] = []

  for (const event of incoming) {
    if (!event.eventKey || seen.has(event.eventKey)) {
      duplicates.push(event)
      continue
    }
    seen.add(event.eventKey)
    accepted.push(event)
  }

  return { accepted, duplicates }
}

export type EventOrderingResult =
  | { action: 'apply'; reason: 'in_order' }
  | { action: 'ignore_stale'; reason: 'older_delivery_status' | 'older_message_timestamp' }

/**
 * Prevents out-of-order Meta webhook deliveries from regressing state.
 * - Status events: never regress e.g. delivered/read -> sent; allow failed only if not already read.
 * - Message events: flag messages strictly older than the latest processed timestamp for the same sender thread.
 */
export function evaluateEventOrdering(input: {
  kind: InboundJobKind
  incomingStatus?: MetaDeliveryStatus | null
  currentStatus?: MetaDeliveryStatus | null
  incomingTimestampMs?: number | null
  latestProcessedTimestampMs?: number | null
}): EventOrderingResult {
  if (input.kind === 'status' && input.incomingStatus && input.currentStatus) {
    if (input.currentStatus === 'read' && input.incomingStatus !== 'read') {
      return { action: 'ignore_stale', reason: 'older_delivery_status' }
    }
    if (
      input.incomingStatus !== 'failed' &&
      DELIVERY_STATUS_RANK[input.incomingStatus] <= DELIVERY_STATUS_RANK[input.currentStatus]
    ) {
      return { action: 'ignore_stale', reason: 'older_delivery_status' }
    }
  }

  if (
    input.kind === 'message' &&
    typeof input.incomingTimestampMs === 'number' &&
    typeof input.latestProcessedTimestampMs === 'number' &&
    input.incomingTimestampMs < input.latestProcessedTimestampMs
  ) {
    return { action: 'ignore_stale', reason: 'older_message_timestamp' }
  }

  return { action: 'apply', reason: 'in_order' }
}

export type ProviderOutcomeAssessment = {
  ok: boolean
  uncertain: boolean
  retryableWithoutReplay: boolean
  nextStatus: 'done' | 'pending' | 'review' | 'failed'
  errorCode: string | null
}

/**
 * Classifies a Meta Graph / provider send result so uncertain outcomes NEVER auto-resend.
 */
export function classifyProviderOutcome(input: {
  httpStatus?: number | null
  hasMessageId?: boolean
  timedOut?: boolean
  networkError?: boolean
  attempts: number
  maxAttempts?: number
  effectStartedBeforeSend?: boolean
}): ProviderOutcomeAssessment {
  const maxAttempts = input.maxAttempts ?? 4

  if (input.timedOut || input.networkError) {
    return {
      ok: false,
      uncertain: true,
      retryableWithoutReplay: false,
      nextStatus: 'review',
      errorCode: 'provider_outcome_unknown',
    }
  }

  const status = input.httpStatus ?? 0
  if (status >= 200 && status < 300) {
    if (input.hasMessageId) {
      return {
        ok: true,
        uncertain: false,
        retryableWithoutReplay: false,
        nextStatus: 'done',
        errorCode: null,
      }
    }
    return {
      ok: false,
      uncertain: true,
      retryableWithoutReplay: false,
      nextStatus: 'review',
      errorCode: 'provider_missing_message_id',
    }
  }

  if (status === 429 && !input.effectStartedBeforeSend) {
    const exhausted = input.attempts >= maxAttempts
    return {
      ok: false,
      uncertain: false,
      retryableWithoutReplay: !exhausted,
      nextStatus: exhausted ? 'failed' : 'pending',
      errorCode: 'provider_http_429',
    }
  }

  if (status >= 500 || status === 0) {
    return {
      ok: false,
      uncertain: true,
      retryableWithoutReplay: false,
      nextStatus: 'review',
      errorCode: status >= 500 ? `provider_http_${status}` : 'provider_outcome_unknown',
    }
  }

  return {
    ok: false,
    uncertain: Boolean(input.effectStartedBeforeSend),
    retryableWithoutReplay: false,
    nextStatus: input.effectStartedBeforeSend ? 'review' : 'failed',
    errorCode: `provider_http_${status}`,
  }
}

/**
 * Recovers processing jobs whose lease expired (worker crashed/timed out).
 * Uncertain jobs (`effectStarted === true`) ALWAYS transition to `review`, never `pending`.
 */
export function recoverExpiredLeases(
  jobs: readonly InboundJobRecord[],
  nowIso: string,
  maxAttempts = 4
): { jobs: InboundJobRecord[]; recoveredIds: string[]; heldForReviewIds: string[] } {
  const nowMs = Date.parse(nowIso)
  const recoveredIds: string[] = []
  const heldForReviewIds: string[] = []

  const updated = jobs.map((job) => {
    if (job.status !== 'processing' || !job.leaseUntil || Date.parse(job.leaseUntil) >= nowMs) {
      return job
    }
    const nextStatus: InboundJobStatus = job.effectStarted
      ? 'review'
      : job.attempts >= maxAttempts
        ? 'failed'
        : 'pending'

    if (nextStatus === 'review') heldForReviewIds.push(job.id)
    else recoveredIds.push(job.id)

    const backoffMs = 30_000 * Math.pow(2, Math.min(job.attempts, 6))
    return {
      ...job,
      status: nextStatus,
      stage: 'lease_expired',
      errorCode: 'lease_expired',
      leaseToken: null,
      leaseUntil: null,
      availableAt: nextStatus === 'pending' ? new Date(nowMs + backoffMs).toISOString() : job.availableAt,
      updatedAt: nowIso,
      trace: [
        ...job.trace,
        {
          at: nowIso,
          event: 'LEASE_EXPIRED_RECOVERED',
          stage: 'lease_expired',
          code: 'lease_expired',
          detail: `status=${nextStatus},effect_started=${job.effectStarted}`,
        },
      ],
    }
  })

  return { jobs: updated, recoveredIds, heldForReviewIds }
}

export type ReconciliationDecision = {
  expectedAttempts: number
  decision: 'reconciled_no_replay' | 'requeue'
  reason: string
  actorUsuarioId: string | null
  nowIso: string
}

export type ReconciliationOutcome =
  | { ok: true; job: InboundJobRecord }
  | {
      ok: false
      code:
        | 'not_in_review'
        | 'cas_conflict'
        | 'cannot_replay_uncertain_effect'
        | 'reason_required'
    }

/**
 * Safe CAS reconciliation matching `public.whatsapp_reconcile_inbound_job`.
 * Guarantees uncertain effects (`effectStarted === true`) can NEVER be blindly requeued.
 */
export function reconcileReviewJob(
  job: InboundJobRecord,
  input: ReconciliationDecision
): ReconciliationOutcome {
  if (!input.reason || input.reason.trim().length < 5) {
    return { ok: false, code: 'reason_required' }
  }
  if (job.status !== 'review') {
    return { ok: false, code: 'not_in_review' }
  }
  if (job.attempts !== input.expectedAttempts) {
    return { ok: false, code: 'cas_conflict' }
  }
  if (input.decision === 'requeue' && job.effectStarted) {
    return { ok: false, code: 'cannot_replay_uncertain_effect' }
  }

  const nextStatus: InboundJobStatus = input.decision === 'reconciled_no_replay' ? 'failed' : 'pending'
  const nextStage = input.decision === 'reconciled_no_replay' ? 'reconciled_no_replay' : 'reconciled_requeue'

  return {
    ok: true,
    job: {
      ...job,
      status: nextStatus,
      stage: nextStage,
      availableAt: nextStatus === 'pending' ? input.nowIso : job.availableAt,
      leaseToken: null,
      leaseUntil: null,
      updatedAt: input.nowIso,
      trace: [
        ...job.trace,
        {
          at: input.nowIso,
          event: 'JOB_RECONCILED',
          stage: nextStage,
          code: job.errorCode,
          detail: `${input.decision}: ${input.reason.trim().slice(0, 200)}`,
        },
      ],
    },
  }
}
