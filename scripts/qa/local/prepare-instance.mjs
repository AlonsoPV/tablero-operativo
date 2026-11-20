#!/usr/bin/env node
/* global process, console */
// Genera las instancias Supabase Local QA A y QA B fuera del repositorio (R1/R2).
// Cada instancia tiene project_id, puertos y llave de firma JWT propios, un stack mínimo y una COPIA
// de supabase/migrations con las adaptaciones de R2-15. Las migraciones originales no se tocan.
// Sólo QA A recibe el seed QA (agent_execution_gate + qa_outbox) con su referencia sintética.
// Uso: node scripts/qa/local/prepare-instance.mjs [--out=<dir>]   (por defecto ../scrumban-qa/instances)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BLOCKED_PROJECT_REFS, LOCAL_REF_RE } from '../qaGuard.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const outArg = process.argv.find((a) => a.startsWith('--out='))
const outRoot = resolve(outArg ? outArg.slice(6) : join(repo, '..', 'scrumban-qa', 'instances'))
if (outRoot.startsWith(repo)) {
  console.error('QA GUARD: las instancias se generan fuera del repositorio')
  process.exit(2)
}

const INSTANCES = [
  { key: 'qa-a', target: 'A', ref: 'qalocala000000000000', base: 54420, seed: true },
  { key: 'qa-b', target: 'B', ref: 'qalocalb000000000000', base: 54520, seed: false },
]

const FORBIDDEN = [...BLOCKED_PROJECT_REFS, '83a033bd-e273-4314-8c9a-6a6bd8f4400e']
const CRON_BLOCK = /SELECT cron\.schedule\([\s\S]*?\$\$\s*\);/g

/** Adaptaciones sólo para QA local. Cada una debe aplicar exactamente donde se espera. */
const PATCHES = [
  {
    prefix: '20260313190000_',
    why: 'asigna super_admin a un UUID fijo de un usuario real (FK a auth.users)',
    apply: () => '-- QA local (R2-15): omitida; asignaba super_admin a un usuario real de otro entorno.\nselect 1;\n',
  },
  {
    prefix: '20260625161411_',
    why: 'CREATE OR REPLACE quita defaults de try_set_accion_hecho sin DROP previo',
    apply: (sql) => `-- QA local (R2-15): DROP previo para poder redefinir sin defaults.\nDROP FUNCTION IF EXISTS public.try_set_accion_hecho(uuid, uuid);\n${sql}`,
  },
  {
    prefix: '20260601170000_',
    why: 'ALTER TABLE auth.users exige ser dueño (supabase_auth_admin) en Supabase Local',
    apply: (sql) => {
      const alter = /ALTER TABLE auth\.users[\s\S]*?;/
      if (!alter.test(sql)) throw new Error('20260601170000_: no se encontró ALTER TABLE auth.users')
      return sql.replace(alter, '-- QA local: ALTER TABLE auth.users omitido; GoTrue ya crea los tokens como cadena vacía.')
    },
  },
  ...['20260629201032_', '20261103121000_', '20261104140000_'].map((prefix) => ({
    prefix,
    why: 'cron.schedule llama a Edge Functions de PROD',
    apply: (sql) => {
      const blocks = sql.match(CRON_BLOCK) ?? []
      if (blocks.length !== 1) throw new Error(`${prefix}: se esperaba 1 cron.schedule, hay ${blocks.length}`)
      return sql
        .replace(CRON_BLOCK, '-- QA local (R2-15): cron.schedule omitido; llamaba a Edge Functions de PROD.')
        .split('\n')
        .filter((line) => !(line.trimStart().startsWith('--') && FORBIDDEN.some((f) => line.includes(f))))
        .join('\n')
    },
  })),
]

function configToml({ key, base }) {
  return `# Generado por scripts/qa/local/prepare-instance.mjs. Instancia QA local, nunca DEV ni PROD.
project_id = "scrumban-${key}"

[api]
enabled = true
port = ${base + 1}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = ${base + 2}
shadow_port = ${base + 0}
major_version = 17

[db.pooler]
enabled = false
port = ${base + 9}

[db.migrations]
enabled = true

[db.seed]
enabled = true
sql_paths = ["./seed.sql"]

[realtime]
enabled = false

[studio]
enabled = false
port = ${base + 3}

[local_smtp]
enabled = false
port = ${base + 4}

[storage]
enabled = true
file_size_limit = "50MiB"

[storage.s3_protocol]
enabled = false

[storage.vector]
enabled = false

[auth]
enabled = true
site_url = "http://127.0.0.1:5173"
additional_redirect_urls = ["http://localhost:5173"]
jwt_expiry = 3600
enable_signup = true
signing_keys_path = "./signing_keys.json"

[auth.email]
enabled = true
enable_confirmations = false

[edge_runtime]
enabled = false

[analytics]
enabled = false
port = ${base + 7}
`
}

function seedSql(ref) {
  if (!LOCAL_REF_RE.test(ref)) throw new Error(`ref local inválida: ${ref}`)
  const raw = readFileSync(join(repo, 'supabase', 'scripts', 'qa', 'seed_qa_environment.sql'), 'utf8')
  if (!raw.includes("'__QA_PROJECT_REF__'")) throw new Error('el seed QA ya no tiene el marcador __QA_PROJECT_REF__')
  return raw.replace("'__QA_PROJECT_REF__'", `'${ref}'`)
}

function prepare(instance) {
  const dir = join(outRoot, instance.key, 'supabase')
  const migOut = join(dir, 'migrations')
  rmSync(migOut, { recursive: true, force: true })
  mkdirSync(migOut, { recursive: true })
  const migIn = join(repo, 'supabase', 'migrations')
  const files = readdirSync(migIn).filter((f) => f.endsWith('.sql')).sort()
  const applied = new Set()
  for (const file of files) {
    let sql = readFileSync(join(migIn, file), 'utf8')
    for (const patch of PATCHES.filter((p) => file.startsWith(p.prefix))) {
      sql = patch.apply(sql)
      applied.add(patch.prefix)
    }
    writeFileSync(join(migOut, file), sql)
  }
  const missing = PATCHES.filter((p) => !applied.has(p.prefix)).map((p) => p.prefix)
  if (missing.length) throw new Error(`adaptaciones sin migración destino: ${missing.join(', ')}`)

  writeFileSync(join(dir, 'config.toml'), configToml(instance))
  writeFileSync(join(dir, 'seed.sql'), instance.seed ? seedSql(instance.ref) : '-- QA B: sin seed (sin puerta de ejecución).\n')
  if (!existsSync(join(dir, '.gitignore'))) writeFileSync(join(dir, '.gitignore'), 'signing_keys.json\n.temp/\n.branches/\n')

  // seed.sql cita DEV/PROD sólo en su propia guarda (`if v_ref in (...) then raise`).
  for (const file of readdirSync(migOut).concat(['../config.toml'])) {
    const text = readFileSync(join(migOut, file), 'utf8')
    const hit = FORBIDDEN.find((f) => text.includes(f))
    if (hit) throw new Error(`QA GUARD: ${file} aún contiene ${hit}`)
  }
  return { key: instance.key, ref: instance.ref, apiPort: instance.base + 1, dbPort: instance.base + 2, migrations: files.length }
}

try {
  const summary = INSTANCES.map(prepare)
  writeFileSync(join(outRoot, 'instances.json'), JSON.stringify({ generatedAt: new Date().toISOString(), instances: summary }, null, 2))
  for (const s of summary) console.log(`${s.key}: ref ${s.ref} · API 127.0.0.1:${s.apiPort} · DB ${s.dbPort} · ${s.migrations} migraciones`)
  console.log(`Adaptaciones R2-15: ${PATCHES.map((p) => `${p.prefix.slice(0, -1)} (${p.why})`).join('; ')}`)
  console.log(`Salida: ${outRoot}`)
} catch (error) {
  console.error(error.message)
  process.exit(2)
}
