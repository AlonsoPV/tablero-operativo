import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const functions = ['whatsapp-webhook', 'whatsapp-send-action', 'whatsapp-followup-dispatcher', 'whatsapp-inbox']

for (const name of functions) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [`supabase/functions/${name}/index.ts`],
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    target: 'es2022',
    external: ['npm:*'],
    write: false,
  })
  const dir = path.join(root, 'dist', 'supabase-dashboard', name)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'index.ts')
  await writeFile(file, `// @ts-nocheck\n${result.outputFiles[0].text}`)
  console.log(file)
}
