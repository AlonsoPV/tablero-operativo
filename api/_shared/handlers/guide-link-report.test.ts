import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './guide-link-report.js'
import { createServiceRoleClient, requireAssistantAuth } from '../assistantAuth.js'

vi.mock('../assistantAuth.js', () => ({
  createServiceRoleClient: vi.fn(),
  readAuthToken: (req: { headers?: Record<string, string> }) => req.headers?.authorization ?? null,
  requireAssistantAuth: vi.fn(),
}))
vi.mock('../guideUserLinks.js', () => ({
  resolveGuideLinkOwner: vi.fn(async () => ({ usuario_id: 'owner', link_id: 'invite' })),
}))

function request(token?: string, action = 'status') {
  return handler.fetch(new Request('https://example.test/api/guide-link-report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ guide_token: 'link-token', call_id: 'call-1', action }),
  }))
}

describe('Operations on an invitation report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const rows: Record<string, unknown> = {
      guide_sessions: { id: 'session', usuario_id: 'owner', guide_link_id: 'invite', report_status: 'ready' },
      guide_journal_entries: null,
      assistant_pending_ops: [
        { id: 'wa-draft', tool: 'whatsapp_prepare_send', status: 'pending', preview: {} },
        {
          id: 'mail-draft',
          tool: 'notify_action_email',
          status: 'pending',
          preview: { workspace: { kind: 'email', recipientName: 'Jorge Neri', to: ['jorge@example.test'] } },
        },
      ],
    }
    vi.mocked(createServiceRoleClient).mockReturnValue({
      from(table: string) {
        const result = { data: rows[table], error: null }
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          maybeSingle: async () => result,
          order: async () => result,
        }
        return query
      },
    } as never)
  })

  it('returns both draft types with read-only access for a public link', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      can_manage_communications: false,
      communications: [{ id: 'wa-draft' }, { id: 'mail-draft', workspace: { to: ['Jorge Neri'] } }],
    })
    expect(requireAssistantAuth).not.toHaveBeenCalled()
  })

  it.each([['owner', true], ['other-user', false]])('enables the shared review controls for the owner only (%s)', async (usuarioId, allowed) => {
    vi.mocked(requireAssistantAuth).mockResolvedValue({ ok: true, usuarioId } as never)
    const response = await request('token')
    expect(await response.json()).toMatchObject({
      can_manage_communications: allowed,
      communications: [{ id: 'wa-draft' }, { workspace: { to: [allowed ? 'jorge@example.test' : 'Jorge Neri'] } }],
    })
  })

  it('keeps the public report endpoint read-only for approvals', async () => {
    const response = await request(undefined, 'confirm_pending')
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'LOGIN_REQUIRED' })
  })
})
