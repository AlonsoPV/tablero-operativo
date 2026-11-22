import type { R4LinkRecord } from './sessionTypes.js'

export function createLinkStore(initial: R4LinkRecord) {
  let record: R4LinkRecord = { ...initial }
  return {
    get(): R4LinkRecord {
      return { ...record }
    },
    revoke() {
      record = { ...record, status: 'revoked' }
    },
    expire() {
      record = { ...record, status: 'expired' }
    },
    invalidateGrant() {
      record = { ...record, grantValid: false }
    },
    restore(next: R4LinkRecord) {
      record = { ...next }
    },
  }
}

export type R4LinkStore = ReturnType<typeof createLinkStore>

/** Una liga pública solo puede tener una sesión autorizada viva. */
export type R4LinkOccupancy = {
  claim(
    linkId: string,
    sessionId: string
  ): { ok: true } | { ok: false; code: 'session_occupied' }
  release(linkId: string, sessionId: string): void
  occupant(linkId: string): string | null
}

export function createLinkOccupancy(): R4LinkOccupancy {
  const live = new Map<string, string>()
  return {
    claim(linkId, sessionId) {
      const current = live.get(linkId)
      if (current && current !== sessionId) {
        return { ok: false, code: 'session_occupied' }
      }
      live.set(linkId, sessionId)
      return { ok: true }
    },
    release(linkId, sessionId) {
      if (live.get(linkId) === sessionId) live.delete(linkId)
    },
    occupant(linkId) {
      return live.get(linkId) ?? null
    },
  }
}
