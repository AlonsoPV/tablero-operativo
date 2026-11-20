import { describe, expect, it, vi } from 'vitest'
import { capabilityFingerprint } from '../query/actorCapabilities.js'
import { resolveAccessCapabilities } from '../../../src/features/auth/lib/permissions.js'
import {
  createMemorySessionContextStore,
  createSupabaseSessionContextStore,
} from './sessionContext.js'
import { createFakeSupabase, type FakeDb } from './testing/fakeSupabase.js'

describe('store de sesión', () => {
  it('si el upsert falla, get usa la memoria de la instancia y no pierde el formato', async () => {
    const db: FakeDb = { tables: { agent_session_context: [] }, inserts: [], queries: [] }
    const inner = createFakeSupabase(db)
    const supabase = {
      from(table: string) {
        const chain = inner.from(table)
        if (table !== 'agent_session_context') return chain
        return {
          ...chain,
          upsert: async () => ({ data: null, error: { code: '23514', message: 'check constraint' } }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }
      },
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = createSupabaseSessionContextStore(supabase as never, createMemorySessionContextStore())
    const fingerprint = capabilityFingerprint(resolveAccessCapabilities({ rol: 'super_admin' }))
    await store.set('u-sa:web:s1', {
      activeQuery: null,
      lastActions: [],
      lastEntity: null,
      responseFormat: 'report',
      fingerprint,
    })
    expect(error).toHaveBeenCalled()
    expect(await store.get('u-sa:web:s1')).toMatchObject({ responseFormat: 'report', fingerprint })
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)
    error.mockRestore()
  })
})
