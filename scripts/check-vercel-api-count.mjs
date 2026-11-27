/**
 * Hobby: máximo 12 serverless functions. Este repo deja 1 de holgura,
 * así que api/*.ts (no test) no puede superar 11.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_DIR = path.join(ROOT, 'api')
const MAX_FUNCTIONS = 11

const files = fs
  .readdirSync(API_DIR)
  .filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
  .sort()

if (files.length > MAX_FUNCTIONS) {
  console.error(
    `Hobby cap: ${files.length} archivos api/*.ts (máximo ${MAX_FUNCTIONS}; Vercel Hobby admite 12).`
  )
  console.error(files.map((name) => `  - api/${name}`).join('\n'))
  process.exit(1)
}

console.log(`api function files: ${files.length}/${MAX_FUNCTIONS}`)
for (const name of files) console.log(`  - api/${name}`)
