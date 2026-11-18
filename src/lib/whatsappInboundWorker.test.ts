import { createHmac } from 'node:crypto'
import { build } from 'esbuild'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const settings = new Map([
  ['SUPABASE_URL', 'https://example.supabase.test'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'service-test'],
  ['WHATSAPP_APP_SECRET', 'app-test'],
  ['WHATSAPP_ACCESS_TOKEN', 'access-test'],
  ['WHATSAPP_PHONE_NUMBER_ID', 'phone-test'],
  ['WHATSAPP_WABA_ID', 'waba-test'],
  ['WHATSAPP_DISPATCHER_SECRET', 'dispatcher-test'],
])
type Body = Record<string, unknown>
type Event = { key: string; sender: string; kind: string; payload: Body }
type Job = Event & { id: string; event_key: string; attempts: number; lease_token: string; effect: boolean; status: string }
let code: string

beforeAll(async () => {
  const result = await build({
    entryPoints: ['supabase/functions/whatsapp-webhook/index.ts'],
    bundle: true,
    platform: 'neutral',
    format: 'cjs',
    external: ['npm:*'],
    write: false,
  })
  code = result.outputFiles[0].text
})

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function harness() {
  const jobs = new Map<string, Job>()
  const receipts = new Map<string, Body>()
  const finishes: Body[] = []
  const linkedUser = { id: 'identity-id', usuario_id: 'user-id', external_user_id: '5215551234567' }
  let linked = true
  let failActionsOnce = false
  let handler!: (request: Request) => Promise<Response>

  function from(table: string) {
    let operation = 'select'
    let payload: Body = {}
    const filters: Body = {}
    const run = () => {
      if (table === 'external_inbound_messages') {
        if (operation === 'insert') {
          const id = String(payload.external_update_id)
          if (receipts.has(id)) return { error: { code: '23505' } }
          receipts.set(id, payload.payload as Body)
        } else return { data: { payload: receipts.get(String(filters.external_update_id)) } }
      }
      if (table === 'user_channel_identities' && operation === 'select') {
        return { data: linked ? [linkedUser] : [] }
      }
      if (table === 'usuarios') return { data: { id: linkedUser.usuario_id, activo: true } }
      if (table === 'acciones_diarias') {
        expect(filters.responsable).toBe(linkedUser.usuario_id)
        if (failActionsOnce) {
          failActionsOnce = false
          return { error: { code: '57014' } }
        }
        return { data: [{ id: 'action-id', titulo_accion: 'Revisar inventario', estado: 'Pendiente', fecha: '2026-11-17' }] }
      }
      return { data: null, error: null }
    }
    const builder = {
      select: () => builder,
      update: () => { operation = 'update'; return builder },
      insert: (row: Body) => { operation = 'insert'; payload = row; return builder },
      eq: (column: string, value: unknown) => { filters[column] = value; return builder },
      or: () => builder,
      in: () => builder,
      not: () => builder,
      lt: () => builder,
      gt: () => builder,
      gte: () => builder,
      limit: () => builder,
      order: () => builder,
      maybeSingle: () => builder,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    }
    return builder
  }

  const rpc = vi.fn(async (name: string, args: Body = {}) => {
    if (name === 'whatsapp_enqueue_inbound') {
      for (const event of args.p_events as Event[]) {
        if (!jobs.has(event.key)) {
          jobs.set(event.key, {
            ...event, id: `job-${jobs.size + 1}`, event_key: event.key, attempts: 0,
            lease_token: 'lease-test', effect: false, status: 'pending',
          })
        }
      }
    }
    if (name === 'whatsapp_claim_inbound') {
      const job = [...jobs.values()].find((item) => item.status === 'pending')
      if (!job) return { data: [], error: null }
      job.status = 'processing'
      job.attempts += 1
      return { data: [job], error: null }
    }
    if (name === 'whatsapp_apply_action') {
      return {
        data: { ok: true, accionId: args.p_accion, askResult: true, resultLabel: 'Realizada' },
        error: null,
      }
    }
    const job = [...jobs.values()].find((item) => item.id === args.p_id)
    if (name === 'whatsapp_mark_effect' && job) job.effect = true
    if (name === 'whatsapp_release_rejected_inbound_reply' && job) job.effect = false
    if (name === 'whatsapp_finish_inbound' && job) {
      finishes.push(args)
      job.status = args.p_ok ? 'done' : job.effect ? 'review' : 'waiting'
    }
    return { data: null, error: null }
  })
  const fetchMock = vi.fn(async (_url: string, _options: RequestInit) =>
    Response.json({ messages: [{ id: 'wamid.reply' }] }))
  vi.stubGlobal('fetch', fetchMock)
  new Function('require', 'Deno', code)(
    () => ({ createClient: () => ({ from, rpc }) }),
    { env: { get: (key: string) => settings.get(key) }, serve: (serve: typeof handler) => { handler = serve } }
  )
  const runWorker = () => handler(new Request('https://example.test/?worker=1', {
    method: 'POST', headers: { 'x-dispatcher-secret': 'dispatcher-test' },
  }))
  const webhook = (message: Body, field = 'messages') => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-test', changes: [{
        field: 'messages',
        value: { metadata: { phone_number_id: 'phone-test' }, [field]: [message] },
      }] }],
    })
    return handler(new Request('https://example.test/', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'app-test').update(body).digest('hex') },
    }))
  }
  return {
    jobs, receipts, finishes, fetchMock, rpc, runWorker, webhook,
    unlink: () => { linked = false },
    failNextActionRead: () => { failActionsOnce = true },
  }
}

const message = { id: 'wamid.in', from: '5215551234567' }

describe('WhatsApp Edge webhook and worker', () => {
  it.each([
    [{ type: 'text', text: { body: 'Hola' } }, 'Hola. Soy el asistente'],
    [{ type: 'text', text: { body: 'Mis acciones' } }, 'Revisar inventario'],
    [{ type: 'button', button: { payload: 'consultar_acciones', text: 'Consultar acciones' } }, 'Revisar inventario'],
    [{ type: 'interactive', interactive: { button_reply: { id: 'wa:mine', title: 'Mis acciones' } } }, 'Revisar inventario'],
    [{ type: 'interactive', interactive: { list_reply: { id: 'wa:overdue', title: 'Vencidas' } } }, 'Revisar inventario'],
  ])('responds to an incoming $type event only after durable intake', async (input, expected) => {
    const test = harness()
    expect((await test.webhook({ ...message, ...input })).status).toBe(200)
    expect(test.fetchMock).not.toHaveBeenCalled()
    expect((await test.runWorker()).status).toBe(200)
    expect(test.fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(String(test.fetchMock.mock.calls[0]?.[1].body)).text.body).toContain(expected)
    expect(test.finishes[0]?.p_ok).toBe(true)
  })

  it('keeps duplicate Meta deliveries to one job and one reply', async () => {
    const test = harness()
    const input = { ...message, type: 'text', text: { body: 'Hola' } }
    await test.webhook(input)
    await test.webhook(input)
    await test.runWorker()
    expect(test.jobs.size).toBe(1)
    expect(test.fetchMock).toHaveBeenCalledOnce()
  })

  it('resumes the job after a failure that happened after saving the inbound receipt', async () => {
    const test = harness()
    test.failNextActionRead()
    await test.webhook({ ...message, type: 'text', text: { body: 'Mis acciones' } })
    await test.runWorker()
    expect(test.receipts.has(message.id)).toBe(true)
    expect(test.finishes[0]).toMatchObject({ p_ok: false, p_error: 'database_57014' })
    expect(test.fetchMock).not.toHaveBeenCalled()
    const job = test.jobs.get(`message:${message.id}`)!
    expect(job.effect).toBe(false)
    job.status = 'pending'
    await test.runWorker()
    expect(test.fetchMock).toHaveBeenCalledOnce()
    expect(test.finishes[1]?.p_ok).toBe(true)
  })

  it('asks an unlinked user to link their number without querying actions', async () => {
    const test = harness()
    test.unlink()
    await test.webhook({ ...message, type: 'text', text: { body: 'Mis acciones' } })
    await test.runWorker()
    expect(JSON.parse(String(test.fetchMock.mock.calls[0]?.[1].body)).text.body).toContain('vincular este número')
  })

  it('processes statuses without sending an inbound reply', async () => {
    const test = harness()
    await test.webhook({ id: 'wamid.out', recipient_id: message.from, status: 'read', timestamp: '1794931200' }, 'statuses')
    await test.runWorker()
    expect(test.finishes[0]?.p_ok).toBe(true)
    expect(test.fetchMock).not.toHaveBeenCalled()
  })

  it('routes a reminder button to the authorized Kanban operation and replies once', async () => {
    const test = harness()
    const actionId = '00000000-0000-0000-0000-000000000001'
    await test.webhook({
      ...message,
      type: 'interactive',
      interactive: { button_reply: { id: `act:${actionId}:done`, title: 'Realizada' } },
    })
    await test.runWorker()
    expect(test.rpc).toHaveBeenCalledWith('whatsapp_apply_action', expect.objectContaining({
      p_event: 'job-1', p_usuario: 'user-id', p_accion: actionId, p_action: 'done',
    }))
    expect(test.fetchMock).toHaveBeenCalledOnce()
    expect(test.finishes[0]?.p_ok).toBe(true)
  })

  it('retains uncertain Graph failures for review and never confirms a reply', async () => {
    const test = harness()
    test.fetchMock.mockResolvedValueOnce(Response.json({ error: {} }, { status: 502 }))
    await test.webhook({ ...message, type: 'text', text: { body: 'Hola' } })
    await test.runWorker()
    await test.runWorker()
    expect(test.fetchMock).toHaveBeenCalledOnce()
    expect(test.finishes[0]).toMatchObject({ p_ok: false, p_error: 'provider_http_502' })
    expect(test.jobs.get(`message:${message.id}`)?.status).toBe('review')
  })

  it('retries a confirmed rate limit without replaying an accepted reply', async () => {
    const test = harness()
    test.fetchMock.mockResolvedValueOnce(Response.json({ error: {} }, { status: 429 }))
    await test.webhook({ ...message, type: 'text', text: { body: 'Hola' } })
    await test.runWorker()
    const job = test.jobs.get(`message:${message.id}`)!
    expect(job.status).toBe('waiting')
    expect(test.finishes[0]).toMatchObject({ p_ok: false, p_error: 'provider_http_429' })
    job.status = 'pending'
    await test.runWorker()
    expect(test.fetchMock).toHaveBeenCalledTimes(2)
    expect(test.finishes[1]?.p_ok).toBe(true)
  })
})
