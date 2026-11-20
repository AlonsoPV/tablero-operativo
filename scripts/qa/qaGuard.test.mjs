// node --test scripts/qa/qaGuard.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKED_PROJECT_REFS, resolveQaTarget } from './qaGuard.mjs'

const REF_A = 'qalocala000000000000'
const local = (over = {}) => ({
  QA_LOCAL: '1',
  QA_LOCAL_PORTS: '54421,54521',
  R2_QA_PROJECT_REFS: `${REF_A},qalocalb000000000000`,
  QA_A_SUPABASE_URL: 'http://127.0.0.1:54421',
  QA_A_LOCAL_REF: REF_A,
  QA_A_ANON_KEY: 'anon',
  QA_A_SERVICE_ROLE_KEY: 'service',
  ...over,
})

test('acepta una instancia local en loopback con puerto y ref permitidos', () => {
  const qa = resolveQaTarget('A', local(), { needService: true })
  assert.equal(qa.ref, REF_A)
  assert.equal(qa.local, true)
  assert.equal(resolveQaTarget('A', local({ QA_A_SUPABASE_URL: 'http://localhost:54421' })).ref, REF_A)
})

test('sin QA_LOCAL una URL local se rechaza como antes', () => {
  assert.throws(() => resolveQaTarget('A', local({ QA_LOCAL: undefined })), /no es una URL de proyecto Supabase/)
})

test('QA_LOCAL rechaza hosts remotos, https, puertos no declarados y refs no sintéticas', () => {
  assert.throws(() => resolveQaTarget('A', local({ QA_A_SUPABASE_URL: 'http://10.0.0.5:54421' })), /127\.0\.0\.1/)
  assert.throws(() => resolveQaTarget('A', local({ QA_A_SUPABASE_URL: 'https://qalocala000000000000.supabase.co' })), /127\.0\.0\.1/)
  assert.throws(() => resolveQaTarget('A', local({ QA_A_SUPABASE_URL: 'http://127.0.0.1:54321' })), /QA_LOCAL_PORTS/)
  assert.throws(() => resolveQaTarget('A', local({ QA_A_SUPABASE_URL: 'http://127.0.0.1' })), /QA_LOCAL_PORTS/)
  assert.throws(() => resolveQaTarget('A', local({ QA_A_LOCAL_REF: 'qaprojectaaaaaaaaaaa' })), /LOCAL_REF/)
  assert.throws(() => resolveQaTarget('A', local({ QA_A_LOCAL_REF: '' })), /LOCAL_REF/)
})

test('QA_LOCAL nunca acepta DEV ni PROD, ni en la ref, ni en la allowlist ni en la URL', () => {
  for (const blocked of BLOCKED_PROJECT_REFS) {
    assert.throws(() => resolveQaTarget('A', local({ R2_QA_PROJECT_REFS: `${REF_A},${blocked}` })), /DEV o PROD/)
    assert.throws(() => resolveQaTarget('A', local({ QA_A_SUPABASE_URL: `http://127.0.0.1:54421/${blocked}` })), /DEV o PROD/)
  }
})

test('QA_LOCAL exige la ref en R2_QA_PROJECT_REFS y no corre en Vercel ni producción', () => {
  assert.throws(() => resolveQaTarget('A', local({ R2_QA_PROJECT_REFS: 'qalocalb000000000000' })), /no está en R2_QA_PROJECT_REFS/)
  assert.throws(() => resolveQaTarget('A', local({ VERCEL: '1' })), /Vercel/)
  assert.throws(() => resolveQaTarget('A', local({ VERCEL_ENV: 'preview' })), /Vercel/)
  assert.throws(() => resolveQaTarget('A', local({ NODE_ENV: 'production' })), /producción/)
})

test('el modo remoto conserva sus reglas', () => {
  const env = {
    R2_QA_PROJECT_REFS: 'qaprojectaaaaaaaaaaa',
    QA_A_SUPABASE_URL: 'https://qaprojectaaaaaaaaaaa.supabase.co',
    QA_A_ANON_KEY: 'anon',
  }
  assert.equal(resolveQaTarget('A', env).ref, 'qaprojectaaaaaaaaaaa')
  assert.throws(() => resolveQaTarget('A', env, { needService: true }), /SERVICE_ROLE_KEY/)
  assert.throws(() => resolveQaTarget('A', { ...env, QA_A_SUPABASE_URL: `https://${BLOCKED_PROJECT_REFS[1]}.supabase.co` }), /DEV o PROD/)
})
