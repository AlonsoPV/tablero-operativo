/**
 * Vercel Node ESM no resuelve `from './_shared/http'` (hace falta .js, o un bundle).
 * Empaqueta cada `api/*.ts` en un solo archivo para que el isolate no importe rutas locales.
 *
 * En Vercel sustituye el .ts por el bundle. En local no toca el working tree.
 */
import * as esbuild from 'esbuild'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(root, 'api')
const overwrite = process.env.VERCEL === '1'

const entries = (await readdir(apiDir)).filter(
  (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
)

if (entries.length === 0) {
  console.error('bundle-api: no se encontraron api/*.ts')
  process.exit(1)
}

const outdir = await mkdtemp(path.join(os.tmpdir(), 'tablero-api-'))

try {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: entries.map((name) => path.join('api', name)),
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    legalComments: 'none',
    logLevel: 'info',
    sourcemap: false,
  })

  for (const name of entries) {
    const bundled = await readFile(path.join(outdir, name.replace(/\.ts$/, '.js')), 'utf8')
    if (bundled.includes('./_shared/') || bundled.includes('../src/')) {
      throw new Error(`bundle-api: ${name} sigue importando rutas locales`)
    }
    if (overwrite) {
      await writeFile(path.join(apiDir, name), bundled)
    }
    console.log(`bundle-api: ${name} (${bundled.length} bytes)${overwrite ? ' [escrito]' : ''}`)
  }
} finally {
  await rm(outdir, { recursive: true, force: true })
}
