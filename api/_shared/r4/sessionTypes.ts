import type { R4LinkDecision } from './contracts.js'
import type { SimulatedReportFinalize } from './reportFinalize.js'

export type R4SessionPhase =
  | 'consent'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'paused'
  | 'recovering'
  | 'ended'
  | 'denied'
  | 'error'

export type R4SessionErrorCode =
  | 'consent_required'
  | 'not_connected'
  | 'paused'
  | 'ended'
  | 'denied'
  | 'expired'
  | 'revoked'
  | 'foreign_session'
  | 'invalid_grant'
  | 'public_confirm_denied'
  | 'unauthenticated'
  | 'timeout'
  | 'reconnect'
  | 'permission'
  | 'unsupported'
  | 'provider'
  | 'interrupted'
  | 'unauthorized'
  | 'duplicate_turn'
  | 'cancelled'

export type R4TranscriptItem = {
  id: string
  role: 'user' | 'assistant'
  text: string
  utteranceId?: string
}

export type R4ProtectedOpType = 'confirmAction' | 'queueCommunication'

export type R4ProtectedOpResult =
  | { ok: true; type: R4ProtectedOpType; id: string }
  | {
      ok: false
      type: R4ProtectedOpType
      id: string
      code: R4SessionErrorCode
      error: string
    }

export type R4LinkRecord = {
  linkId: string
  ownerUsuarioId: string
  status: 'active' | 'revoked' | 'expired'
  expiresAt: string
  grantValid: boolean
}

export type R4SessionSnapshot = {
  phase: R4SessionPhase
  sessionId: string
  callId: string | null
  consented: boolean
  authenticated: boolean
  source: 'voice' | 'link'
  link: R4LinkRecord
  lastLinkDecision: R4LinkDecision | null
  transcript: R4TranscriptItem[]
  lastError: { code: R4SessionErrorCode; message: string } | null
  lastAudioId: string | null
  report: SimulatedReportFinalize | null
  reportDuplicate: boolean
  protectedOps: R4ProtectedOpResult[]
  reconnectAttempts: number
}

export type R4PortRunner = <T>(label: string, fn: () => Promise<T>) => Promise<T>
