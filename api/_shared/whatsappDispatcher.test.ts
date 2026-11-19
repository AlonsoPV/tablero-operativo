import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'

const source = readFileSync('supabase/functions/whatsapp-followup-dispatcher/index.ts', 'utf8')
  .replace(/^import .*createClient.*\r?\n/m, '')
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText

function runtime(env: Record<string, string> = {}) {
  let handler: (req: Request) => Promise<Response>
  const createClient = vi.fn(() => { throw new Error('Unexpected database access') })
  new Function('Deno', 'createClient', js)({
    env: { get: (key: string) => env[key] },
    serve: (value: typeof handler) => { handler = value },
  }, createClient)
  return { request: (headers = {}) => handler(new Request('https://example.test', {
    method: 'POST', headers,
  })), createClient }
}

it.each([
  ['missing environment', {}, {}],
  ['missing caller credential', { WHATSAPP_DISPATCHER_SECRET: 'test-secret' }, {}],
  ['mismatched caller credential', { WHATSAPP_DISPATCHER_SECRET: 'test-secret' }, {
    'x-dispatcher-secret': 'different',
  }],
])('rejects %s before accessing jobs', async (_label, env, headers) => {
  const test = runtime(env as Record<string, string>)
  const response = await test.request(headers)
  expect(response.status).toBe(401)
  expect(response.headers.get('x-whatsapp-auth-layer')).toBe('edge_function')
  expect(await response.json()).toEqual({ error: 'unauthorized' })
  expect(test.createClient).not.toHaveBeenCalled()
})

it.each([
  [{ WHATSAPP_DISPATCHER_SECRET: 'test-secret' }, { 'x-dispatcher-secret': 'test-secret' }],
  [{ SUPABASE_ANON_KEY: 'test-anon' }, { authorization: 'Bearer test-anon' }],
  [{ SUPABASE_SERVICE_ROLE_KEY: 'test-service' }, { apikey: 'test-service' }],
])('preserves existing valid credentials', async (env, headers) => {
  const test = runtime({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service', ...env })
  await test.request(headers)
  expect(test.createClient).toHaveBeenCalledOnce()
})
