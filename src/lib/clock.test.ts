import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAppNow, getAppTimeMs } from './clock'

describe('application clock override precedence', () => {
  const now = new Date('2026-11-18T18:00:00.000Z')
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

  it('uses an explicit demo timestamp when requested', () => {
    vi.stubEnv('VITE_DEV_FIXED_NOW', '2026-04-10T16:58:00-06:00')
    expect(getAppNow().toISOString()).toBe('2026-04-10T22:58:00.000Z')
  })

  it('uses the system clock when the runtime explicitly clears the demo override', () => {
    vi.stubEnv('VITE_DEV_FIXED_NOW', '')
    expect(getAppNow().getTime()).toBe(now.getTime())
    expect(getAppTimeMs()).toBe(now.getTime())
  })

  it('does not reuse a demo timestamp after it is cleared or becomes invalid', () => {
    vi.stubEnv('VITE_DEV_FIXED_NOW', '2026-04-10T16:58:00-06:00')
    expect(getAppTimeMs()).not.toBe(now.getTime())
    for (const value of ['  ', 'invalid']) {
      vi.stubEnv('VITE_DEV_FIXED_NOW', value)
      expect(getAppTimeMs()).toBe(now.getTime())
    }
  })
})
