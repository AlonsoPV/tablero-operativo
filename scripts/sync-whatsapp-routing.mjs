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
  join(
    root,
    'supabase',
    'functions',
    'whatsapp-webhook',
    'whatsappFlowRouting.ts'
  ),
]

const body = readFileSync(src, 'utf8')
const banner =
  '/** AUTO-GENERATED from src/lib/whatsappFlowRouting.ts — run: node scripts/sync-whatsapp-routing.mjs */\n'
for (const dest of destinations) {
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, banner + body, 'utf8')
  console.log(`Synced ${src} → ${dest}`)
}

const inline = spawnSync(
  process.execPath,
  [join(root, 'scripts', 'inline-whatsapp-webhook-shared.mjs')],
  {
    cwd: root,
    stdio: 'inherit',
  }
)
if (inline.status !== 0) {
  process.exit(inline.status ?? 1)
}
// Keep ingress inlined for the Dashboard single-file deployment workflow.
const ingressPath = join(root, 'src', 'lib', 'whatsappIngress.ts')
const ingress = readFileSync(ingressPath, 'utf8').replace(/^export /gm, '')
const edgePath = join(
  root,
  'supabase',
  'functions',
  'whatsapp-webhook',
  'index.ts'
)
let edge = readFileSync(edgePath, 'utf8')
const beginIngress = '// BEGIN_WHATSAPP_INGRESS'
const endIngress = '// END_WHATSAPP_INGRESS'
const ingressBlock = `${beginIngress}\n${ingress}\n${endIngress}\n`
if (edge.includes(beginIngress)) {
  const a = edge.indexOf(beginIngress),
    b = edge.indexOf(endIngress, a) + endIngress.length
  edge = edge.slice(0, a) + ingressBlock + edge.slice(b)
} else edge += '\n' + ingressBlock
writeFileSync(edgePath, edge)
const commandSource = readFileSync(
  join(root, 'src', 'lib', 'whatsappCommands.ts'),
  'utf8'
).replace(/^export /gm, '')
let commandEdge = readFileSync(edgePath, 'utf8')
const commandStart = '// BEGIN_WHATSAPP_COMMANDS',
  commandEnd = '// END_WHATSAPP_COMMANDS'
const commandBlock = `${commandStart}\n${commandSource}\n${commandEnd}`
if (commandEdge.includes(commandStart)) {
  const a = commandEdge.indexOf(commandStart),
    b = commandEdge.indexOf(commandEnd, a) + commandEnd.length
  commandEdge = commandEdge.slice(0, a) + commandBlock + commandEdge.slice(b)
} else commandEdge += '\n' + commandBlock + '\n'
writeFileSync(edgePath, commandEdge)
