import { describe, expect, it } from 'vitest'
import { resolveCommunicationRecipient } from './resolveCommunicationRecipient.js'

function makeSupabase(
  people: Array<Record<string, unknown>>,
  opts?: {
    phoneByUser?: Record<string, string>
    emailByUser?: Record<string, string>
  }
) {
  return {
    from: (table: string) => {
      if (table === 'usuarios') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: people, error: null }),
            }),
          }),
        }
      }
      if (table === 'user_channel_identities') {
        const filters: Record<string, string> = {}
        const chain: Record<string, unknown> = {
          eq: (key: string, value: string) => {
            filters[key] = value
            return chain
          },
          maybeSingle: async () => {
            const usuarioId = filters.usuario_id
            const phone = usuarioId ? opts?.phoneByUser?.[usuarioId] : undefined
            return {
              data: phone ? { external_user_id: phone, status: 'active' } : null,
              error: null,
            }
          },
        }
        return {
          select: () => chain,
        }
      }
      return {}
    },
    rpc: async (_name: string, args: { p_usuario_id: string }) => ({
      data: opts?.emailByUser?.[args.p_usuario_id] ?? null,
      error: null,
    }),
  }
}

describe('resolveCommunicationRecipient', () => {
  it('matches a unique person by name', async () => {
    const supabase = makeSupabase(
      [{ id: 'u1', nombre: 'Carlos Pérez', rol: 'Analista', area: 'Ops', activo: true }],
      { phoneByUser: { u1: '5215512345678' } }
    )
    const resolved = await resolveCommunicationRecipient(supabase as never, 'Carlos', 'whatsapp')
    expect(resolved.toUserId).toBe('u1')
    expect(resolved.phone).toBe('5215512345678')
    expect(resolved.needsInfoReason).toBeNull()
  })

  it('matches unique role/area hint', async () => {
    const supabase = makeSupabase(
      [
        { id: 'u2', nombre: 'Ana', rol: 'Responsable', area: 'Operaciones', activo: true },
        { id: 'u3', nombre: 'Luis', rol: 'Analista', area: 'Comercial', activo: true },
      ],
      { phoneByUser: { u2: '5215599999999' } }
    )
    const resolved = await resolveCommunicationRecipient(
      supabase as never,
      'el responsable de operaciones',
      'whatsapp'
    )
    expect(resolved.toUserId).toBe('u2')
    expect(resolved.name).toBe('Ana')
  })

  it('marks team hints as needs_info', async () => {
    const supabase = makeSupabase([
      { id: 'u1', nombre: 'A', rol: 'X', area: 'Comercial', activo: true },
    ])
    const resolved = await resolveCommunicationRecipient(
      supabase as never,
      'el equipo comercial',
      'whatsapp'
    )
    expect(resolved.ambiguous).toBe(true)
    expect(resolved.needsInfoReason).toMatch(/grupo|persona concreta/i)
  })

  it('marks ambiguous name matches', async () => {
    const supabase = makeSupabase([
      { id: 'u1', nombre: 'Carlos A', rol: null, area: null, activo: true },
      { id: 'u2', nombre: 'Carlos B', rol: null, area: null, activo: true },
    ])
    const resolved = await resolveCommunicationRecipient(supabase as never, 'Carlos', 'whatsapp')
    expect(resolved.ambiguous).toBe(true)
    expect(resolved.toUserId).toBeNull()
  })

  it('resolves email channel via rpc', async () => {
    const supabase = makeSupabase(
      [{ id: 'u1', nombre: 'Mariana', rol: 'Director', area: null, activo: true }],
      { emailByUser: { u1: 'mariana@empresa.com' } }
    )
    const resolved = await resolveCommunicationRecipient(supabase as never, 'Mariana', 'email')
    expect(resolved.email).toBe('mariana@empresa.com')
    expect(resolved.needsInfoReason).toBeNull()
  })
})
