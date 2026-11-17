/**
 * Copia el SSOT de enrutamiento WhatsApp a Edge Functions e inlinea en index.ts.
 * Uso: node scripts/sync-whatsapp-routing.mjs
 *
 * Dashboard / --use-api solo sube index.ts (no ../_shared ni archivos hermanos).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'lib', 'whatsappFlowRouting.ts')
const destinations = [
  join(root, 'supabase', 'functions', '_shared', 'whatsappFlowRouting.ts'),
  join(root, 'supabase', 'functions', 'whatsapp-webhook', 'whatsappFlowRouting.ts'),
]

const body = readFileSync(src, 'utf8')
const banner =
  '/** AUTO-GENERATED from src/lib/whatsappFlowRouting.ts — run: node scripts/sync-whatsapp-routing.mjs */\n'
for (const dest of destinations) {
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, banner + body, 'utf8')
  console.log(`Synced ${src} → ${dest}`)
}

const inline = spawnSync(process.execPath, [join(root, 'scripts', 'inline-whatsapp-webhook-shared.mjs')], {
  cwd: root,
  stdio: 'inherit',
})
if (inline.status !== 0) {
  process.exit(inline.status ?? 1)
}
