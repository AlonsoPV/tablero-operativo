import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// Only read sessions and rows. Mutation/communication tests use the existing mock suites.
const productionProject = 'xhpasmjzuwifmjhrsumb'
const tables = new Set([
  'acciones_diarias', 'okrs', 'okr_key_results',
  'assistant_pending_ops', 'whatsapp_messages', 'whatsapp_inbound_jobs',
])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fixtureIds = {
  ownAction: '10000000-0000-0000-0000-000000000001',
  createdAction: '10000000-0000-0000-0000-000000000002',
  foreignAction: '10000000-0000-0000-0000-000000000003',
  companyOkr: '20000000-0000-0000-0000-000000000001',
  teamOkr: '20000000-0000-0000-0000-000000000002',
  ownDraft: '30000000-0000-0000-0000-000000000001',
  foreignDraft: '30000000-0000-0000-0000-000000000002',
}

async function run() {
  const args = process.argv.slice(2)
  if (!args.includes('--run')) {
    console.log(JSON.stringify({
      mode: 'plan_only',
      fixtureIds,
      actors: ['admin_A', 'direction_A', 'analyst_A', 'peer_A', 'admin_B'],
      prerequisites: [
        'Approved staging project and migrated schema',
        'Synthetic rows and expected IDs per authenticated QA session',
        'Direction read/admin policy approved before freezing expected results',
        'Separate project B for organization-boundary checks',
      ],
      manifest: {
        url: 'https://APPROVED_QA_REF.supabase.co',
        anonKeyEnv: 'QA_ANON_KEY',
        actors: [{
          label: 'analyst_A',
          tokenEnv: 'QA_ANALYST_A_JWT',
          authUserId: '00000000-0000-0000-0000-000000000001',
          expectedAuthHttp: 200,
          cases: [{
            label: 'private-draft-isolation',
            table: 'assistant_pending_ops',
            ids: [fixtureIds.ownDraft, fixtureIds.foreignDraft],
            expectedIds: [fixtureIds.ownDraft],
            expectedHttp: 200,
          }],
        }],
      },
    }, null, 2))
    return
  }

  const manifestIndex = args.indexOf('--manifest')
  assert.ok(manifestIndex >= 0 && args[manifestIndex + 1], 'Manifest required')
  const manifest = JSON.parse(readFileSync(args[manifestIndex + 1], 'utf8'))
  const base = new URL(manifest.url)
  assert.equal(base.protocol, 'https:', 'HTTPS required')
  assert.ok(/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname), 'Expected QA Supabase host')
  assert.notEqual(base.hostname.split('.')[0], productionProject, 'Production test execution is blocked')
  assert.equal(base.username + base.password + base.search + base.hash, '', 'Unexpected URL fields')
  assert.equal(base.pathname, '/', 'Expected project origin')
  const anonKey = process.env[manifest.anonKeyEnv]
  assert.ok(anonKey, 'QA API key required')
  assert.ok(Array.isArray(manifest.actors) && manifest.actors.length, 'QA actors required')
  const results = []

  for (const actor of manifest.actors) {
    const token = process.env[actor.tokenEnv]
    assert.ok(token, 'QA session required')
    const claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString())
    assert.equal(claims.role, 'authenticated', 'Use a user session, never a service role token')
    const headers = { apikey: anonKey, Authorization: 'Bearer ' + token }
    const identityResponse = await fetch(new URL('/auth/v1/user', base), {
      method: 'GET', headers, signal: AbortSignal.timeout(15000),
    })
    const expectedAuthHttp = actor.expectedAuthHttp ?? 200
    assert.ok([200, 401, 403].includes(expectedAuthHttp), 'Unexpected expected auth status')
    const validAuthStatus = identityResponse.status === expectedAuthHttp
    results.push({ actor: actor.label, case: 'authenticated-session',
      http: identityResponse.status, passed: validAuthStatus })
    if (!validAuthStatus || expectedAuthHttp !== 200) continue
    const identity = await identityResponse.json()
    assert.ok(uuid.test(actor.authUserId), 'Expected auth UUID required')
    assert.equal(identity.id, actor.authUserId, 'Unexpected QA identity')
    assert.ok(Array.isArray(actor.cases) && actor.cases.length, 'Expected read cases required')

    for (const test of actor.cases) {
      assert.ok(tables.has(test.table), 'Unexpected test table')
      assert.ok(Array.isArray(test.ids) && test.ids.length > 0 && test.ids.length <= 50, 'Fixture IDs required')
      assert.ok(test.ids.every(id => uuid.test(id)), 'Invalid fixture UUID')
      assert.ok(Array.isArray(test.expectedIds) && test.expectedIds.every(id => test.ids.includes(id)), 'Invalid expected set')
      assert.ok([200, 401, 403].includes(test.expectedHttp), 'Expected HTTP required')
      const url = new URL('/rest/v1/' + test.table, base)
      url.searchParams.set('select', 'id')
      url.searchParams.set('id', 'in.(' + test.ids.join(',') + ')')
      url.searchParams.set('limit', '50')
      const start = performance.now()
      const response = await fetch(url, {
        method: 'GET', headers, signal: AbortSignal.timeout(15000),
      })
      const elapsedMs = Math.round(performance.now() - start)
      const body = await response.json()
      let correctIds = test.expectedIds.length === 0
      if (response.status === 200) {
        assert.ok(Array.isArray(body), 'Expected rows')
        correctIds = JSON.stringify(body.map(row => row.id).sort()) ===
          JSON.stringify([...test.expectedIds].sort())
      }
      results.push({
        actor: actor.label, case: test.label, table: test.table,
        http: response.status, duration_ms: elapsedMs,
        passed: response.status === test.expectedHttp && correctIds,
      })
    }
  }
  console.log(JSON.stringify({ mode: 'qa_read_only', results }, null, 2))
  if (results.some(result => !result.passed)) process.exitCode = 1
}

run().catch(error => {
  console.error(JSON.stringify({
    mode: 'qa_read_only', failed: true,
    error: error instanceof assert.AssertionError ? error.message : error.name,
  }))
  process.exitCode = 1
})
