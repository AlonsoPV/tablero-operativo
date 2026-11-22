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
