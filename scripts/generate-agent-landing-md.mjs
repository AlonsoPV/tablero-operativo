import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const agentDir = path.join(root, 'src', 'pages', 'agent')
const outPath = path.join(root, 'LANDING_AGENTE.md')

/** Componentes compartidos de product que usa la landing /agente. */
const sharedProductDeps = [
  'src/pages/product/ProductUI.tsx',
  'src/pages/product/ProductVisual.tsx',
  'src/pages/product/DemoRequestContext.tsx',
  'src/pages/product/DemoRequestDialog.tsx',
  'src/pages/product/demoRequest.types.ts',
  'src/pages/product/StatusToken.tsx',
  'src/pages/product/RevealSection.tsx',
  'src/pages/product/CountUpValue.tsx',
]

const minDeps = [
  'src/hooks/useInView.ts',
  'src/hooks/useCountUp.ts',
  'src/lib/spacing.ts',
  'src/lib/utils.ts',
]

const uiDeps = [
  'src/components/ui/button.tsx',
  'src/components/ui/badge.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/ui/input.tsx',
  'src/components/ui/label.tsx',
  'src/components/ui/select.tsx',
  'src/styles/globals.css',
]

const fence = (lang, body) => `\`\`\`${lang}\n${body.replace(/\r\n/g, '\n').trimEnd()}\n\`\`\`\n`

function appendFiles(lines, title, relPaths) {
  lines.push('---')
  lines.push('')
  lines.push(`## ${title}`)
  lines.push('')
  for (const rel of relPaths) {
    const abs = path.join(root, rel)
    lines.push(`### \`${rel}\``)
    lines.push('')
    if (!fs.existsSync(abs)) {
      lines.push(`> Archivo no encontrado: \`${rel}\``)
      lines.push('')
      continue
    }
    const ext = path.extname(rel).slice(1)
    const lang = ext === 'css' ? 'css' : ext === 'ts' ? 'ts' : 'tsx'
    lines.push(fence(lang, fs.readFileSync(abs, 'utf8')))
  }
}

const lines = []
// Evita que GitHub Pages / Jekyll interprete `{{` del JSX como Liquid.
lines.push('{% raw %}')
lines.push('# Landing `/agente` — código completo para replicar')
lines.push('')
lines.push('Documento generado desde el código fuente de `src/pages/agent/` y dependencias compartidas con `/producto`.')
lines.push('Ruta pública: `/agente` → `AgentLandingPage`.')
lines.push('')
lines.push('## Índice de archivos')
lines.push('')
lines.push('| Archivo | Rol |')
lines.push('|---|---|')
lines.push('| `AgentLandingPage.tsx` | Orquestador de la página |')
lines.push('| `AgentHero.tsx` | Nav + hero (WhatsApp + agente) |')
lines.push('| `AgentSections.tsx` | Problema, cultura, CTAs, capacidades, cierre |')
lines.push('| `AgentDemos.tsx` | Demos (WhatsApp, propuestas, canales) |')
lines.push('| `agentSeo.ts` + `AgentSeoHead.tsx` | SEO / JSON-LD |')
lines.push('| `ProductUI` / `ProductVisual` / `DemoRequest*` / tokens | Compartido con `/producto` |')
lines.push('')
lines.push('## Stack y dependencias npm')
lines.push('')
lines.push('- React + TypeScript + Tailwind CSS')
lines.push('- `react-router-dom` (ruta lazy `/agente`)')
lines.push('- `lucide-react` (iconos)')
lines.push('- `react-hook-form` + `zod` + `@hookform/resolvers` (formulario demo compartido)')
lines.push('- `clsx` + `tailwind-merge` (`cn`)')
lines.push('- `class-variance-authority` + Radix (`Button`, `Badge`, `Dialog`, `Input`, `Label`, `Select`)')
lines.push('')
lines.push('## Ruta')
lines.push('')
lines.push(fence('tsx', `{
  path: '/agente',
  lazy: async () => {
    const { AgentLandingPage } = await import('@/pages/agent/AgentLandingPage')
    return { Component: AgentLandingPage }
  },
},`))
lines.push('## Árbol de composición')
lines.push('')
lines.push(fence('', `DemoRequestProvider
├── AgentSeoHead
├── AgentHero (AgentNav + HeroAgentPreview)
├── AgentProblemSection
├── AgentCultureShiftSection
├── WhatsAppInAction       (AgentDemos)
├── AgentProposalsDemo     (AgentDemos)
├── AgentMidPageCTA
├── AgentChannelsDemo      (AgentDemos)
├── AgentCapabilitiesSection
├── AgentCloseSection
└── Footer`))
lines.push('---')
lines.push('')
lines.push('## Código fuente — `src/pages/agent/`')
lines.push('')

const files = fs
  .readdirSync(agentDir)
  .filter((name) => /\.(tsx?|jsx?)$/.test(name))
  .sort((a, b) => a.localeCompare(b))

for (const name of files) {
  const abs = path.join(agentDir, name)
  const rel = `src/pages/agent/${name}`
  const lang = name.endsWith('.ts') ? 'ts' : 'tsx'
  lines.push(`### \`${rel}\``)
  lines.push('')
  lines.push(fence(lang, fs.readFileSync(abs, 'utf8')))
}

appendFiles(lines, 'Dependencias compartidas de `src/pages/product/`', sharedProductDeps)
appendFiles(lines, 'Dependencias mínimas (hooks / spacing / utils)', minDeps)
appendFiles(lines, 'Componentes UI y theme', uiDeps)

lines.push('---')
lines.push('')
lines.push('## Notas de réplica')
lines.push('')
lines.push('1. Los demos (`AgentDemos`) son 100% locales: no llaman Meta, Gemini ni Supabase.')
lines.push('2. Los CTAs reutilizan `DemoRequestProvider` / `DemoRequestDialog` de `/producto`.')
lines.push('3. El shell visual (`LandingShell`, `Eyebrow`, `PrimaryCTA`, etc.) vive en `ProductUI`.')
lines.push('4. Alias `@/` → `src/`.')
lines.push('5. Endpoint opcional del formulario: `POST /api/demo-request` (fallback `mailto:demo@scrumban.mx`).')
lines.push('6. Enlace cruzado en nav/footer hacia `/producto`.')
lines.push('{% endraw %}')
lines.push('')

fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
const stat = fs.statSync(outPath)
console.log(`Wrote ${outPath}`)
console.log(`Size: ${(stat.size / 1024).toFixed(1)} KB`)
console.log(`Agent files: ${files.length}`)
console.log(`Shared product deps: ${sharedProductDeps.length}`)
console.log(`Min deps: ${minDeps.length}`)
console.log(`UI deps: ${uiDeps.length}`)
