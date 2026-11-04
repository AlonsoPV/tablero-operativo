import { describe, expect, it, beforeEach } from 'vitest'
import {
  __resetAssistantRateLimitForTests,
  checkAssistantRateLimit,
  readAuthToken,
} from './assistantAuth'
import type { VercelRequestLike } from './http'

function fakeReq(headers: Record<string, string | string[] | undefined>): VercelRequestLike {
  return { headers } as VercelRequestLike
}

describe('assistantAuth helpers', () => {
  beforeEach(() => {
    __resetAssistantRateLimitForTests()
  })

  it('reads Bearer token from Authorization header', () => {
    expect(readAuthToken(fakeReq({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi')
    expect(readAuthToken(fakeReq({ Authorization: 'bearer xyz' }))).toBe('xyz')
    expect(readAuthToken(fakeReq({}))).toBeNull()
    expect(readAuthToken(fakeReq({ authorization: 'Basic nope' }))).toBeNull()
  })

  it('enforces sliding-window rate limits per key', () => {
    const key = 'user-1:gemini-chat'
    for (let i = 0; i < 3; i++) {
      expect(checkAssistantRateLimit({ key, limit: 3, windowMs: 60_000 }).ok).toBe(true)
    }
    const blocked = checkAssistantRateLimit({ key, limit: 3, windowMs: 60_000 })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0)
    }
  })

  it('isolates rate limit buckets by key', () => {
    expect(checkAssistantRateLimit({ key: 'a', limit: 1, windowMs: 60_000 }).ok).toBe(true)
    expect(checkAssistantRateLimit({ key: 'a', limit: 1, windowMs: 60_000 }).ok).toBe(false)
    expect(checkAssistantRateLimit({ key: 'b', limit: 1, windowMs: 60_000 }).ok).toBe(true)
  })
})
