import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const productDir = path.join(root, 'src', 'pages', 'product')
const outPath = path.join(root, 'LANDING_PRODUCTO.md')

const minDeps = [
  'src/hooks/useInView.ts',
  'src/hooks/useCountUp.ts',
  'src/lib/spacing.ts',
  'src/lib/utils.ts',
  'src/features/operations/components/AccionPriorityBadge.tsx',
  'src/features/operations/utils/priorityLabels.ts',
  'src/features/operations/utils/priorityColors.ts',
]

const uiDeps = [
  'src/components/ui/button.tsx',
  'src/components/ui/badge.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/ui/input.tsx',
  'src/components/ui/label.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/tooltip.tsx',
  'src/components/SectionCard.tsx',
  'src/components/InfoHint.tsx',
  'src/features/operations/components/form/AccionFormBlock.tsx',
  'src/features/operations/components/AccionFormSection.tsx',
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
lines.push('# Landing `/producto` — código completo para replicar')
lines.push('')
lines.push('Documento generado desde el código fuente de `src/pages/product/` y sus dependencias UI.')
lines.push('Ruta pública: `/producto` → `ProductLandingPage`.')
lines.push('')
lines.push('## Índice de archivos')
lines.push('')
lines.push('| Archivo | Rol |')
lines.push('|---|---|')
lines.push('| `ProductLandingPage.tsx` | Orquestador de la página |')
lines.push('| `ProductHero.tsx` | Nav + hero |')
lines.push('| `ProductSections.tsx` | Problema, cultura, CTAs, capacidades, cierre |')
lines.push('| `ProductDemos.tsx` | Demos interactivos (Kanban, Dashboard, IA) |')
lines.push('| `ProductUI.tsx` | Shell, tipografía, CTAs, cards |')
lines.push('| `ProductVisual.tsx` | Patrones visuales / paneles |')
lines.push('| `landingSeo.ts` + `LandingSeoHead.tsx` | SEO / JSON-LD |')
lines.push('| `DemoRequest*.tsx` + `demoRequest.types.ts` | Modal solicitar demo |')
lines.push('| `RevealSection.tsx`, `CountUpValue.tsx`, `StatusToken.tsx`, `ExecutiveCaseSplit.tsx` | Utilidades UI |')
lines.push('| shadcn UI + `SectionCard` + formularios de acción + `globals.css` | Dependencias de réplica |')
lines.push('')
lines.push('## Stack y dependencias npm')
lines.push('')
lines.push('- React + TypeScript + Tailwind CSS')
lines.push('- `react-router-dom` (ruta lazy)')
lines.push('- `lucide-react` (iconos)')
lines.push('- `@dnd-kit/core` (demo Kanban drag & drop)')
lines.push('- `react-hook-form` + `zod` + `@hookform/resolvers` (formulario demo)')
lines.push('- `clsx` + `tailwind-merge` (`cn`)')
lines.push('- `class-variance-authority` (button/badge/label)')
lines.push('- `@radix-ui/react-slot`, `@radix-ui/react-dialog`, `@radix-ui/react-label`, `@radix-ui/react-select`, `@radix-ui/react-tooltip`')
lines.push('')
lines.push('## Ruta')
lines.push('')
lines.push(fence('tsx', `{
  path: '/producto',
  lazy: async () => {
    const { ProductLandingPage } = await import('@/pages/product/ProductLandingPage')
    return { Component: ProductLandingPage }
  },
},`))
lines.push('## Árbol de composición')
lines.push('')
lines.push(fence('', `DemoRequestProvider
├── LandingSeoHead
├── ProductHero (ProductNav + HeroProduct)
├── ProblemSection
├── CultureShiftSection
├── ProductInAction      (ProductDemos)
├── DashboardDemo        (ProductDemos)
├── MidPageCTA
├── AIDemo               (ProductDemos)
├── MoreCapabilitiesSection
├── CloseSection
└── Footer`))
lines.push('---')
lines.push('')
lines.push('## Código fuente — `src/pages/product/`')
lines.push('')

const files = fs
  .readdirSync(productDir)
  .filter((name) => /\.(tsx?|jsx?)$/.test(name))
  .sort((a, b) => a.localeCompare(b))

for (const name of files) {
  const abs = path.join(productDir, name)
  const rel = `src/pages/product/${name}`
  const lang = name.endsWith('.ts') ? 'ts' : 'tsx'
  lines.push(`### \`${rel}\``)
  lines.push('')
  lines.push(fence(lang, fs.readFileSync(abs, 'utf8')))
}

appendFiles(lines, 'Dependencias mínimas (hooks / spacing / utils / prioridad)', minDeps)
appendFiles(lines, 'Componentes UI y theme (réplica completa)', uiDeps)

lines.push('---')
lines.push('')
lines.push('## Notas de réplica')
lines.push('')
lines.push('1. Los demos (`ProductDemos`) son 100% locales: estado en memoria, sin Supabase ni localStorage.')
lines.push('2. Los CTAs abren `DemoRequestDialog` vía `DemoRequestProvider`.')
lines.push('3. `ComparisonSection` y `ExecutiveCaseSplit` existen en el código pero no están montados actualmente en `ProductLandingPage`.')
lines.push('4. Alias `@/` → `src/`.')
lines.push('5. Endpoint opcional: `POST /api/demo-request` (fallback a `mailto:demo@scrumban.mx`).')
lines.push('6. Configura Tailwind con `darkMode` y el plugin que mapea colores a `hsl(var(--token))` como en el proyecto.')
lines.push('')

fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
const stat = fs.statSync(outPath)
console.log(`Wrote ${outPath}`)
console.log(`Size: ${(stat.size / 1024).toFixed(1)} KB`)
console.log(`Product files: ${files.length}`)
console.log(`Min deps: ${minDeps.length}`)
console.log(`UI deps: ${uiDeps.length}`)
