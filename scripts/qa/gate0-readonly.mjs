#!/usr/bin/env node
/* global process, console */
/**
 * Gate 0 READ ONLY: aísla destino QA vs DEV/PROD y comprueba si la instancia está viva.
 * No imprime secretos. No escribe. No arranca Docker ni aplica migraciones.
 * Uso: node scripts/qa/gate0-readonly.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BLOCKED_PROJECT_REFS, LOCAL_REF_RE, refFromUrl } from './qaGuard.mjs'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseEnv(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    out[t.slice(0, i)] = t.slice(i + 1)
  }
  return out
}

function probe(port, host = '127.0.0.1', ms = 800) {
  return new Promise((resolve) => {
    const s = createConnection({ host, port })
    const done = (ok) => {
      try { s.destroy() } catch { /* ignore */ }
      resolve(ok)
    }
    s.setTimeout(ms, () => done(false))
    s.on('connect', () => done(true))
    s.on('error', () => done(false))
  })
}

function jwtMeta(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString())
    return { iss: payload.iss ?? null, role: payload.role ?? null }
  } catch {
    return { iss: null, role: null }
  }
}

function blockedHits(value) {
  const t = String(value || '').toLowerCase()
  return BLOCKED_PROJECT_REFS.filter((r) => t.includes(r))
}

const env = parseEnv(join(repo, '.env.qa.local'))
const ports = {
  54421: await probe(54421),
  54521: await probe(54521),
  54422: await probe(54422),
  54522: await probe(54522),
  5180: await probe(5180),
}
const live = Object.values(ports).some(Boolean)
const urlHits = [...blockedHits(env.VITE_SUPABASE_URL), ...blockedHits(env.SUPABASE_URL), ...blockedHits(env.R2_QA_PROJECT_REFS)]
const missing = [
  'QA_A_SUPABASE_URL', 'QA_A_ANON_KEY', 'QA_A_LOCAL_REF',
  'QA_B_SUPABASE_URL', 'QA_B_ANON_KEY', 'QA_B_LOCAL_REF',
  'QA_ACCOUNT_PASSWORD',
].filter((k) => !env[k] && !process.env[k])

const verdict = !urlHits.length && live && missing.length === 0 ? 'VERIFIED' : 'BLOCKED'

const report = {
  verdict,
  reason: !urlHits.length
    ? (live ? (missing.length ? 'instancia alcanzable pero faltan QA_A_*/QA_B_*/password de sesión' : 'ok')
      : 'destino declarado local y distinto de DEV/PROD, pero ningún puerto QA responde')
    : 'la configuración menciona DEV o PROD',
  destination: {
    viteUrl: env.VITE_SUPABASE_URL ?? null,
    hostedRef: refFromUrl(env.SUPABASE_URL),
    qaLocal: env.QA_LOCAL === '1',
    qaLocalRef: env.QA_LOCAL_REF ?? null,
    qaLocalRefOk: LOCAL_REF_RE.test(env.QA_LOCAL_REF || ''),
    allowlist: env.R2_QA_PROJECT_REFS ?? null,
    blockedHits: urlHits,
  },
  flags: {
    AGENT_ORCHESTRATOR_R1: env.AGENT_ORCHESTRATOR_R1 ?? '(unset)',
    R2_EXECUTION_MODE: env.R2_EXECUTION_MODE ?? '(unset)',
    AGENT_MEMORY_R3: env.AGENT_MEMORY_R3 ?? '(unset)',
    COPILOT_R2_GATE: env.COPILOT_R2_GATE ?? '(unset)',
  },
  jwtIssRole: jwtMeta(env.SUPABASE_ANON_KEY),
  livePorts: ports,
  missingSessionVars: missing,
  r3MigrationInRepo: existsSync(join(repo, 'supabase/migrations/20261121150601_agent_memory_documents.sql')),
  r3MigrationInQaACopy: existsSync(join(repo, '../scrumban-qa/instances/qa-a/supabase/migrations/20261121150601_agent_memory_documents.sql')),
}

console.log(JSON.stringify(report, null, 2))
process.exit(verdict === 'VERIFIED' ? 0 : 2)
