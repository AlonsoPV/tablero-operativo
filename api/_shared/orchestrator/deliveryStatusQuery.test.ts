import { describe, expect, it } from 'vitest'
import { matchDeliveryStatusQuery, queryDeliveryStatusForActor } from './deliveryStatusQuery.js'
import type { AgentActor } from '../query/resolveActor.js'

function mockActor(tables: Record<string, Array<Record<string, unknown>>>): AgentActor {
  const makeQuery = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]))
        return chain
      },
      gte: () => chain,
      order: () => chain,
      limit: () => chain,
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    }
    return chain
  }
  return {
    authUserId: 'auth-1',
    usuarioId: 'user-1',
    rol: 'super_admin',
    roleClass: 'super_admin',
    channel: 'whatsapp',
    sessionId: 'sess-1',
    project: 'test',
    boardScope: 'role',
    capabilities: {} as AgentActor['capabilities'],
    copilot: {
      supabase: { from: makeQuery } as unknown as AgentActor['copilot']['supabase'],
      usuarioId: 'user-1',
      authUserId: 'auth-1',
      rol: 'super_admin',
    },
  }
}

describe('deliveryStatusQuery (on-demand delivery status)', () => {
  it('matches natural Spanish delivery status questions and ignores send commands', () => {
    expect(matchDeliveryStatusQuery('¿Ya se envió?')).toEqual({})
    expect(matchDeliveryStatusQuery('¿Le llegó a Gerardo?')).toEqual({ recipientHint: 'gerardo' })
    expect(matchDeliveryStatusQuery('¿Se mandó el correo?')).toEqual({ channel: 'email' })
    expect(matchDeliveryStatusQuery('¿Qué mensajes envié hoy?')).toEqual({
      channel: 'whatsapp',
      todayOnly: true,
    })
    expect(matchDeliveryStatusQuery('¿Hubo algún problema?')).toEqual({ problemsOnly: true })
    expect(matchDeliveryStatusQuery('Envíame un correo a Alonso Perez con mis pendientes')).toBeNull()
  })

  it('reports real DB evidence honestly without fabricating delivery confirmation', async () => {
    const actor = mockActor({
      assistant_pending_ops: [
        {
          id: 'op-wa-1',
          tool: 'whatsapp_prepare_send',
          status: 'confirmed',
          created_at: '2026-11-26T20:00:00Z',
          preview: { workspace: { recipientName: 'Gerardo Puga' } },
          result: { meta_message_id: 'wamid.1', delivery_status: 'accepted' },
        },
        {
          id: 'op-mail-1',
          tool: 'notify_user_email',
          status: 'confirmed',
          created_at: '2026-11-26T19:00:00Z',
          preview: { workspace: { recipientName: 'Alonso Perez' } },
          result: { email_id: 'gmail-1', delivery_status: 'accepted' },
        },
      ],
      whatsapp_messages: [
        {
          meta_message_id: 'wamid.1',
          delivery_status: 'delivered',
          delivered_at: '2026-11-26T20:00:03Z',
        },
      ],
      notification_email_logs: [
        {
          email_id: 'gmail-1',
          status: 'sent',
          created_at: '2026-11-26T19:00:02Z',
        },
      ],
    })

    const gerardo = await queryDeliveryStatusForActor(actor, { recipientHint: 'gerardo' })
    expect(gerardo.answer).toContain('fue entregado')
    expect(gerardo.answer).toContain('Gerardo Puga')

    const mail = await queryDeliveryStatusForActor(actor, { channel: 'email' })
    expect(mail.answer).toContain('fue enviado')
    expect(mail.answer).toContain('sin confirmación de lectura')
    expect(mail.answer).not.toContain('fue entregado')

    const problems = await queryDeliveryStatusForActor(actor, { problemsOnly: true })
    expect(problems.answer).toContain('No encontré fallos')
  })
})
