/**
 * Vercel Node ESM no resuelve `from './_shared/http'` (hace falta .js, o un bundle).
 * Empaqueta cada `api/*.ts` en un solo archivo para que el isolate no importe rutas locales.
 *
 * En Vercel sustituye el .ts por el bundle con @ts-nocheck: el glob `api/*.js`
 * no puede ir en vercel.json porque esos archivos no existen en el repo.
 */
import * as esbuild from 'esbuild'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(root, 'api')
const overwrite = process.env.VERCEL === '1'
const BUNDLE_MARKER = '// @ts-nocheck — bundled by scripts/bundle-api.mjs'

const allEntries = (await readdir(apiDir)).filter(
  (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
)

if (allEntries.length === 0) {
  console.error('bundle-api: no se encontraron api/*.ts')
  process.exit(1)
}

const entries = []
for (const name of allEntries) {
  const head = (await readFile(path.join(apiDir, name), 'utf8')).slice(0, BUNDLE_MARKER.length + 4)
  if (head.startsWith(BUNDLE_MARKER)) {
    console.log(`bundle-api: ${name} [ya empaquetado, omitido]`)
    continue
  }
  entries.push(name)
}

if (entries.length === 0) {
  process.exit(0)
}

const outdir = await mkdtemp(path.join(os.tmpdir(), 'tablero-api-'))

try {
  const { metafile } = await esbuild.build({
    absWorkingDir: root,
    entryPoints: entries.map((name) => path.join('api', name)),
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    alias: { '@': './src' },
    legalComments: 'none',
    logLevel: 'info',
    sourcemap: false,
    metafile: true,
  })
  for (const [output, entry] of Object.entries(metafile.outputs)) {
    const unresolved = entry.imports.find(({ external, path }) => external && path.startsWith('@/'))
    if (unresolved) throw new Error(`bundle-api: ${output} dejó sin resolver ${unresolved.path}`)
  }

  for (const name of entries) {
    const bundled = await readFile(path.join(outdir, name.replace(/\.ts$/, '.js')), 'utf8')
    if (bundled.includes('./_shared/') || bundled.includes('../src/')) {
      throw new Error(`bundle-api: ${name} sigue importando rutas locales`)
    }
    if (overwrite) {
      await writeFile(path.join(apiDir, name), `${BUNDLE_MARKER}\n${bundled}`)
    }
    console.log(`bundle-api: ${name} (${bundled.length} bytes)${overwrite ? ' [escrito]' : ''}`)
  }
} finally {
  await rm(outdir, { recursive: true, force: true })
}
