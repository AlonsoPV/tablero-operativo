/**
 * Token de acceso de corta duración para una sesión R4.
 * En memoria, de un solo uso. No emite credenciales de Retell reales.
 */
import { R4_PILOT_ACCESS_TOKEN_TTL_MS } from './pilotEnv.js'

export type R4AccessTokenIssueInput = {
  sessionId: string
  linkId: string
  authenticated: boolean
  consented: boolean
  occupancyClaimed: boolean
  authorizedOwner: boolean
  nowMs?: number
  ttlMs?: number
}

export type R4IssuedAccessToken = {
  tokenId: string
  sessionId: string
  linkId: string
  expiresAt: string
  ttlMs: number
}

export type R4TokenConsumeResult =
  | { ok: true; tokenId: string; sessionId: string }
  | {
      ok: false
      code:
        | 'unauthenticated'
        | 'consent_required'
        | 'session_occupied'
        | 'foreign_session'
        | 'expired'
        | 'reused'
        | 'unknown_token'
    }

type StoredToken = R4IssuedAccessToken & { consumed: boolean; expiresAtMs: number }

export function createR4AccessTokenIssuer(input?: { nowMs?: () => number }) {
  const nowMs = input?.nowMs ?? (() => Date.now())
  const byId = new Map<string, StoredToken>()
  const bySession = new Map<string, string>()
  let seq = 0

  return {
    issue(req: R4AccessTokenIssueInput): { ok: true; token: R4IssuedAccessToken } | R4TokenConsumeResult {
      if (!req.authenticated) return { ok: false, code: 'unauthenticated' }
      if (!req.consented) return { ok: false, code: 'consent_required' }
      if (!req.occupancyClaimed) return { ok: false, code: 'session_occupied' }
      if (!req.authorizedOwner) return { ok: false, code: 'foreign_session' }

      const previousId = bySession.get(req.sessionId)
      if (previousId) {
        const previous = byId.get(previousId)
        if (previous) previous.consumed = true
      }

      const issuedAt = req.nowMs ?? nowMs()
      const ttlMs = req.ttlMs ?? R4_PILOT_ACCESS_TOKEN_TTL_MS
      const tokenId = `r4tok-${req.sessionId}-${++seq}`
      const stored: StoredToken = {
        tokenId,
        sessionId: req.sessionId,
        linkId: req.linkId,
        ttlMs,
        expiresAt: new Date(issuedAt + ttlMs).toISOString(),
        expiresAtMs: issuedAt + ttlMs,
        consumed: false,
      }
      byId.set(tokenId, stored)
      bySession.set(req.sessionId, tokenId)
      const { consumed: _consumed, expiresAtMs: _exp, ...token } = stored
      void _consumed
      void _exp
      return { ok: true, token }
    },

    consume(tokenId: string, atMs?: number): R4TokenConsumeResult {
      const row = byId.get(tokenId)
      if (!row) return { ok: false, code: 'unknown_token' }
      if (row.consumed) return { ok: false, code: 'reused' }
      const now = atMs ?? nowMs()
      if (now >= row.expiresAtMs) {
        row.consumed = true
        return { ok: false, code: 'expired' }
      }
      row.consumed = true
      return { ok: true, tokenId: row.tokenId, sessionId: row.sessionId }
    },
  }
}

export type R4AccessTokenIssuer = ReturnType<typeof createR4AccessTokenIssuer>
