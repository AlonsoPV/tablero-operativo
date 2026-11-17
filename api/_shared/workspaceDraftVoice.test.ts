import { describe, expect, it, vi } from 'vitest'
import {
  buildVoiceDraftIdempotencyKey,
  mutateVoiceWorkspaceDraft,
  normalizeVoiceDraftAction,
} from './workspaceDraftVoice.js'

function makeActor(store: {
  rows: Array<Record<string, unknown>>
}) {
  const supabase = {
    from: (table: string) => {
      if (table !== 'assistant_pending_ops') {
        return {
          select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          insert: async () => ({ data: null, error: null }),
          update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
        }
      }
      return {
        select: (_cols: string) => {
          const chain: Record<string, unknown> = {}
          const filters: Record<string, unknown> = {}
          const apply = () =>
            store.rows.filter((row) => {
              if (filters.id && row.id !== filters.id) return false
              if (filters.usuario_id && row.usuario_id !== filters.usuario_id) return false
              if (filters.session_id && row.session_id !== filters.session_id) return false
              if (filters.status && row.status !== filters.status) return false
              if (filters.tool && row.tool !== filters.tool) return false
              if (filters.toolIn && !(filters.toolIn as string[]).includes(String(row.tool))) return false
              return true
            })
          chain.eq = (key: string, value: unknown) => {
            filters[key] = value
            return chain
          }
          chain.in = (key: string, values: string[]) => {
            if (key === 'tool') filters.toolIn = values
            return chain
          }
          chain.order = () => chain
          chain.limit = () => chain
          chain.maybeSingle = async () => {
            const rows = apply()
            return { data: rows[0] ?? null, error: null }
          }
          // thenable for await supabase.from().select()... without maybeSingle
          chain.then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve({ data: apply(), error: null }))
          return chain
        },
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const id = `op-${store.rows.length + 1}`
              const next = { ...row, id, status: 'pending' }
              store.rows.push(next)
              return { data: { id, expires_at: new Date().toISOString() }, error: null }
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          const eqFilters: Record<string, unknown> = {}
          const chain: Record<string, unknown> = {
            eq: (key: string, value: unknown) => {
              eqFilters[key] = value
              return chain
            },
            in: () => chain,
            select: () => ({
              maybeSingle: async () => {
                const row = store.rows.find((item) =>
                  Object.entries(eqFilters).every(([k, v]) => item[k] === v)
                )
                if (row) Object.assign(row, patch)
                return { data: row ? { id: row.id } : null, error: null }
              },
            }),
            then: (resolve: (v: unknown) => unknown) => {
              for (const row of store.rows) {
                if (Object.entries(eqFilters).every(([k, v]) => row[k] === v)) {
                  Object.assign(row, patch)
                }
              }
              return Promise.resolve(resolve({ error: null }))
            },
          }
          return chain
        },
      }
    },
  }
  return {
    supabase: supabase as never,
    usuarioId: 'user-1',
    authUserId: 'auth-1',
    rol: 'admin',
  }
}

vi.mock('./assistantCommunicationDrafts.js', () => ({
  queueWhatsappDraft: vi.fn(async (actor: { supabase: { from: Function } }, input: { purpose: string; sessionId: string; idempotencyKey: string; recipient?: string }) => {
    const id = `wa-${Math.random().toString(36).slice(2, 8)}`
    await actor.supabase.from('assistant_pending_ops').insert({
      id,
      usuario_id: 'user-1',
      session_id: input.sessionId,
      tool: 'whatsapp_prepare_send',
      status: 'pending',
      payload: { incomplete: true, purpose: input.purpose, recipient_hint: input.recipient || '', idempotency_key: input.idempotencyKey },
      preview: { title: 'WhatsApp', summary: input.purpose, workspace: { kind: 'whatsapp', incomplete: true } },
    })
    return {
      id,
      tool: 'whatsapp_prepare_send',
      title: 'WhatsApp',
      summary: input.purpose,
      fields: [],
      expiresAt: new Date().toISOString(),
      workspace: { kind: 'whatsapp', incomplete: true },
    }
  }),
}))

vi.mock('./assistantGoogleTools.js', () => ({
  queueWorkspaceDraft: vi.fn(async (_actor, input: { purpose: string; type: string; sessionId: string }) => {
    const id = `em-${Math.random().toString(36).slice(2, 8)}`
    return {
      id,
      tool: input.type === 'event' ? 'calendar_prepare_event' : 'gmail_prepare_send',
      title: input.type === 'event' ? 'Evento' : 'Correo',
      summary: input.purpose,
      fields: [],
      expiresAt: new Date().toISOString(),
      workspace: { kind: input.type === 'event' ? 'event' : 'email', incomplete: true },
    }
  }),
}))

describe('workspaceDraftVoice', () => {
  it('normalizes actions', () => {
    expect(normalizeVoiceDraftAction('prepare')).toBe('prepare')
    expect(normalizeVoiceDraftAction('update')).toBe('update')
    expect(normalizeVoiceDraftAction('cancelar')).toBe('cancel')
    expect(normalizeVoiceDraftAction(undefined)).toBe('prepare')
  })

  it('builds stable idempotency keys', () => {
    expect(
      buildVoiceDraftIdempotencyKey({
        idempotencyKey: 'tool-1',
        channel: 'email',
        purpose: 'acuerdos',
      })
    ).toBe('tool-1')
    expect(
      buildVoiceDraftIdempotencyKey({
        utteredAt: '2026-01-01T00:00:00.000Z',
        channel: 'whatsapp',
        purpose: '  Acuerdos   finales ',
      })
    ).toContain('voice:whatsapp:')
  })

  it('prepares email, whatsapp and both without asserting send', async () => {
    const store = { rows: [] as Array<Record<string, unknown>> }
    const actor = makeActor(store)

    const email = await mutateVoiceWorkspaceDraft(actor, {
      action: 'prepare',
      channel: 'email',
      purpose: 'acuerdos',
      recipient: 'Carlos',
      sessionId: 'sess-1',
      idempotencyKey: 'k-email',
    })
    expect(email.ok).toBe(true)
    expect(email.pending_op_ids).toHaveLength(1)
    expect(email.spoken).toMatch(/No se envio/)

    const wa = await mutateVoiceWorkspaceDraft(actor, {
      action: 'prepare',
      channel: 'whatsapp',
      purpose: 'acuerdos',
      recipient: 'Carlos',
      sessionId: 'sess-1',
      idempotencyKey: 'k-wa',
    })
    expect(wa.ok).toBe(true)
    expect(wa.pending_op_ids).toHaveLength(1)

    const both = await mutateVoiceWorkspaceDraft(actor, {
      action: 'prepare',
      channel: 'both',
      purpose: 'acuerdos',
      sessionId: 'sess-1',
      idempotencyKey: 'k-both',
    })
    expect(both.ok).toBe(true)
    expect(both.pending_op_ids).toHaveLength(2)
  })

  it('dedupes prepare by idempotency_key', async () => {
    const store = {
      rows: [
        {
          id: 'existing-wa',
          usuario_id: 'user-1',
          session_id: 'sess-1',
          tool: 'whatsapp_prepare_send',
          status: 'pending',
          payload: { idempotency_key: 'same-key', incomplete: true, purpose: 'hola' },
          preview: { title: 'WhatsApp', summary: 'hola', workspace: { kind: 'whatsapp' } },
        },
      ] as Array<Record<string, unknown>>,
    }
    const actor = makeActor(store)
    const again = await mutateVoiceWorkspaceDraft(actor, {
      action: 'prepare',
      channel: 'whatsapp',
      purpose: 'hola',
      sessionId: 'sess-1',
      idempotencyKey: 'same-key',
    })
    expect(again.pending_op_id).toBe('existing-wa')
    expect(again.pending_op_ids).toEqual(['existing-wa'])
  })

  it('prepares two distinct drafts on the same channel with different keys', async () => {
    const actor = makeActor({ rows: [] })
    const a = await mutateVoiceWorkspaceDraft(actor, {
      action: 'prepare',
      channel: 'email',
      purpose: 'para Carlos',
      sessionId: 'sess-1',
      idempotencyKey: 'mail-1',
    })
    const b = await mutateVoiceWorkspaceDraft(actor, {
      action: 'prepare',
      channel: 'email',
      purpose: 'para Mariana',
      sessionId: 'sess-1',
      idempotencyKey: 'mail-2',
    })
    expect(a.pending_op_id).not.toBe(b.pending_op_id)
  })

  it('updates recipient on the same pending_op_id', async () => {
    const store = {
      rows: [
        {
          id: 'op-mail',
          usuario_id: 'user-1',
          session_id: 'sess-1',
          tool: 'gmail_prepare_send',
          status: 'pending',
          payload: {
            incomplete: true,
            purpose: 'acuerdos',
            recipient_hint: 'Carlos',
            draft_kind: 'email',
          },
          preview: { title: 'Correo', summary: 'acuerdos', workspace: { kind: 'email', incomplete: true } },
        },
      ] as Array<Record<string, unknown>>,
    }
    const actor = makeActor(store)
    const updated = await mutateVoiceWorkspaceDraft(actor, {
      action: 'update',
      channel: 'email',
      purpose: 'acuerdos',
      recipient: 'Mariana',
      sessionId: 'sess-1',
      pendingOpId: 'op-mail',
    })
    expect(updated.ok).toBe(true)
    expect(updated.pending_op_id).toBe('op-mail')
    expect((store.rows[0].payload as { recipient_hint: string }).recipient_hint).toBe('Mariana')
  })

  it('cancels a draft so it will not be filled later', async () => {
    const store = {
      rows: [
        {
          id: 'op-wa',
          usuario_id: 'user-1',
          session_id: 'sess-1',
          tool: 'whatsapp_prepare_send',
          status: 'pending',
          payload: { incomplete: true, purpose: 'avisar' },
          preview: { title: 'WhatsApp' },
        },
      ] as Array<Record<string, unknown>>,
    }
    const actor = makeActor(store)
    const cancelled = await mutateVoiceWorkspaceDraft(actor, {
      action: 'cancel',
      channel: 'whatsapp',
      purpose: 'avisar',
      sessionId: 'sess-1',
      pendingOpId: 'op-wa',
    })
    expect(cancelled.ok).toBe(true)
    expect(store.rows[0].status).toBe('cancelled')
  })

  it('requires purpose on prepare', async () => {
    const actor = makeActor({ rows: [] })
    const result = await mutateVoiceWorkspaceDraft(actor, {
      action: 'prepare',
      channel: 'email',
      purpose: '',
      sessionId: 'sess-1',
    })
    expect(result.ok).toBe(false)
    expect(result.spoken).toMatch(/proposito/i)
  })
})
