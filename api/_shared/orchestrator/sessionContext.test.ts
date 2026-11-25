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


it('conserva comunicación y aprobación vinculada tras cambiar de instancia, sin credenciales', async () => {
  const db: FakeDb={tables:{agent_session_context:[]},inserts:[],queries:[]}
  const client=createFakeSupabase(db)
  const first=createSupabaseSessionContextStore(client,createMemorySessionContextStore())
  const fingerprint=capabilityFingerprint(resolveAccessCapabilities({rol:'super_admin'}))
  const communication={proposalId:'communication-qa',idempotencyKey:'qa-idem',version:2,status:'pending',channel:'whatsapp',
    recipientMode:'single',purpose:'pending_actions',canSendDirect:true,channelLimitation:null,createdAt:'2026-11-25T20:00:00Z',
    recipients:[{recipientId:'qa-recipient',recipientName:'Persona QA',channel:'whatsapp',canSendDirect:true,channelLimitation:null,subject:null,messageBody:'Contenido aprobado',itemCount:1}],
    spec:{intent:'send_communication',channel:'whatsapp',recipientMode:'single',recipientHint:'Persona QA',purpose:'pending_actions',requiredQueries:['recipient_open_actions'],scope:'recipient_personal',period:'today',explicitContent:null,contentMode:'contextual',tone:'direct',finalOperation:'propose_send'},
    execution:{version:2,proposal:{id:'qa-op',tool:'whatsapp_prepare_send',title:'Enviar',summary:'Revisar',fields:[],expiresAt:'2099-01-01T00:00:00Z'}},
    accessToken:'must-not-persist'}
  await first.set('qa-user:web:cold-start',{activeQuery:null,lastActions:[],lastEntity:null,fingerprint,
    pendingCommunication:communication as never})
  const second=createSupabaseSessionContextStore(client,createMemorySessionContextStore())
  const restored=await second.get('qa-user:web:cold-start')
  expect(restored?.pendingCommunication).toMatchObject({proposalId:'communication-qa',version:2,recipients:[{messageBody:'Contenido aprobado'}],execution:{version:2,proposal:{id:'qa-op'}}})
  expect(JSON.stringify(db.tables.agent_session_context)).not.toContain('must-not-persist')
})
