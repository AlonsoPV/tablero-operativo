/**
 * Deploy WhatsApp Edge Functions via Management API (curl/Node fetch),
 * bypassing CLI 3 TransportError (401/TLS wrapped as transport).
 *
 * Usage (PowerShell, NEW token, do not put it in .env):
 *   $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
 *   node --use-system-ca scripts/deploy-whatsapp-functions.mjs
 */
import tls from 'node:tls'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const getCA = tls.getCACertificates
const setCA = tls.setDefaultCACertificates
if (typeof getCA === 'function' && typeof setCA === 'function') {
  setCA([...new Set([...getCA('default'), ...getCA('system'), ...getCA('extra')])])
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Carga .env local sin pisar SUPABASE_ACCESS_TOKEN ya exportado en la shell. */
async function loadDotEnv() {
  try {
    const raw = await readFile(path.join(ROOT, '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const key = line.slice(0, i).trim()
      const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      if (!key || key === 'SUPABASE_ACCESS_TOKEN') continue
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // sin .env es ok
  }
}

await loadDotEnv()

const REF = process.env.SUPABASE_PROJECT_REF || 'xhpasmjzuwifmjhrsumb'
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()
const FN_DIR = path.join(ROOT, 'supabase', 'functions')

const FUNCTIONS = [
  { slug: 'whatsapp-webhook', files: ['index.ts', 'deno.json'] },
  { slug: 'whatsapp-send-action', files: ['index.ts', 'deno.json'] },
  { slug: 'whatsapp-followup-dispatcher', files: ['index.ts', 'deno.json'] },
  { slug: 'whatsapp-inbox', files: ['index.ts'] },
]

if (!TOKEN.startsWith('sbp_')) {
  console.error('Falta un PAT válido. Crea uno en https://supabase.com/dashboard/account/tokens')
  console.error(
    'Luego: $env:SUPABASE_ACCESS_TOKEN = "sbp_..." ; node --use-system-ca scripts/deploy-whatsapp-functions.mjs'
  )
  process.exit(1)
}

async function api(method, urlPath, { json, form } = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}` }
  let body
  if (form) {
    body = form
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  const res = await fetch(`https://api.supabase.com${urlPath}`, { method, headers, body })
  const text = await res.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} -> ${res.status} ${text.slice(0, 500)}`)
    err.status = res.status
    throw err
  }
  return parsed
}

async function deployOne({ slug, files }) {
  const form = new FormData()
  form.append(
    'metadata',
    JSON.stringify({
      name: slug,
      entrypoint_path: 'index.ts',
      verify_jwt: false,
    })
  )
  for (const name of files) {
    const abs = path.join(FN_DIR, slug, name)
    const buf = await readFile(abs)
    form.append('file', new Blob([buf]), name)
  }
  const result = await api('POST', `/v1/projects/${REF}/functions/deploy?slug=${slug}`, { form })
  console.log(`deployed ${slug} version=${result?.version ?? '?'} jwt=${result?.verify_jwt}`)
}

const probe = await fetch('https://api.supabase.com/v1/projects', {
  headers: { Authorization: `Bearer ${TOKEN}` },
})
if (probe.status === 401) {
  console.error('El token es inválido o caducó. Genera uno nuevo en Account → Access Tokens.')
  process.exit(1)
}
if (probe.status === 403) {
  console.error('El token no tiene acceso a este proyecto. Usa la cuenta dueña de Scrumban PROD.')
  process.exit(1)
}
if (!probe.ok) {
  console.error(`No pude listar proyectos: ${probe.status} ${await probe.text()}`)
  process.exit(1)
}

const projects = await probe.json()
const hit = (Array.isArray(projects) ? projects : []).find((p) => p.id === REF)
if (!hit) {
  console.error('Este token no ve el proyecto', REF)
  console.error(
    'Proyectos visibles:',
    (Array.isArray(projects) ? projects : []).map((p) => `${p.id} ${p.name}`).join(', ') || '(ninguno)'
  )
  process.exit(1)
}
console.log(`token ok → ${hit.name} (${REF})`)

const verifyToken =
  (process.env.WHATSAPP_VERIFY_TOKEN || process.env.token_de_verificacion || '').trim() ||
  'what2do_whatsapp_verify_2026'

await api('POST', `/v1/projects/${REF}/secrets`, {
  json: [
    { name: 'WHATSAPP_WEBHOOK_ALLOW_UNSIGNED', value: '1' },
    { name: 'WHATSAPP_VERIFY_TOKEN', value: verifyToken },
  ],
})
console.log(`secrets set: WHATSAPP_WEBHOOK_ALLOW_UNSIGNED=1, WHATSAPP_VERIFY_TOKEN (len=${verifyToken.length})`)

// Si no hay secreto de dispatcher, el cron (Vault vacío) deja de recibir 401.
// Cuando configures Vault, define WHATSAPP_DISPATCHER_SECRET en Edge + vault.

for (const fn of FUNCTIONS) {
  await deployOne(fn)
}

console.log('listo')
