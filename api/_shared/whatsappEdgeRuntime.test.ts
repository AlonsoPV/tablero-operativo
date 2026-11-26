import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
const user = '00000000-0000-0000-0000-000000000001',
  action = '10000000-0000-0000-0000-000000000001',
  phone = '15550002222'
// Execute the deployed Edge source (not a mirrored implementation) with network/DB adapters replaced.
const source = readFileSync(
  'supabase/functions/whatsapp-webhook/index.ts',
  'utf8'
).replace(/^import .*createClient.*\r?\n/m, '')
const compiled = ts.transpileModule(source, {
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
})
if (compiled.diagnostics?.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(compiled.diagnostics, {
  getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (f) => f, getNewLine: () => '\n',
}))
const js = compiled.outputText
function database(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    usuarios: [{ id: user, activo: true }],
    user_channel_identities: [
      {
        id: 'identity',
        usuario_id: user,
        external_user_id: phone,
        channel: 'whatsapp',
        status: 'active',
      },
    ],
    acciones_diarias: [
      {
        id: action,
        responsable: user,
        created_by: user,
        titulo_accion: 'Atender cliente',
        estado: 'Pendiente',
        fecha: '2026-01-01',
      },
    ],
    ...seed,
  }
  const calls: any[] = []
  const db: any = {
    tables,
    calls,
    rpc: vi.fn(async (name: string, args: any) => {
      calls.push({ rpc: name, args })
      return {
        data: name === 'can_use_ai_whatsapp_for_usuario' ? false : null,
        error: null,
      }
    }),
    from: (table: string) => {
      let filters: ((r: any) => boolean)[] = [],
        write: string | undefined,
        values: any,
        limit = Infinity,
        single = false,
        sort: string | undefined,
        ascending = true
      const b: any = {
        select: () => b,
        eq: (k: string, v: any) => {
          filters.push((r) => r[k] === v)
          return b
        },
        neq: (k: string, v: any) => {
          filters.push((r) => r[k] !== v)
          return b
        },
        in: (k: string, v: any[]) => {
          filters.push((r) => v.includes(r[k]))
          return b
        },
        not: (k: string, _op: string, v: string) => {
          filters.push((r) => !v.replace(/[()]/g, '').split(',').includes(r[k]))
          return b
        },
        gt: (k: string, v: any) => {
          filters.push((r) => r[k] > v)
          return b
        },
        gte: (k: string, v: any) => {
          filters.push((r) => r[k] >= v)
          return b
        },
        lt: (k: string, v: any) => {
          filters.push((r) => r[k] < v)
          return b
        },
        or: () => b,
        order: (k: string, o: any) => {
          sort = k
          ascending = o?.ascending !== false
          return b
        },
        limit: (n: number) => {
          limit = n
          return b
        },
        maybeSingle: () => {
          single = true
          return b
        },
        insert: (v: any) => {
          write = 'insert'
          values = v
          return b
        },
        upsert: (v: any) => {
          write = 'insert'
          values = v
          return b
        },
        update: (v: any) => {
          write = 'update'
          values = v
          return b
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve()
            .then(() => {
              const all = tables[table] ?? (tables[table] = [])
              let rows = all.filter((r) => filters.every((f) => f(r)))
              if (sort)
                rows.sort(
                  (a, b) =>
                    String(a[sort!]).localeCompare(String(b[sort!])) *
                    (ascending ? 1 : -1)
                )
              rows = rows.slice(0, limit)
              if (write === 'insert') {
                const entries = (Array.isArray(values) ? values : [values]).map(
                  (v) => ({
                    id: crypto.randomUUID(),
                    created_at: new Date().toISOString(),
                    ...v,
                  })
                )
                all.push(...entries)
                rows = entries
              }
              if (write === 'update')
                rows.forEach((r) => Object.assign(r, values))
              calls.push({ table, write, values })
              return { data: single ? (rows[0] ?? null) : rows, error: null }
            })
            .then(resolve, reject),
      }
      return b
    },
  }
  return db
}
function runtime(db: any) {
  let handler: any
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://db.test',
    SUPABASE_SERVICE_ROLE_KEY: 'test',
    WHATSAPP_ACCESS_TOKEN: 'test',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-test',
    WHATSAPP_AI_ENABLED: '0',
    WHATSAPP_DISPATCHER_SECRET: 'worker-test',
  }
  const exports = new Function(
    'Deno',
    'createClient',
    js +
      '\nreturn {processWhatsAppPayload,handleInboundCommand,findUsuarioByWa,graphSendMessage,checkedWorkerClient,workerContexts,runInboundWorker,replyAi};'
  )(
    {
      env: { get: (k: string) => env[k] },
      serve: (fn: any) => {
        handler = fn
      },
    },
    () => db
  )
  exports.workerContexts.set(db, {
    id: 'job-test',
    mark: vi.fn(),
    uncertain: false,
  })
  return { ...exports, handler, env }
}
function event(m: any) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'phone-test' },
              messages: [{ id: 'wamid.in', from: phone, type: 'text', ...m }],
            },
          },
        ],
      },
    ],
  }
}
let sends: any[] = []
beforeEach(() => {
  sends = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: any, init: any) => {
      sends.push(JSON.parse(init.body))
      return new Response(
        JSON.stringify({ messages: [{ id: 'wamid.out.' + sends.length }] }),
        { status: 200 }
      )
    })
  )
})
afterEach(() => vi.unstubAllGlobals())
describe('Edge WhatsApp real router/worker code', () => {
  it('rejects unauthenticated worker calls before accessing the queue', async () => {
    const db = database()
    expect((await runtime(db).runInboundWorker(new Request('https://test/?worker=1', {method: 'POST'}))).status).toBe(403)
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('claims a durable job, routes Hola, sends once and finishes with its lease', async () => {
    const db = database()
    db.rpc.mockImplementation(async (name: string) => ({data: name === 'whatsapp_claim_inbound' && db.rpc.mock.calls.filter((c: any[]) => c[0] === name).length === 1 ? [{id: 'job', lease_token: 'lease', attempts: 1, kind: 'message', sender: phone, payload: event({text: {body: 'Hola'}})}] : [], error: null}))
    const response = await runtime(db).runInboundWorker(new Request('https://test/?worker=1', {method: 'POST', headers: {'x-dispatcher-secret': 'worker-test'}}))
    expect(response.status).toBe(200)
    expect(sends).toHaveLength(1)
    expect(db.rpc).toHaveBeenCalledWith('whatsapp_finish_inbound', {p_id: 'job', p_lease: 'lease', p_ok: true, p_error: null})
  })
  it('does not answer a delivery status with another WhatsApp message', async () => {
    const db = database()
    await runtime(db).processWhatsAppPayload({entry: [{changes: [{value: {statuses: [{id: 'wamid.sent', recipient_id: phone, status: 'delivered', timestamp: '1794960000'}]}}]}]}, db)
    expect(sends).toHaveLength(0)
  })
  it('resolves only one active account and rejects ambiguous phone mappings', async () => {
    const db = database()
    const r = runtime(db)
    expect((await r.findUsuarioByWa(db, phone)).usuario_id).toBe(user)
    db.tables.user_channel_identities.push({
      ...db.tables.user_channel_identities[0],
      id: 'other',
    })
    expect(await r.findUsuarioByWa(db, phone)).toBeNull()
  })
  it('rejects inactive accounts', async () => {
    const db = database({ usuarios: [{ id: user, activo: false }] })
    expect(await runtime(db).findUsuarioByWa(db, phone)).toBeNull()
  })
  it('replies to an unknown account without calling AI', async () => {
    const db = database({ user_channel_identities: [] })
    await runtime(db).processWhatsAppPayload(
      event({ text: { body: 'Hola' } }),
      db
    )
    expect(sends[0].text.body).toContain('Necesitas vincular')
    expect(db.rpc).not.toHaveBeenCalledWith(
      'can_use_ai_whatsapp_for_usuario',
      expect.anything()
    )
  })
  it('Hola and template commands generate actual provider responses', async () => {
    const db = database(),
      r = runtime(db)
    await r.processWhatsAppPayload(event({ text: { body: 'Hola' } }), db)
    expect(sends[0].text.body).toContain('Mis acciones')
    await r.processWhatsAppPayload(
      event({
        type: 'button',
        button: { payload: 'wa:mine', text: 'Consultar acciones' },
      }),
      db
    )
    expect(sends[1].text.body).toContain('Atender cliente')
  })
  it('queries created-by scope without substituting my assignments', async () => {
    const db = database({
      acciones_diarias: [
        {
          id: action,
          responsable: 'other',
          created_by: user,
          titulo_accion: 'Delegada',
          estado: 'Pendiente',
          fecha: '2026-01-01',
        },
      ],
    })
    await runtime(db).handleInboundCommand(
      db,
      { text: { body: 'Acciones que asigné' } },
      user,
      phone
    )
    expect(sends[0].text.body).toContain('Delegada')
  })
  it('starts selection and rejects expired interactive selections', async () => {
    const db = database(),
      r = runtime(db)
    await r.handleInboundCommand(
      db,
      { id: 'in', text: { body: 'Actualizar acciones' } },
      user,
      phone
    )
    expect(sends[0].interactive.type).toBe('list')
    db.tables.whatsapp_flow_sessions[0].expires_at = '2000-01-01'
    await r.handleInboundCommand(
      db,
      { interactive: { list_reply: { id: 'wa:select:' + action } } },
      user,
      phone
    )
    expect(sends[1].text.body).toContain('expiró')
  })
  it('selects an authorized action using stable list ID', async () => {
    const db = database(),
      r = runtime(db)
    await r.handleInboundCommand(
      db,
      { id: 'in', text: { body: 'Actualizar acciones' } },
      user,
      phone
    )
    await r.handleInboundCommand(
      db,
      { interactive: { list_reply: { id: 'wa:select:' + action } } },
      user,
      phone
    )
    expect(sends[1].interactive.action.buttons[0].reply.id).toBe(
      'act:' + action + ':done'
    )
  })
  it('asks for a block reason before mutation', async () => {
    const db = database(),
      r = runtime(db)
    await r.handleInboundCommand(
      db,
      { interactive: { button_reply: { id: 'act:' + action + ':support' } } },
      user,
      phone
    )
    expect(sends[0].text.body).toContain('motivo')
    expect(db.rpc).not.toHaveBeenCalledWith(
      'whatsapp_apply_action',
      expect.anything()
    )
  })
  it('never treats general commands as evidence or block reasons', async () => {
    const db = database({
      whatsapp_flow_sessions: [
        {
          id: 's',
          phone,
          usuario_id: user,
          flow_type: 'task_update',
          status: 'awaiting_clarification',
          expires_at: '2099-01-01',
          meta: { purpose: 'block_reason', id: action },
        },
      ],
    })
    await runtime(db).handleInboundCommand(
      db,
      { text: { body: 'Mis acciones' } },
      user,
      phone
    )
    expect(db.tables.whatsapp_flow_sessions[0].status).toBe('cancelled')
    expect(db.rpc).not.toHaveBeenCalledWith(
      'whatsapp_apply_action',
      expect.anything()
    )
  })
  it('cancel clears pending evidence too', async () => {
    const db = database({
      whatsapp_result_requests: [
        { wa_id: phone, usuario_id: user, status: 'waiting' },
      ],
    })
    await runtime(db).handleInboundCommand(
      db,
      { text: { body: 'Cancelar' } },
      user,
      phone
    )
    expect(db.tables.whatsapp_result_requests[0].status).toBe('expired')
  })
  it('open queries retain the existing conversational path', async () => {
    const db = database()
    expect(
      await runtime(db).handleInboundCommand(
        db,
        { text: { body: '¿Cuáles tiene Jorge?' } },
        user,
        phone
      )
    ).toBe(false)
    expect(sends).toHaveLength(0)
  })
  it('surfaces provider rejection and prevents a second send after an uncertain request', async () => {
    const db = database(),
      r = runtime(db)
    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'))
    await expect(r.graphSendMessage(db, { to: phone })).rejects.toThrow()
    await expect(r.graphSendMessage(db, { to: phone })).rejects.toThrow(
      'provider_outcome_unknown'
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('checks database errors instead of silently claiming success', async () => {
    const base = {
      from: () => ({
        then: (resolve: any) =>
          Promise.resolve({ data: null, error: { code: 'XX000' } }).then(
            resolve
          ),
      }),
      rpc: vi.fn(),
    }
    const r = runtime(database())
    const checked = r.checkedWorkerClient(base, { id: 'j', lease_token: 'l' })
    await expect(checked.from('usuarios')).rejects.toThrow('database_XX000')
  })
})

it('shows a long approval preview in full text instead of truncating it inside a button',async()=>{
 const db=database(),r=runtime(db)
 const body='Contenido completo: '+ 'x'.repeat(1300)+'\nCódigo: ABCD1234\nconfirmar ABCD1234'
 await r.replyAi(db,phone,body,user,null,[{type:'reply',reply:{id:'r2_confirm:op:ABCD1234',title:'Confirmar'}}])
 expect(sends).toHaveLength(1)
 expect(sends[0].type).toBe('text')
 expect(sends[0].text.body).toBe(body)
})
