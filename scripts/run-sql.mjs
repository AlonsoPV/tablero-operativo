/**
 * Ejecuta SQL contra el proyecto Supabase usando la Management API.
 *
 * Requiere en .env: VITE_SUPABASE_URL (para el project ref) + SUPABASE_ACCESS_TOKEN.
 *
 * Uso:
 *   node scripts/run-sql.mjs "select 1" [--insecure-tls]
 *   node scripts/run-sql.mjs --file ruta/al/archivo.sql
 */

import { readFileSync } from 'fs'
import { loadDotenv } from './_load-dotenv.mjs'
import { configureNodeTls } from './_configure-node-tls.mjs'

loadDotenv(import.meta.url)

const argv = process.argv.slice(2)
configureNodeTls(argv)

const fileIndex = argv.indexOf('--file')
const query =
  fileIndex >= 0
    ? readFileSync(argv[fileIndex + 1], 'utf8')
    : argv.find((a) => !a.startsWith('--'))

if (!query) {
  console.error('Falta el SQL. Uso: node scripts/run-sql.mjs "select 1" | --file archivo.sql')
  process.exit(1)
}

const refIndex = argv.indexOf('--ref')
const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token || (refIndex < 0 && !url)) {
  console.error('Faltan VITE_SUPABASE_URL (o --ref) y SUPABASE_ACCESS_TOKEN en .env')
  process.exit(1)
}

const ref = refIndex >= 0 ? argv[refIndex + 1] : new URL(url).hostname.split('.')[0]

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
})

const text = await response.text()
if (!response.ok) {
  console.error(`HTTP ${response.status}: ${text}`)
  process.exit(1)
}

try {
  console.log(JSON.stringify(JSON.parse(text), null, 2))
} catch {
  console.log(text)
}
