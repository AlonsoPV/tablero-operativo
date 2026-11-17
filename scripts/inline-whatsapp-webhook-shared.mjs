/**
 * Dashboard / --use-api solo sube index.ts (sin hermanos ni ../_shared).
 * Incrusta whatsappFlowRouting + operationalAliases entre marcadores en index.ts.
 *
 * Uso: node scripts/inline-whatsapp-webhook-shared.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fnDir = join(root, 'supabase', 'functions', 'whatsapp-webhook')
const indexPath = join(fnDir, 'index.ts')
const routingPath = join(fnDir, 'whatsappFlowRouting.ts')
const aliasesPath = join(fnDir, 'operationalAliases.ts')

function stripExports(source) {
  return source.replace(/^export /gm, '')
}

function stripAutoBanner(source) {
  return source.replace(/^\/\*\* AUTO-GENERATED[\s\S]*?\*\/\r?\n/, '')
}

const routing = stripExports(stripAutoBanner(readFileSync(routingPath, 'utf8'))).trim()
const aliases = stripExports(readFileSync(aliasesPath, 'utf8')).trim()

let index = readFileSync(indexPath, 'utf8')

// Quitar imports a módulos hermanos (si existen)
index = index.replace(
  /\r?\nimport \{\r?\n  askFlowClarificationText,[\s\S]*?\} from ['"]\.\/whatsappFlowRouting\.ts['"]\r?\nimport \{ OVERDUE_ALIASES \} from ['"]\.\/operationalAliases\.ts['"]\r?\n/,
  '\n'
)
index = index.replace(
  /\r?\nimport \{\r?\n  askFlowClarificationText,[\s\S]*?\} from ['"]\.\.\/_shared\/whatsappFlowRouting\.ts['"]\r?\nimport \{ OVERDUE_ALIASES \} from ['"]\.\.\/_shared\/operationalAliases\.ts['"]\r?\n/,
  '\n'
)

const beginRouting = '// BEGIN_WHATSAPP_FLOW_ROUTING'
const endRouting = '// END_WHATSAPP_FLOW_ROUTING'
const beginAliases = '// BEGIN_OPERATIONAL_ALIASES'
const endAliases = '// END_OPERATIONAL_ALIASES'

const block = [
  '// ---- inlined for Dashboard/--use-api (no sibling modules) ----',
  beginRouting,
  routing,
  endRouting,
  '',
  beginAliases,
  aliases,
  endAliases,
  '// ---- end inlined ----',
  '',
].join('\n')

if (index.includes(beginRouting) && index.includes(endAliases)) {
  const start = index.indexOf('// ---- inlined for Dashboard')
  const altStart = index.indexOf(beginRouting)
  const from = start >= 0 ? start : altStart
  const to = index.indexOf(endAliases) + endAliases.length
  // Also swallow trailing blank / end marker comment
  let end = to
  const endComment = '// ---- end inlined ----'
  const endIdx = index.indexOf(endComment, to)
  if (endIdx >= 0 && endIdx - to < 80) {
    end = endIdx + endComment.length
  }
  index = `${index.slice(0, from).replace(/\s+$/, '')}\n\n${block}\n${index.slice(end).replace(/^\s+/, '')}`
} else {
  const anchor = 'const OPS_FALLBACK_WINDOW_MS'
  const at = index.indexOf(anchor)
  if (at < 0) throw new Error('OPS_FALLBACK_WINDOW_MS anchor not found in index.ts')
  index = `${index.slice(0, at)}${block}\n${index.slice(at)}`
}

// Cabecera: aclarar autocontención
if (!index.includes('Dashboard/--use-api')) {
  index = index.replace(
    ' * Dos flujos independientes',
    ' * Autocontenida para Dashboard/--use-api (routing inlined).\n * Dos flujos independientes'
  )
}

writeFileSync(indexPath, index, 'utf8')
console.log(`Inlined routing+aliases into ${indexPath}`)
