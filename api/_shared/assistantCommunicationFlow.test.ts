import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchCopilotTool, confirmPendingOp } from './assistantOpsRuntime.js'
import { executeWhatsappWrite, readWhatsappStatus } from './assistantCommunicationDrafts.js'
import { createServiceRoleClient } from './assistantAuth.js'
import { withContentHash } from './workspaceHash.js'
import type { CopilotActor } from './assistantPending.js'
import { executeDailySummaryUpdate, readDailySummary } from './assistantDailySummary.js'

vi.mock('./assistantAuth.js', () => ({ createServiceRoleClient: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function query(data: unknown) {
  const result = { data, error: null }
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

function actorFrom(from: (table: string) => unknown, extra?: Partial<CopilotActor>): CopilotActor {
  return {
    supabase: { from } as never,
    usuarioId: 'actor',
    authUserId: 'auth',
    accessToken: 'verified-session',
    rol: 'Direccion',
    ...extra,
  }
}

describe('Action email from Retell', () => {
  it('uses the Kanban recipient, action and checklist without a personal Google connection', async () => {
    const pending = query({ id: 'email-operation', expires_at: '2999-01-01' })
    const checkpoints = query([{ texto: 'Comparar existencias' }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const actor = actorFrom((table) => ({
      acciones_diarias: query({
        id: 'action',
        titulo_accion: 'Revisar inventario',
        responsable: 'recipient',
        fecha: '2026-11-18',
        hora_limite: '16:00',
        updated_at: '2026-11-17T12:00:00Z',
      }),
      accion_checkpoints: checkpoints,
      usuarios: query([{ id: 'recipient', nombre: 'Jorge Neri' }]),
      assistant_pending_ops: pending,
      assistant_op_log: query(null),
    })[table], { voiceChannel: true, guideSessionId: 'session-1', accessToken: undefined })

    const result = await dispatchCopilotTool(actor, 'notify_action_email', {
      action_id: 'action',
      mensaje: 'Confirma el avance.',
    })
    expect(result.proposal?.workspace?.to).toEqual(['Jorge Neri'])
    expect(checkpoints.eq).toHaveBeenCalledWith('activo', true)
    expect(pending.insert).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'retell',
      session_id: 'session-1',
      tool: 'notify_action_email',
      payload: expect.objectContaining({
        usuario_id: 'recipient',
        email_payload: expect.objectContaining({
          accion_id: 'action',
          checklist: ['Comparar existencias'],
          mensaje: 'Confirma el avance.',
        }),
      }),
    }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('WhatsApp communication flow', () => {
  it.each(['web', 'retell'])('persists the same preview from %s with the recipient’s overdue actions', async (channel) => {
    const people = query([{ id: 'recipient', nombre: 'Jorge Neri' }])
    const identity = query({ external_user_id: '5215512345678' })
    const actions = query([
      { id: 'action-overdue', titulo_accion: 'Revisar inventario', fecha: '2021-01-01', estado: 'Retraso' },
      { id: 'action-future', titulo_accion: 'Acción futura', fecha: '2999-01-01', estado: 'Pendiente' },
    ])
    const pending = query({ id: 'operation', expires_at: '2999-01-01' })
    vi.mocked(createServiceRoleClient).mockReturnValue({ from: () => identity } as never)
    const actor = actorFrom((table) => ({
      usuarios: people,
      user_channel_identities: identity,
      acciones_diarias: actions,
      assistant_pending_ops: pending,
      assistant_op_log: query(null),
    })[table], channel === 'retell'
      ? { voiceChannel: true, guideSessionId: 'session-1', accessToken: undefined }
      : { requestId: 'turn-1' })

    const result = await dispatchCopilotTool(actor, 'whatsapp_prepare_send', {
      recipient: 'Jorge',
      include_overdue: true,
    })

    expect(result.kind).toBe('proposal')
    expect(result.proposal?.workspace?.body).toContain('Revisar inventario')
    expect(result.proposal?.workspace?.body).not.toContain('action-overdue')
    expect(result.proposal?.workspace?.body).not.toContain('Acción futura')
    expect(actions.eq).toHaveBeenCalledWith('responsable', 'recipient')
    expect(pending.insert).toHaveBeenCalledWith(expect.objectContaining({
      channel,
      request_key: expect.any(String),
      ...(channel === 'retell' ? { session_id: 'session-1' } : {}),
      payload: expect.objectContaining({ action_ids: ['action-overdue'] }),
    }))
  })

  it('requires authenticated approval and blocks a model from approving on behalf of the user', async () => {
    const row = query({ usuario_id: 'actor', tool: 'whatsapp_prepare_send', status: 'pending' })
    await expect(confirmPendingOp(actorFrom(() => row), 'operation', { fromTool: true }))
      .rejects.toThrow('PERMISSION_DENIED')
    await expect(confirmPendingOp(actorFrom(() => row, { accessToken: undefined }), 'operation'))
      .rejects.toThrow('PERMISSION_DENIED')
    expect(row.update).not.toHaveBeenCalled()
  })

  it('reports provider acceptance and reuses the existing attempt on a retry', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'test-phone')
    const fetchMock = vi.fn(async () => Response.json({ messages: [{ id: 'meta-id' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const attempt = query({ id: 'message-log' })
    const attempts = [query(null), attempt, attempt, query({ meta_message_id: 'meta-id', delivery_status: 'sent' })]
    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: (table: string) => table === 'whatsapp_messages'
        ? attempts.shift()
        : table === 'user_channel_identities'
          ? query({ external_user_id: '5215512345678' })
          : query([{ id: 'inbound' }]),
    } as never)
    const actor = actorFrom(() => query({ id: 'recipient' }))
    const payload = withContentHash({
      to_user_id: 'recipient', to_phone: '5215512345678', body: 'Mensaje aprobado',
    })
    for (let i = 0; i < 2; i += 1) {
      await expect(executeWhatsappWrite(actor, payload, 'operation')).resolves.toMatchObject({
        meta_message_id: 'meta-id', delivery_status: 'accepted',
      })
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(attempt.insert).toHaveBeenCalledWith(expect.objectContaining({
      client_request_id: 'guide-comm:operation', delivery_status: 'queued',
    }))
  })

  it('claims a reviewed WhatsApp, persists acceptance and returns the same result after confirmation', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'test-phone')
    const fetchMock = vi.fn(async () => Response.json({ messages: [{ id: 'meta-id' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const attempts = [query(null), query({ id: 'message-log' }), query(null)]
    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: (table: string) => table === 'whatsapp_messages'
        ? attempts.shift()
        : table === 'user_channel_identities'
          ? query({ external_user_id: '5215512345678' })
          : query([{ id: 'inbound' }]),
    } as never)
    const payload = withContentHash({
      to_user_id: 'recipient', to_phone: '5215512345678', body: 'Revisión final',
    })
    const pending = {
      id: 'operation', usuario_id: 'actor', status: 'pending', tool: 'whatsapp_prepare_send',
      expires_at: '2999-01-01', payload,
    }
    const claim = query({ id: 'operation' })
    const complete = query({ id: 'operation' })
    const accepted = { id: 'meta-id', meta_message_id: 'meta-id', delivery_status: 'accepted' }
    const rows = [query(pending), claim, complete, query({ ...pending, status: 'confirmed', result: accepted })]
    const actor = actorFrom((table) => table === 'assistant_pending_ops'
      ? rows.shift()
      : query({ id: 'recipient' }))
    await expect(confirmPendingOp(actor, 'operation')).resolves.toMatchObject({ status: 'confirmed', result: accepted })
    await expect(confirmPendingOp(actor, 'operation')).resolves.toMatchObject({ status: 'confirmed', result: accepted })
    expect(claim.eq).toHaveBeenCalledWith('status', 'pending')
    expect(claim.eq).toHaveBeenCalledWith('payload', JSON.stringify(payload))
    expect(complete.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed', result: accepted }))
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('keeps a timeout attempt queued and prevents a second provider request', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'test-phone')
    const fetchMock = vi.fn(async () => { throw new Error('connection lost') })
    vi.stubGlobal('fetch', fetchMock)
    const attempts = [query(null), query({ id: 'message-log' }), query({ delivery_status: 'queued' })]
    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: (table: string) => table === 'whatsapp_messages'
        ? attempts.shift()
        : table === 'user_channel_identities'
          ? query({ external_user_id: '5215512345678' })
          : query([{ id: 'inbound' }]),
    } as never)
    const actor = actorFrom(() => query({ id: 'recipient' }))
    const payload = withContentHash({
      to_user_id: 'recipient', to_phone: '5215512345678', body: 'Mensaje aprobado',
    })
    await expect(executeWhatsappWrite(actor, payload, 'operation')).rejects.toThrow('TIMEOUT')
    await expect(executeWhatsappWrite(actor, payload, 'operation')).rejects.toThrow('Ya existe un intento')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns delivery confirmation only when recorded by the provider', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: () => query({ delivery_status: 'delivered', delivered_at: '2026-11-17T17:00:00Z' }),
    } as never)
    const operations = query({ status: 'confirmed' })
    await expect(readWhatsappStatus(actorFrom(() => operations), 'operation')).resolves.toMatchObject({
      operation_status: 'confirmed',
      attempt: { delivery_status: 'delivered' },
    })
    expect(operations.eq).toHaveBeenCalledWith('usuario_id', 'actor')
  })
})

describe('Daily action summary', () => {
  const settings = {
    enabled: true,
    send_time: '08:00:00',
    timezone: 'America/Mexico_City',
    send_days: 'weekdays',
    recipient_mode: 'all_active',
    selected_usuario_ids: [],
    send_if_no_pending: false,
  }

  function manager(from: (table: string) => unknown) {
    return actorFrom(from, {
      supabase: { from, rpc: vi.fn(async () => ({ data: true, error: null })) } as never,
    })
  }

  it('uses the existing settings and log tables, without invoking the scheduler', async () => {
    const history = query([{ status: 'sent', target_date: '2026-11-17' }])
    const actor = manager((table) => table === 'daily_action_summary_settings' ? query(settings) : history)
    await expect(readDailySummary(actor, true)).resolves.toEqual({
      settings,
      attempts: [{ status: 'sent', target_date: '2026-11-17' }],
    })
    expect(history.eq).toHaveBeenCalledWith('is_test', false)
  })

  it('proposes a pause without modifying the global settings', async () => {
    const current = query(settings)
    const pending = query({ id: 'pause', expires_at: '2999-01-01' })
    const actor = manager((table) => table === 'daily_action_summary_settings' ? current : pending)
    await expect(dispatchCopilotTool(actor, 'update_daily_action_summary', { enabled: false }))
      .resolves.toMatchObject({ kind: 'proposal', proposal: { id: 'pause' } })
    expect(current.update).not.toHaveBeenCalled()
    expect(pending.insert).toHaveBeenCalledWith(expect.objectContaining({
      payload: { patch: { enabled: false }, before: settings },
    }))
  })

  it('rejects invalid timezone and stale approvals, and compares the config on update', async () => {
    const write = query({ id: 'default' })
    const tables = [query(settings), query(settings), query(settings), write]
    const actor = manager(() => tables.shift())
    await expect(executeDailySummaryUpdate(actor, { before: settings, patch: { timezone: 'Fake/TZ' } }))
      .rejects.toThrow('VALIDATION_FAILED')
    await expect(executeDailySummaryUpdate(actor, { before: { ...settings, enabled: false }, patch: { enabled: true } }))
      .rejects.toThrow('cambió después')
    await expect(executeDailySummaryUpdate(actor, { before: settings, patch: { enabled: false } }))
      .resolves.toMatchObject({ id: 'default' })
    expect(write.update).toHaveBeenCalledWith({ enabled: false, updated_by: 'actor' })
    expect(write.eq).toHaveBeenCalledWith('enabled', true)
  })
})
