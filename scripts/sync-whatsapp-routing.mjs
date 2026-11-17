/**
 * Copia el SSOT de enrutamiento WhatsApp a Edge Functions.
 * Uso: node scripts/sync-whatsapp-routing.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'lib', 'whatsappFlowRouting.ts')
const dest = join(root, 'supabase', 'functions', '_shared', 'whatsappFlowRouting.ts')

mkdirSync(dirname(dest), { recursive: true })
const body = readFileSync(src, 'utf8')
const banner =
  '/** AUTO-GENERATED from src/lib/whatsappFlowRouting.ts — run: node scripts/sync-whatsapp-routing.mjs */\n'
writeFileSync(dest, banner + body, 'utf8')
console.log(`Synced ${src} → ${dest}`)
