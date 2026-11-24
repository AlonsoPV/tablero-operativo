/* global Headers */
import { describe, expect, it } from 'vitest'
import {
  BLOCKED_SUPABASE_REFS,
  REQUIRED_QA_AUTH,
  REQUIRED_ROLLBACK_AUTH,
  assertQaIsolation,
  redactQaSecrets,
  requireTcRollbackAuth,
  requireTextCompleteAuth,
  resolveCandidate,
  resolveQaSupabaseTarget,
  resolveTextCompleteIdentities,
} from './textCompleteGuard.mjs'
import { runTextCompletePreflight } from './textCompletePreflight.mjs'
import { reconcileUncertainOp, runTextCompleteSuite } from './textCompleteSuite.mjs'
import { formatCompactMarkdownReport } from './run-text-complete-qa.mjs'
import { runTextCompleteRollback } from './textCompleteRollback.mjs'

const VALID_SHA = '345c2b6000000000000000000000000000000001'
const QA_REF = 'qatextcomplete000001'

function validEnv(overrides = {}) {
  return {
    TC_QA_PROJECT_REFS: QA_REF,
    TC_QA_SUPABASE_URL: `https://${QA_REF}.supabase.co`,
    TC_QA_SUPABASE_ANON_KEY: 'anon-qa-key-secret-value',
    TC_QA_SUPABASE_SERVICE_ROLE_KEY: 'srv-qa-key-secret-value',
    TC_PREVIEW_URL: 'https://tablero-operativo-git-feature-r2-executive-action-alonsopvs-projects.vercel.app',
    TC_PREVIEW_BYPASS_SECRET: 'bypass-secret-value',
    TC_EXPECTED_SHA: VALID_SHA,
    TC_EXPECTED_BRANCH: 'feature/r2-executive-action',
    TC_FIXTURE_PREFIX: 'tc-qa-',
    TC_QA_SUPER_ADMIN_EMAIL: 'qa-super-admin@example.invalid',
    TC_QA_SUPER_ADMIN_PASSWORD: 'StrongQaPassword1!',
    TC_QA_DIRECCION_EMAIL: 'qa-direccion@example.invalid',
    TC_QA_DIRECCION_PASSWORD: 'StrongQaPassword2!',
    TC_QA_LIDER_EMAIL: 'qa-lider@example.invalid',
    TC_QA_LIDER_PASSWORD: 'StrongQaPassword3!',
    TC_QA_OPERATIVO_EMAIL: 'qa-operativo@example.invalid',
    TC_QA_OPERATIVO_PASSWORD: 'StrongQaPassword4!',
    TC_VERCEL_TOKEN: 'vercel-token-secret-value',
    ...overrides,
  }
}

describe('Text Complete QA Guardrails', () => {
  it('bloquea DEV y PROD en URL o allowlist', () => {
    for (const ref of BLOCKED_SUPABASE_REFS) {
      expect(() =>
        resolveQaSupabaseTarget(
          validEnv({ TC_QA_PROJECT_REFS: ref, TC_QA_SUPABASE_URL: `https://${ref}.supabase.co` }),
        ),
      ).toThrow(/DEV|PROD/i)
    }
  })

  it('bloquea credenciales de proveedores externos y flags R0/R4', () => {
    expect(() => assertQaIsolation(validEnv({ WHATSAPP_ACCESS_TOKEN: 'live-wa-token' }))).toThrow(/proveedor|externo/i)
    expect(() => assertQaIsolation(validEnv({ RETELL_API_KEY: 'live-retell' }))).toThrow(/proveedor|externo/i)
    expect(() => assertQaIsolation(validEnv({ R0_ENABLED: '1' }))).toThrow(/R0\/R4/i)
    expect(() => assertQaIsolation(validEnv({ R4_ENABLED: '1' }))).toThrow(/R0\/R4/i)
  })

  it('exige SHA de 40 chars, rama no productiva y tokens explícitos de ejecución/rollback', () => {
    expect(() => resolveCandidate(validEnv({ TC_EXPECTED_SHA: '345c2b6' }))).toThrow(/TC_EXPECTED_SHA/)
    expect(() => resolveCandidate(validEnv({ TC_EXPECTED_BRANCH: 'main' }))).toThrow(/TC_EXPECTED_BRANCH/)
    expect(() => requireTextCompleteAuth(validEnv(), [])).toThrow(REQUIRED_QA_AUTH)
    expect(() => requireTextCompleteAuth(validEnv({ TC_QA_AUTH: REQUIRED_QA_AUTH }), [])).toThrow(/--execute/)
    expect(requireTextCompleteAuth(validEnv({ TC_QA_AUTH: REQUIRED_QA_AUTH }), ['--execute']).authorized).toBe(true)
    expect(() => requireTcRollbackAuth(validEnv(), ['--apply'])).toThrow(REQUIRED_ROLLBACK_AUTH)
    expect(requireTcRollbackAuth(validEnv({ TC_ROLLBACK_AUTH: REQUIRED_ROLLBACK_AUTH }), ['--apply']).authorized).toBe(true)
  })

  it('rechaza identidades duplicadas y redacta secretos', () => {
    expect(() =>
      resolveTextCompleteIdentities(validEnv({ TC_QA_OPERATIVO_EMAIL: 'qa-lider@example.invalid' })),
    ).toThrow(/duplicado/i)
    const clean = redactQaSecrets({ token: 'Bearer abcdef123456', key: 'srv-qa-key-secret-value' }, ['srv-qa-key-secret-value'])
    expect(clean.token).toBe('Bearer [REDACTED]')
    expect(clean.key).toBe('[REDACTED]')
  })
})

describe('Text Complete Preflight (read-only)', () => {
  it('retorna READY con 0 escrituras cuando QA Supabase, SSO, SHA y flags coinciden', async () => {
    const env = validEnv()
    const uidMap = {
      'qa-super-admin@example.invalid': { id: 'u-sa', rol: 'Super Admin' },
      'qa-direccion@example.invalid': { id: 'u-dir', rol: 'Direccion' },
      'qa-lider@example.invalid': { id: 'u-lid', rol: 'Lider' },
      'qa-operativo@example.invalid': { id: 'u-op', rol: 'Operativo' },
    }
    let lastEmail = null
    const createSupabaseClient = (_url, _key, headers = {}) => ({
      auth: {
        signInWithPassword: async ({ email }) => {
          lastEmail = email
          return { data: { user: { id: `auth-${email}` }, session: { access_token: `jwt-${email}` } }, error: null }
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              const found = uidMap[lastEmail] || { id: 'u-x', rol: 'Operativo' }
              return { data: { ...found, activo: true }, error: null }
            },
          }),
          then: (cb) => cb({ count: 0, error: null }),
        }),
      }),
      rpc: async (name) => {
        if (name === 'agent_execution_allowed') return { data: true, error: null }
        if (name === 'agent_execution_environment') return { data: QA_REF, error: null }
        return { data: null, error: null }
      },
      _headers: headers,
    })

    const fetchImpl = async (url, opts = {}) => {
      const u = String(url)
      if (u.includes('/auth/v1/health')) return { ok: true, status: 200, headers: new Headers(), text: async () => '{}' }
      if (u.includes('api.vercel.com/v9/projects/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              envs: [
                { id: '1', key: 'AGENT_ORCHESTRATOR_R1', value: '1', gitBranch: 'feature/r2-executive-action', target: ['preview'] },
                { id: '2', key: 'AGENT_MEMORY_R3', value: '1', gitBranch: 'feature/r2-executive-action', target: ['preview'] },
                { id: '3', key: 'R2_EXECUTION_MODE', value: 'qa', gitBranch: 'feature/r2-executive-action', target: ['preview'] },
                { id: '4', key: 'R2_QA_PROJECT_REFS', value: QA_REF, gitBranch: 'feature/r2-executive-action', target: ['preview'] },
              ],
            }),
        }
      }
      if (u.includes('api.vercel.com/v13/deployments/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              id: 'dpl_1',
              projectId: 'prj_k71rhUH9uTFEEPWofF3NyyhcKEDn',
              target: 'preview',
              readyState: 'READY',
              meta: { githubCommitSha: VALID_SHA, githubCommitRef: 'feature/r2-executive-action' },
            }),
        }
      }
      // Preview SSO checks
      if (opts.method === 'HEAD') {
        return { ok: false, status: 302, headers: new Headers({ location: 'https://vercel.com/sso-api' }), text: async () => '' }
      }
      return { ok: true, status: 200, headers: new Headers(), text: async () => '<html>ok</html>' }
    }

    const report = await runTextCompletePreflight({ env, fetchImpl, createSupabaseClient })
    expect(report.status).toBe('READY')
    expect(report.writesPerformed).toBe(0)
    expect(report.blockers).toEqual([])
  })
})

function makeInMemoryQaEnv() {
  const db = {
    acciones_diarias: [],
    accion_comentarios: [],
    assistant_pending_ops: [],
    assistant_op_log: [],
    agent_action_receipts: [],
    agent_documents: [],
    agent_memory: [],
    qa_outbox: [],
    notification_email_logs: [],
    whatsapp_messages: [],
  }
  let seq = 1
  const nextUuid = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`
  const nowIso = () => new Date(Date.now() + seq++ * 1000).toISOString()

  function makeQuery(table) {
    const state = { filters: [], isDelete: false, updatePatch: null, insertRow: null, head: false }
    const applyFilters = (rows) =>
      rows.filter((r) =>
        state.filters.every(([kind, col, val]) => {
          if (kind === 'eq') return r[col] === val
          if (kind === 'in') return val.includes(r[col])
          if (kind === 'ilike') {
            const needle = String(val).replace(/^%|%$/g, '').toLowerCase()
            return String(r[col] ?? '').toLowerCase().includes(needle)
          }
          return true
        }),
      )

    const exec = () => {
      if (state.insertRow) {
        const row = { id: state.insertRow.id || nextUuid(), updated_at: nowIso(), ...state.insertRow }
        db[table].push(row)
        return { data: row, error: null }
      }
      if (state.isDelete) {
        const matched = new Set(applyFilters(db[table]))
        db[table] = db[table].filter((r) => !matched.has(r))
        return { data: null, error: null }
      }
      if (state.updatePatch) {
        const matched = applyFilters(db[table])
        for (const r of matched) Object.assign(r, state.updatePatch, { updated_at: nowIso() })
        return { data: matched, error: null }
      }
      const matched = applyFilters(db[table])
      return { data: matched, count: matched.length, error: null }
    }

    const q = {
      select: (_cols, opts) => {
        if (opts?.head) state.head = true
        return q
      },
      insert: (row) => {
        state.insertRow = row
        return q
      },
      update: (patch) => {
        state.updatePatch = patch
        return q
      },
      delete: () => {
        state.isDelete = true
        return q
      },
      eq: (c, v) => {
        state.filters.push(['eq', c, v])
        return q
      },
      in: (c, v) => {
        state.filters.push(['in', c, v])
        return q
      },
      ilike: (c, v) => {
        state.filters.push(['ilike', c, v])
        return q
      },
      limit: () => q,
      single: async () => {
        const res = exec()
        const row = Array.isArray(res.data) ? res.data[0] : res.data
        return { data: row ? { ...row } : null, error: row ? null : { message: 'not found' } }
      },
      maybeSingle: async () => {
        const res = exec()
        const row = Array.isArray(res.data) ? res.data[0] : res.data
        return { data: row ? { ...row } : null, error: null }
      },
      then: (cb) =>
        Promise.resolve(exec()).then((r) =>
          cb({ ...r, data: Array.isArray(r.data) ? r.data.map((x) => ({ ...x })) : r.data }),
        ),
    }
    return q
  }

  const client = {
    from: (table) => makeQuery(table),
    rpc: async (name, args) => {
      if (name === 'agent_action_block_history') {
        const reportes = db.accion_comentarios.filter((c) => c.accion_id === args.p_accion_id && c.tipo_comentario === 'bloqueo_reportado')
        return { data: { accionId: args.p_accion_id, reportes }, error: null }
      }
      return { data: null, error: null }
    },
  }

  return { db, client, nextUuid, nowIso }
}

describe('Text Complete Integrated Suite (Bloques A, B, C + Reconciliación + Cleanup)', () => {
  it('ejecuta Bloques A, B (E1-E13) y C (1-3) verificando DB real, 0 salidas externas y cleanup=0', async () => {
    const { db, client, nextUuid, nowIso } = makeInMemoryQaEnv()
    const convEntity = new Map()
    const convStage = new Map()
    const convDecisions = new Map()

    const users = {
      'tok-sa': { key: 'super_admin', usuarioId: 'u-sa', rol: 'Super Admin', accessToken: 'tok-sa', client },
      'tok-dir': { key: 'direccion', usuarioId: 'u-dir', rol: 'Direccion', accessToken: 'tok-dir', client },
      'tok-lid': { key: 'lider', usuarioId: 'u-lid', rol: 'Lider', accessToken: 'tok-lid', client },
      'tok-op': { key: 'operativo', usuarioId: 'u-op', rol: 'Operativo', accessToken: 'tok-op', client },
    }

    const createProposal = (user, { tool, resourceId = null, payload = {}, requestKey = null, batchId = null }) => {
      if (requestKey) {
        const dup = db.assistant_pending_ops.find((o) => o.usuario_id === user.usuarioId && o.tool === tool && o.request_key === requestKey && o.status === 'pending')
        if (dup) return { id: dup.id, tool, record: resourceId ? { id: resourceId } : undefined, batchId }
      }
      const id = nextUuid()
      const targetRow = resourceId ? db.acciones_diarias.find((a) => a.id === resourceId) : null
      db.assistant_pending_ops.push({
        id,
        usuario_id: user.usuarioId,
        tool,
        resource_id: resourceId,
        expected_updated_at: targetRow?.updated_at ?? null,
        payload,
        status: 'pending',
        request_key: requestKey || `rk-${id}`,
      })
      return { id, tool, record: resourceId ? { id: resourceId } : undefined, batchId }
    }

    const chatCaller = async ({ accessToken, conversationId, messages }) => {
      const user = users[accessToken]
      const msg = messages[messages.length - 1].content

      if (/¿Qué requiere mi atención hoy\?/i.test(msg)) {
        const visible = user.rol === 'Operativo'
          ? db.acciones_diarias.filter((a) => a.responsable === user.usuarioId)
          : db.acciones_diarias
        const first = visible[0]
        if (first) convEntity.set(conversationId, first.id)
        return {
          ok: true,
          status: 200,
          json: {
            answer: visible.map((a) => `${a.titulo_accion} (/kanban?accion=${a.id})`).join('\n'),
            agent: { intent: 'executive_brief', status: 'ok', references: visible.slice(0, 3).map((a) => ({ id: a.id })) },
          },
        }
      }
      if (/Profundiza en esa acción/i.test(msg)) {
        const id = convEntity.get(conversationId)
        return {
          ok: true,
          status: 200,
          json: {
            answer: `Detalle de acción. Abrir en Kanban: /kanban?accion=${id}`,
            agent: { intent: 'executive_evidence', status: 'ok', references: [{ id }] },
          },
        }
      }
      if (/Busca documentos/i.test(msg)) {
        if (user.rol === 'Operativo' || /inexistente/i.test(msg)) {
          return { ok: true, status: 200, json: { answer: 'No encontré documentos autorizados.', agent: { intent: 'query_knowledge', status: 'empty' } } }
        }
        const doc = db.agent_documents[0]
        return { ok: true, status: 200, json: { answer: `Documentación R3: ${doc?.title} — ${doc?.body}`, agent: { intent: 'query_knowledge', status: 'ok' } } }
      }
      if (/revisión ejecutiva/i.test(msg)) {
        convStage.set(conversationId, 1)
        return { ok: true, status: 200, json: { answer: 'Etapa 1/6 — Pulso general', agent: { intent: 'executive_review', status: 'ok' } } }
      }
      if (/^Siguiente etapa$/i.test(msg)) {
        const next = (convStage.get(conversationId) || 1) + 1
        convStage.set(conversationId, next)
        return { ok: true, status: 200, json: { answer: `Etapa ${next}/6`, agent: { intent: 'executive_review', status: 'ok' } } }
      }
      if (/^Etapa anterior$/i.test(msg)) {
        const prev = Math.max(1, (convStage.get(conversationId) || 2) - 1)
        convStage.set(conversationId, prev)
        return { ok: true, status: 200, json: { answer: `Etapa ${prev}/6`, agent: { intent: 'executive_review', status: 'ok' } } }
      }
      if (/^Omitir etapa$/i.test(msg)) {
        const next = (convStage.get(conversationId) || 2) + 1
        convStage.set(conversationId, next)
        return { ok: true, status: 200, json: { answer: `Etapa ${next}/6`, agent: { intent: 'executive_review', status: 'ok' } } }
      }
      if (/^Decisión:/i.test(msg)) {
        convDecisions.set(conversationId, msg)
        return { ok: true, status: 200, json: { answer: `Registrada: ${msg}`, agent: { intent: 'executive_review', status: 'ok' } } }
      }
      if (/Resume nuestras decisiones/i.test(msg)) {
        return { ok: true, status: 200, json: { answer: `Etapa 6/6 · ${convDecisions.get(conversationId) || ''}`, agent: { intent: 'executive_review', status: 'ok' } } }
      }
      if (/Muéstrame la acción /i.test(msg)) {
        const title = msg.replace(/^Muéstrame la acción\s+/i, '').trim()
        const row = db.acciones_diarias.find((a) => a.titulo_accion === title)
        if (row && (user.rol !== 'Operativo' || row.responsable === user.usuarioId)) {
          convEntity.set(conversationId, row.id)
        }
        return { ok: true, status: 200, json: { answer: row ? row.titulo_accion : 'No encontrada', agent: { intent: 'query_actions', status: 'ok' } } }
      }
      if (/Qué me recomiendas/i.test(msg)) {
        return { ok: true, status: 200, json: { answer: 'Recomiendo desbloquear la prioridad 1.', agent: { intent: 'recommend_next', status: 'ok' } } }
      }
      if (/Convierte los compromisos en propuestas/i.test(msg)) {
        const batchId = `batch-${nextUuid()}`
        const p1 = createProposal(user, { tool: 'agent_create_action', payload: { titulo_accion: 'Compromiso 1', batchId }, batchId })
        const p2 = createProposal(user, { tool: 'agent_create_action', payload: { titulo_accion: 'Compromiso 2', batchId }, batchId })
        return { ok: true, status: 200, json: { answer: 'Lote preparado', batchId, proposals: [p1, p2], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Crea una acción/i.test(msg)) {
        if (user.rol === 'Direccion' || user.rol === 'Analista') {
          return { ok: true, status: 200, json: { answer: 'Sin permiso', proposals: [], agent: { intent: 'write_request', status: 'forbidden' } } }
        }
        const m = msg.match(/llamada\s+([^\s]+)/i)
        const titulo = m ? m[1] : 'Accion desbloqueo'
        const p = createProposal(user, { tool: 'agent_create_action', payload: { titulo_accion: titulo, responsable: user.usuarioId, estado: 'Pendiente', prioridad: 'P2_Media' } })
        return { ok: true, status: 200, json: { answer: 'Propuesta lista', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Cambia la fecha de esa acción al (\d{4}-\d{2}-\d{2}) y prioridad alta/i.test(msg)) {
        const fecha = msg.match(/(\d{4}-\d{2}-\d{2})/)[1]
        const id = convEntity.get(conversationId)
        const p = createProposal(user, { tool: 'agent_update_fields', resourceId: id, payload: { accionId: id, fecha, prioridad: 'P1_Alta' } })
        return { ok: true, status: 200, json: { answer: 'Propuesta campos', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Pon prioridad alta a esa acción/i.test(msg)) {
        const id = convEntity.get(conversationId)
        const p = createProposal(user, { tool: 'agent_update_fields', resourceId: id, payload: { accionId: id, prioridad: 'P1_Alta' } })
        return { ok: true, status: 200, json: { answer: 'Propuesta prioridad', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Marca esa acción como verificada/i.test(msg)) {
        return { ok: true, status: 200, json: { answer: 'Verificado requiere validación humana.', proposals: [], agent: { intent: 'write_request', status: 'forbidden' } } }
      }
      if (/^Verifica esa acción$/i.test(msg)) {
        const id = convEntity.get(conversationId)
        const p = createProposal(user, { tool: 'agent_verify_action', resourceId: id, payload: { accionId: id } })
        return { ok: true, status: 200, json: { answer: 'Propuesta verificación', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Marca esa acción como hecha/i.test(msg)) {
        const id = convEntity.get(conversationId)
        if (!id) return { ok: true, status: 200, json: { answer: 'Sin acceso', proposals: [], agent: { intent: 'write_request', status: 'forbidden' } } }
        const p = createProposal(user, { tool: 'agent_set_action_status', resourceId: id, payload: { accionId: id, estado: 'Hecho' }, requestKey: `hecho-${id}` })
        return { ok: true, status: 200, json: { answer: 'Propuesta Hecho', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Cambia esa acción a en ejecución/i.test(msg)) {
        const id = convEntity.get(conversationId)
        const p = createProposal(user, { tool: 'agent_set_action_status', resourceId: id, payload: { accionId: id, estado: 'En_Ejecucion' } })
        return { ok: true, status: 200, json: { answer: 'Propuesta En_Ejecucion', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Bloquea esa acción porque (.+)/i.test(msg)) {
        const motivo = msg.match(/porque (.+)/i)[1]
        const id = convEntity.get(conversationId)
        const p = createProposal(user, { tool: 'agent_register_blocker', resourceId: id, payload: { accionId: id, motivo } })
        return { ok: true, status: 200, json: { answer: 'Propuesta bloqueo', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Agrega un comentario a esa acción:\s*(.+)/i.test(msg)) {
        const contenido = msg.match(/:\s*(.+)/)[1]
        const id = convEntity.get(conversationId)
        const p = createProposal(user, { tool: 'agent_add_comment', resourceId: id, payload: { accionId: id, contenido } })
        return { ok: true, status: 200, json: { answer: 'Propuesta comentario', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      if (/Avisa por correo al responsable/i.test(msg)) {
        const id = convEntity.get(conversationId)
        const p = createProposal(user, { tool: 'agent_notify_responsable', resourceId: id, payload: { accionId: id, canal: 'email', destinatarioId: 'u-op' } })
        return { ok: true, status: 200, json: { answer: 'Propuesta aviso', proposals: [p], agent: { intent: 'write_request', status: 'proposal' } } }
      }
      return { ok: true, status: 200, json: { answer: 'ok', agent: { intent: 'unknown', status: 'ok' } } }
    }

    const opsCaller = async ({ accessToken, action, opId, patch = {} }) => {
      const user = users[accessToken]
      const op = db.assistant_pending_ops.find((o) => o.id === opId)
      if (!op || op.usuario_id !== user.usuarioId) return { ok: false, status: 403, json: { error: 'No te pertenece' } }
      if (action === 'cancel') {
        op.status = 'cancelled'
        return { ok: true, status: 200, json: { status: 'cancelled' } }
      }
      if (action === 'edit') {
        Object.assign(op.payload, patch)
        op.request_key = `rk-edited-${nextUuid()}`
        return { ok: true, status: 200, json: { status: 'pending' } }
      }
      if (op.status === 'confirmed') {
        return { ok: true, status: 200, json: { status: 'confirmed', result: op.result } }
      }
      if (op.resource_id && op.expected_updated_at) {
        const target = db.acciones_diarias.find((a) => a.id === op.resource_id)
        if (target && target.updated_at !== op.expected_updated_at) {
          op.status = 'conflict'
          return { ok: false, status: 409, json: { error: 'El registro cambió después' } }
        }
      }
      let result = {}
      if (op.tool === 'agent_create_action') {
        const id = nextUuid()
        db.acciones_diarias.push({ id, ...op.payload, updated_at: nowIso() })
        result = { id, created: true }
      } else if (op.tool === 'agent_update_fields') {
        const row = db.acciones_diarias.find((a) => a.id === op.resource_id)
        if (op.payload.fecha) row.fecha = op.payload.fecha
        if (op.payload.prioridad) row.prioridad = op.payload.prioridad
        row.updated_at = nowIso()
        result = { id: row.id }
      } else if (op.tool === 'agent_set_action_status' || op.tool === 'agent_register_blocker') {
        const row = db.acciones_diarias.find((a) => a.id === op.resource_id)
        const prev = row.estado
        const nextEstado = op.tool === 'agent_register_blocker' ? 'Bloqueado' : op.payload.estado
        row.estado = nextEstado
        row.updated_at = nowIso()
        if (op.tool === 'agent_register_blocker') {
          db.accion_comentarios.push({
            id: nextUuid(),
            accion_id: row.id,
            contenido: `Causa reportada: ${op.payload.motivo}`,
            tipo_comentario: 'bloqueo_reportado',
          })
        }
        db.agent_action_receipts.push({
          pending_op_id: op.id,
          usuario_id: user.usuarioId,
          accion_id: row.id,
          estado_anterior: prev,
          estado_nuevo: nextEstado,
        })
        result = { ok: true, accionId: row.id, estado: nextEstado }
      } else if (op.tool === 'agent_add_comment') {
        db.accion_comentarios.push({ id: nextUuid(), accion_id: op.resource_id, contenido: op.payload.contenido })
        result = { id: op.resource_id }
      } else if (op.tool === 'agent_verify_action') {
        const row = db.acciones_diarias.find((a) => a.id === op.resource_id)
        row.estado = 'Verificado'
        row.updated_at = nowIso()
        result = { id: row.id, estado: 'Verificado' }
      } else if (op.tool === 'agent_notify_responsable') {
        const oid = nextUuid()
        db.qa_outbox.push({
          id: oid,
          idempotency_key: `agent-notify:${op.id}`,
          canal: op.payload.canal,
          accion_id: op.resource_id,
          to_usuario_id: op.payload.destinatarioId,
        })
        result = { id: oid, accionId: op.resource_id }
      }
      op.status = 'confirmed'
      op.result = result
      db.assistant_op_log.push({ id: nextUuid(), pending_op_id: op.id, tool: op.tool, result: 'executed', resource_id: op.resource_id })
      return { ok: true, status: 200, json: { status: 'confirmed', result } }
    }

    const report = await runTextCompleteSuite({
      runId: 'unit1',
      target: { ref: QA_REF },
      previewConfig: { baseUrl: 'https://preview.example.test', host: 'preview.example.test' },
      clients: {
        signInSuperAdmin: async () => users['tok-sa'],
        signInDireccion: async () => users['tok-dir'],
        signInLider: async () => users['tok-lid'],
        signInOperativo: async () => users['tok-op'],
        admin: client,
      },
      chatCaller,
      opsCaller,
    })

    expect(report.results.filter((r) => r.status !== 'PASS')).toEqual([])
    expect(report.cleanup.remainingTotal).toBe(0)
    expect(report.verdict).toBe('PASS')
    expect(report.counts.fail).toBe(0)
    expect(report.counts.blocked).toBe(0)
    expect(report.counts.pass).toBe(23) // 7 Bloque A + 13 Bloque B + 3 Bloque C
    expect(report.externalNotifications.after.email).toBe(0)
    expect(report.externalNotifications.after.whatsapp).toBe(0)
    expect(report.cleanup.remainingTotal).toBe(0)

    const md = formatCompactMarkdownReport({
      ...report,
      ranAt: '2026-11-24T12:00:00.000Z',
      expectedBranch: 'feature/r2-executive-action',
      expectedSha: VALID_SHA,
      targetRef: QA_REF,
      previewHost: 'preview.example.test',
    })
    expect(md).toContain('# Text Complete Integrated QA — PASS')
    expect(md).toContain('residuales=0')
  })

  it('reconcilia una ejecución incierta (504/timeout) detectando commit previo antes de reintentar', async () => {
    const { db, client } = makeInMemoryQaEnv()
    db.assistant_pending_ops.push({ id: 'op-1', status: 'confirmed', result: { ok: true }, resource_id: 'acc-1' })
    db.agent_action_receipts.push({ pending_op_id: 'op-1', estado_anterior: 'Pendiente', estado_nuevo: 'Hecho' })
    db.acciones_diarias.push({ id: 'acc-1', estado: 'Hecho', updated_at: '2026-11-24T12:00:00Z' })

    const rec = await reconcileUncertainOp({ client, opId: 'op-1', resourceId: 'acc-1' })
    expect(rec.committed).toBe(true)
    expect(rec.retrySafe).toBe(false)
    expect(rec.hasReceipt).toBe(true)
  })

  it('limpia fixtures incluso si un fallo crítico detiene la suite', async () => {
    const { db, client } = makeInMemoryQaEnv()
    const mkUser = (key, usuarioId, rol) => ({ key, usuarioId, rol, accessToken: `tok-${key}`, client })
    const report = await runTextCompleteSuite({
      runId: 'halt1',
      target: { ref: QA_REF },
      previewConfig: { baseUrl: 'https://preview.example.test', host: 'preview.example.test' },
      clients: {
        signInSuperAdmin: async () => mkUser('sa', 'u-sa', 'Super Admin'),
        signInDireccion: async () => mkUser('dir', 'u-dir', 'Direccion'),
        signInLider: async () => mkUser('lid', 'u-lid', 'Lider'),
        signInOperativo: async () => mkUser('op', 'u-op', 'Operativo'),
        admin: client,
      },
      chatCaller: async () => ({ ok: false, status: 500, json: { error: 'boom' } }),
      opsCaller: async () => ({ ok: false, status: 500, json: {} }),
    })
    expect(report.haltedOnCritical).toBe(true)
    expect(report.verdict).toBe('FAIL')
    expect(report.cleanup.attempted).toBe(true)
    expect(report.cleanup.remainingTotal).toBe(0)
    expect(db.acciones_diarias).toHaveLength(0)
    expect(db.agent_documents).toHaveLength(0)
  })
})

describe('Text Complete Rollback OFF', () => {
  it('dry-run no muta y --apply con autorización revierte los 4 flags Preview sin tocar Production', async () => {
    const env = validEnv({ TC_ROLLBACK_AUTH: REQUIRED_ROLLBACK_AUTH })
    let state = {
      AGENT_ORCHESTRATOR_R1: '1',
      AGENT_MEMORY_R3: '1',
      R2_EXECUTION_MODE: 'qa',
      COPILOT_R2_GATE: '1',
    }
    const fetchImpl = async (url, opts = {}) => {
      const u = String(url)
      if (opts.method === 'PATCH') {
        const body = JSON.parse(opts.body)
        expect(body.target).toEqual(['preview'])
        expect(body.gitBranch).toBe('feature/r2-executive-action')
        state[body.key] = body.value
        return { ok: true, status: 200, text: async () => '{}' }
      }
      if (u.includes('/v9/projects/')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              envs: Object.entries(state).map(([key, value], idx) => ({
                id: `env-${idx}`,
                key,
                value,
                gitBranch: 'feature/r2-executive-action',
                target: ['preview'],
              })),
            }),
        }
      }
      return { ok: false, status: 404, text: async () => '{}' }
    }

    const dry = await runTextCompleteRollback({ env, argv: [], fetchImpl })
    expect(dry.status).toBe('READY')
    expect(dry.mutated).toBe(false)
    expect(state.R2_EXECUTION_MODE).toBe('qa')

    const applied = await runTextCompleteRollback({ env, argv: ['--apply'], fetchImpl })
    expect(applied.status).toBe('PASS')
    expect(applied.allSafeAfter).toBe(true)
    expect(applied.productionUntouched).toBe(true)
    expect(state).toEqual({
      AGENT_ORCHESTRATOR_R1: '0',
      AGENT_MEMORY_R3: '0',
      R2_EXECUTION_MODE: 'disabled',
      COPILOT_R2_GATE: '0',
    })
  })
})
