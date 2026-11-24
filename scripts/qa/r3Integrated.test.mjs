import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CANDIDATE_SHA,
  DEFAULT_DEV_REF,
  FORBIDDEN_PROD_HOSTS,
  FORBIDDEN_PROD_REFS,
  REQUIRED_INTEGRATED_AUTH,
  REQUIRED_ROLLBACK_AUTH,
  assertNoProductionConfig,
  buildPreviewRequest,
  isFlagOn,
  loadProtectedEnvFile,
  redactSecrets,
  requireIntegratedExecutionAuth,
  requireRollbackExecutionAuth,
  resolveFixturePrefix,
  resolvePreviewConfig,
  resolveQaIdentities,
  resolveR3DevTarget,
} from './r3DevGuard.mjs'
import { runR3IntegratedSuite } from './r3IntegratedSuite.mjs'
import { runR3Preflight } from './r3-preflight.mjs'
import { ROLLBACK_FLAG_KEYS, runR3RollbackOff } from './r3-rollback-off.mjs'
import { executeR3IntegratedCli } from './run-r3-integrated.mjs'

const baseEnv = (overrides = {}) => ({
  R3_ALLOWED_SUPABASE_REFS: DEFAULT_DEV_REF,
  R3_DEV_SUPABASE_URL: `https://${DEFAULT_DEV_REF}.supabase.co`,
  R3_DEV_SUPABASE_ANON_KEY: 'anon-dev-key-secret-12345',
  R3_DEV_SUPABASE_SERVICE_ROLE_KEY: 'service-dev-key-secret-67890',
  R3_PREVIEW_URL: 'https://tablero-operativo-test-alonsopvs-projects.vercel.app',
  R3_PREVIEW_BYPASS_SECRET: 'bypass-secret-abcdef',
  R3_QA_DIRECCION_EMAIL: 'qa-dir@example.invalid',
  R3_QA_DIRECCION_PASSWORD: 'DireccionPassword!2026',
  R3_QA_LIDER_EMAIL: 'qa-lider@example.invalid',
  R3_QA_LIDER_PASSWORD: 'LiderPassword!2026',
  R3_FIXTURE_PREFIX: 'r3-int-',
  VERCEL_TOKEN: 'vercel-token-secret-xyz',
  ...overrides,
})

/**
 * In-memory RLS-faithful Supabase mock for deterministic unit testing of R3-I0..R3-I7.
 */
function createMockSupabaseRlsEnv({ leakCrossUser = false } = {}) {
  const memoryRows = []
  const docRows = []
  let seq = 1

  const makeTableQuery = (role, actorUid, table) => {
    const state = { filters: [], likeFilters: [], inFilter: null, mode: 'select', payload: null, countMode: false }

    const matchRow = (row) => {
      for (const [k, v] of state.filters) {
        if (row[k] !== v) return false
      }
      for (const [k, pattern] of state.likeFilters) {
        const prefix = pattern.replace(/%$/, '')
        if (!String(row[k] || '').startsWith(prefix)) return false
      }
      if (state.inFilter) {
        if (!state.inFilter.vals.includes(row[state.inFilter.col])) return false
      }
      return true
    }

    const execute = async () => {
      if (table === 'agent_memory') {
        if (role === 'anon') {
          return { data: null, count: 0, error: { code: '42501', message: 'permission denied for table agent_memory' } }
        }
        if (state.mode === 'insert') {
          const validTypes = ['agreement', 'decision', 'preference', 'follow_up']
          if (!validTypes.includes(state.payload.memory_type)) {
            return { data: null, error: { code: '23514', message: 'violates check constraint memory_type' } }
          }
          if (role !== 'service' && state.payload.usuario_id !== actorUid) {
            return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
          }
          const row = { id: `mem-${seq++}`, version: 1, ...state.payload }
          memoryRows.push(row)
          return { data: [row], error: null }
        }
        if (state.mode === 'update') {
          const updated = []
          for (const r of memoryRows) {
            if (!matchRow(r)) continue
            if (role !== 'service' && r.usuario_id !== actorUid) continue
            Object.assign(r, state.payload)
            updated.push({ ...r })
          }
          return { data: updated, error: null }
        }
        if (state.mode === 'delete') {
          if (role !== 'service') return { data: null, error: { code: '42501', message: 'delete denied' } }
          for (let i = memoryRows.length - 1; i >= 0; i--) {
            if (matchRow(memoryRows[i])) memoryRows.splice(i, 1)
          }
          return { data: [], error: null }
        }
        // select
        const visible = memoryRows.filter((r) => {
          if (!matchRow(r)) return false
          if (role === 'service' || leakCrossUser) return true
          return r.usuario_id === actorUid
        })
        return { data: visible.map((r) => ({ ...r })), count: visible.length, error: null }
      }

      if (table === 'agent_documents') {
        if (state.mode === 'insert') {
          if (role !== 'service') {
            return { data: null, error: { code: '42501', message: 'permission denied for table agent_documents' } }
          }
          const row = { id: `doc-${seq++}`, ...state.payload }
          docRows.push(row)
          return { data: [row], error: null }
        }
        if (state.mode === 'delete') {
          if (role !== 'service') return { data: null, error: { code: '42501', message: 'delete denied' } }
          for (let i = docRows.length - 1; i >= 0; i--) {
            if (matchRow(docRows[i])) docRows.splice(i, 1)
          }
          return { data: [], error: null }
        }
        const visible = docRows.filter((r) => {
          if (!matchRow(r)) return false
          if (role === 'service') return true
          return r.status === 'published'
        })
        return { data: visible.map((r) => ({ ...r })), count: visible.length, error: null }
      }

      return { data: [], count: 0, error: null }
    }

    const builder = {
      select(_cols, opts) {
        if (opts?.count) state.countMode = true
        return builder
      },
      insert(payload) {
        state.mode = 'insert'
        state.payload = payload
        return builder
      },
      update(payload) {
        state.mode = 'update'
        state.payload = payload
        return builder
      },
      delete() {
        state.mode = 'delete'
        return builder
      },
      eq(col, val) {
        state.filters.push([col, val])
        return builder
      },
      like(col, pat) {
        state.likeFilters.push([col, pat])
        return builder
      },
      in(col, vals) {
        state.inFilter = { col, vals }
        return builder
      },
      limit() {
        return builder
      },
      async single() {
        const res = await execute()
        if (res.error) return { data: null, error: res.error }
        return { data: res.data?.[0] ?? null, error: null }
      },
      async maybeSingle() {
        const res = await execute()
        if (res.error) return { data: null, error: res.error }
        return { data: res.data?.[0] ?? null, error: null }
      },
      then(resolveFn, rejectFn) {
        return execute().then(resolveFn, rejectFn)
      },
    }
    return builder
  }

  const makeClient = (role, actorUid = null) => ({
    from: (table) => makeTableQuery(role, actorUid, table),
  })

  return {
    memoryRows,
    docRows,
    clients: {
      anon: makeClient('anon'),
      admin: makeClient('service'),
      signInDireccion: async () => ({
        key: 'direccion',
        accessToken: 'jwt-dir',
        userId: 'auth-dir',
        usuarioId: 'uid-dir',
        rawSession: { access_token: 'jwt-dir' },
        client: makeClient('authenticated', 'uid-dir'),
      }),
      signInLider: async () => ({
        key: 'lider',
        accessToken: 'jwt-lider',
        userId: 'auth-lider',
        usuarioId: 'uid-lider',
        rawSession: { access_token: 'jwt-lider' },
        client: makeClient('authenticated', 'uid-lider'),
      }),
    },
  }
}

describe('r3DevGuard — fail-closed DEV allowlist & PROD protection', () => {
  it('accepts explicitly allowlisted DEV ref and rejects Production everywhere', () => {
    const target = resolveR3DevTarget(baseEnv())
    expect(target.ref).toBe(DEFAULT_DEV_REF)
    expect(target.hasServiceRole).toBe(true)

    expect(() => resolveR3DevTarget(baseEnv({ R3_ALLOWED_SUPABASE_REFS: '' }))).toThrow(/ALLOWLIST|R3_ALLOWED_SUPABASE_REFS/)
    for (const prodRef of FORBIDDEN_PROD_REFS) {
      expect(() => resolveR3DevTarget(baseEnv({ R3_ALLOWED_SUPABASE_REFS: `${DEFAULT_DEV_REF},${prodRef}` }))).toThrow(/Production/)
      expect(() => resolveR3DevTarget(baseEnv({ R3_DEV_SUPABASE_URL: `https://${prodRef}.supabase.co` }))).toThrow(/Production/)
    }
    expect(() => resolveR3DevTarget(baseEnv({ NODE_ENV: 'production' }))).toThrow(/NODE_ENV=production/)
    expect(() => resolveR3DevTarget(baseEnv({ VERCEL_ENV: 'production' }))).toThrow(/VERCEL_ENV=production/)
    expect(() => resolveR3DevTarget(baseEnv({ R2_EXECUTION_MODE: 'live' }))).toThrow(/R2_EXECUTION_MODE/)
    expect(() => resolveR3DevTarget(baseEnv({ COPILOT_R2_GATE: '1' }))).toThrow(/COPILOT_R2_GATE/)
    expect(() => resolveR3DevTarget(baseEnv({ R1_EXECUTION_ENABLED: '1' }))).toThrow(/R1_EXECUTION_ENABLED/)
  })

  it('rejects Production Preview hosts and enforces legitimate SSO request building', () => {
    for (const host of FORBIDDEN_PROD_HOSTS) {
      expect(() => resolvePreviewConfig(baseEnv({ R3_PREVIEW_URL: `https://${host}` }))).toThrow(/Production/)
    }
    const cfg = resolvePreviewConfig(baseEnv())
    expect(cfg.authMode).toBe('vercel_protection_bypass')
    const req = buildPreviewRequest(cfg, '/api/gemini-chat')
    expect(req.headers['x-vercel-protection-bypass']).toBe('bypass-secret-abcdef')
  })

  it('rejects root .env loading, enforces r3-int- prefix, distinct QA users, and explicit auth gates', () => {
    expect(() => loadProtectedEnvFile('.env')).toThrow(/prohibido/i)
    expect(resolveFixturePrefix(baseEnv())).toBe('r3-int-')
    expect(() => resolveFixturePrefix(baseEnv({ R3_FIXTURE_PREFIX: 'prod-' }))).toThrow(/r3-int-/)
    expect(() =>
      resolveQaIdentities(baseEnv({ R3_QA_LIDER_EMAIL: 'qa-dir@example.invalid' })),
    ).toThrow(/distintas/)
    expect(() => requireIntegratedExecutionAuth(baseEnv(), [])).toThrow(REQUIRED_INTEGRATED_AUTH)
    expect(() => requireIntegratedExecutionAuth(baseEnv({ R3_INTEGRATED_AUTH: REQUIRED_INTEGRATED_AUTH }), [])).toThrow(/--execute/)
    expect(requireIntegratedExecutionAuth(baseEnv({ R3_INTEGRATED_AUTH: REQUIRED_INTEGRATED_AUTH }), ['--execute']).authorized).toBe(true)
    expect(() => requireRollbackExecutionAuth(baseEnv(), ['--apply'])).toThrow(REQUIRED_ROLLBACK_AUTH)
    expect(requireRollbackExecutionAuth(baseEnv({ R3_ROLLBACK_AUTH: REQUIRED_ROLLBACK_AUTH }), ['--apply']).authorized).toBe(true)
    expect(isFlagOn('1')).toBe(true)
    expect(isFlagOn('0')).toBe(false)
    expect(isFlagOn('true')).toBe(false)
  })

  it('redacts secrets and bearer tokens from reports', () => {
    const out = redactSecrets(
      { msg: 'Bearer my-jwt-token-999', key: 'secret-value-1234', url: 'https://x.app/?_vercel_share=tok123' },
      ['secret-value-1234'],
    )
    expect(out.msg).toBe('Bearer [REDACTED]')
    expect(out.key).toBe('[REDACTED]')
    expect(out.url).toBe('https://x.app/?_vercel_share=[REDACTED]')
    expect(() => assertNoProductionConfig(baseEnv())).not.toThrow()
  })
})

describe('runR3IntegratedSuite — R3-I0..R3-I7 mocked end-to-end', () => {
  it('passes R3-I0..R3-I7 in ON mode and cleans up 100% of tracked r3-int- fixtures', async () => {
    const mockDb = createMockSupabaseRlsEnv()
    const target = resolveR3DevTarget(baseEnv())
    const previewConfig = resolvePreviewConfig(baseEnv())

    const report = await runR3IntegratedSuite({
      windowMode: 'ON',
      runId: 'unit1',
      fixturePrefix: 'r3-int-',
      target,
      previewConfig,
      clients: mockDb.clients,
      previewTurn: async () => ({ ok: true, blockedSso: false, status: 200, text: '{"reply":"ok"}', json: { reply: 'Resumen acciones abiertas.' } }),
      browserProbe: async () => ({ status: 'PASS', httpStatus: 200, memoryRequests: [], consoleErrors: [], pageErrors: [] }),
      env: baseEnv(),
    })

    expect(report.verdict).toBe('PASS')
    expect(report.results.map((r) => r.id)).toEqual(['R3-I0', 'R3-I1', 'R3-I2', 'R3-I3', 'R3-I4', 'R3-I5', 'R3-I6', 'R3-I7'])
    expect(report.results.every((r) => r.status === 'PASS')).toBe(true)
    expect(report.createdFixtures.memoryIds.length).toBeGreaterThanOrEqual(3)
    expect(report.createdFixtures.documentIds.length).toBe(2)
    expect(report.cleanup.remainingMemory).toBe(0)
    expect(report.cleanup.remainingDocuments).toBe(0)
    expect(mockDb.memoryRows.length).toBe(0)
    expect(mockDb.docRows.length).toBe(0)
  })

  it('halts immediately on critical cross-user isolation failure (R3-I2) and still cleans up fixtures', async () => {
    const mockDb = createMockSupabaseRlsEnv({ leakCrossUser: true })
    const target = resolveR3DevTarget(baseEnv())
    const previewConfig = resolvePreviewConfig(baseEnv())

    const report = await runR3IntegratedSuite({
      windowMode: 'ON',
      runId: 'leak1',
      fixturePrefix: 'r3-int-',
      target,
      previewConfig,
      clients: mockDb.clients,
      previewTurn: async () => ({ ok: true, blockedSso: false, status: 200, text: '', json: { reply: 'ok' } }),
      stopOnCritical: true,
      env: baseEnv(),
    })

    expect(report.verdict).toBe('FAIL')
    expect(report.haltedOnCritical).toBe(true)
    expect(report.results.find((r) => r.id === 'R3-I2')?.status).toBe('FAIL')
    expect(report.results.find((r) => r.id === 'R3-I3')?.status).toBe('BLOCKED')
    expect(mockDb.memoryRows.length).toBe(0)
  })
})

describe('runR3Preflight & executeR3IntegratedCli — zero writes when BLOCKED', () => {
  it('returns BLOCKED with 0 writes when credentials/env are missing', async () => {
    const report = await runR3Preflight({ env: {} })
    expect(report.status).toBe('BLOCKED')
    expect(report.writesPerformed).toBe(0)
    expect(report.blockers.length).toBeGreaterThan(0)
  })

  it('returns READY when DEV, QA identities, Preview SSO, and Vercel flags all validate', async () => {
    const fetchMock = vi.fn(async (url, opts = {}) => {
      const s = String(url)
      if (s.includes('/auth/v1/health')) return new Response('ok', { status: 200 })
      if (s.includes('api.vercel.com')) {
        return new Response(
          JSON.stringify({
            envs: [
              { id: 'id1', key: 'AGENT_ORCHESTRATOR_R1', value: '1', gitBranch: 'preview', target: ['preview'] },
              { id: 'id2', key: 'AGENT_MEMORY_R3', value: '1', gitBranch: 'preview', target: ['preview'] },
            ],
          }),
          { status: 200 },
        )
      }
      if (opts.method === 'HEAD') {
        return new Response('', { status: 302, headers: { location: 'https://vercel.com/sso-api?url=x' } })
      }
      return new Response('<html>ok</html>', { status: 200 })
    })

    const supaMock = () => ({
      auth: {
        signInWithPassword: async ({ email }) => ({
          data: { session: { access_token: `tok-${email}` }, user: { id: `auth-${email}` } },
          error: null,
        }),
      },
      from: (table) => ({
        select: () => ({
          eq: (_c, val) => ({
            maybeSingle: async () =>
              table === 'usuarios'
                ? { data: { id: `u-${val}`, rol: val.includes('dir') ? 'Direccion' : 'Lider', activo: true }, error: null }
                : { data: null, error: null },
          }),
          then: (res) => res({ data: [], count: 0, error: null }),
        }),
      }),
    })

    const report = await runR3Preflight({
      env: baseEnv({ R3_EXPECTED_WINDOW: 'ON' }),
      fetchImpl: fetchMock,
      createSupabaseClient: supaMock,
    })

    expect(report.status).toBe('READY')
    expect(report.blockers).toEqual([])
    expect(report.writesPerformed).toBe(0)
  })

  it('executeR3IntegratedCli aborts without invoking suite if preflight is BLOCKED', async () => {
    const suiteSpy = vi.fn()
    const res = await executeR3IntegratedCli({
      env: baseEnv({ R3_INTEGRATED_AUTH: REQUIRED_INTEGRATED_AUTH }),
      argv: ['--execute'],
      preflightFn: async () => ({ status: 'BLOCKED', blockers: ['qa_identities_valid'] }),
      suiteFn: suiteSpy,
    })
    expect(res.status).toBe('BLOCKED')
    expect(suiteSpy).not.toHaveBeenCalled()
  })
})

describe('runR3RollbackOff — independent, scoped exclusively to gitBranch=preview R3 flags', () => {
  it('supports read-only dry-run and authorized apply patching ONLY R1/R3 on preview branch', async () => {
    const calls = []
    let flagVal = '1'
    const fetchMock = vi.fn(async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null })
      if ((opts.method || 'GET') === 'GET') {
        return new Response(
          JSON.stringify({
            envs: [
              { id: 'env_r1', key: 'AGENT_ORCHESTRATOR_R1', value: flagVal, gitBranch: 'preview', target: ['preview'] },
              { id: 'env_r3', key: 'AGENT_MEMORY_R3', value: flagVal, gitBranch: 'preview', target: ['preview'] },
            ],
          }),
          { status: 200 },
        )
      }
      if (opts.method === 'PATCH') {
        flagVal = '0'
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (opts.method === 'POST') {
        return new Response(JSON.stringify({ id: 'dpl_off_123', url: 'preview-off.vercel.app', readyState: 'INITIALIZING', target: null }), {
          status: 200,
        })
      }
      return new Response('{}', { status: 404 })
    })

    const dry = await runR3RollbackOff({ env: baseEnv(), argv: [], fetchImpl: fetchMock })
    expect(dry.status).toBe('READY')
    expect(dry.mutated).toBe(false)
    expect(calls.every((c) => c.method === 'GET')).toBe(true)

    calls.length = 0
    const applied = await runR3RollbackOff({
      env: baseEnv({ R3_ROLLBACK_AUTH: REQUIRED_ROLLBACK_AUTH }),
      argv: ['--apply'],
      fetchImpl: fetchMock,
    })
    expect(applied.status).toBe('PASS')
    expect(applied.allOffAfter).toBe(true)
    const patchCalls = calls.filter((c) => c.method === 'PATCH')
    expect(patchCalls.map((c) => c.body.key)).toEqual([...ROLLBACK_FLAG_KEYS])
    expect(patchCalls.every((c) => c.body.value === '0' && c.body.gitBranch === 'preview' && c.body.target.join(',') === 'preview')).toBe(true)
    const deployCall = calls.find((c) => c.method === 'POST')
    expect(deployCall.body.gitSource.sha).toBe(DEFAULT_CANDIDATE_SHA)
    expect(deployCall.body.gitSource.ref).toBe('preview')
  })
})
