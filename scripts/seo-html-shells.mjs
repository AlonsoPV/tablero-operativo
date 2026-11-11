/**
 * Genera shells HTML estáticos para /producto y /agente con meta + JSON-LD
 * indexables sin depender de CSR. Se ejecuta tras `vite build`.
 *
 * Uso: node scripts/seo-html-shells.mjs
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const distDir = join(root, 'dist')
const indexPath = join(distDir, 'index.html')

const BASE =
  (process.env.VITE_APP_URL || 'https://scrumbanemx.vercel.app').replace(/\/$/, '')

const PRODUCT = {
  path: '/producto',
  title: 'Scrumban | Software de Gestión y Ejecución Empresarial',
  description:
    'Conecta objetivos, equipos y compromisos. Gestiona acciones, OKRs y operaciones con seguimiento, indicadores y responsables.',
  keywords:
    'software de gestión empresarial, software de gestión de operaciones, plataforma de ejecución empresarial, seguimiento de compromisos, gestión de equipos de trabajo, software OKR, Scrumban',
  ogImage: `${BASE}/og/scrumban.svg`,
  ogImageAlt: 'Scrumban — software de gestión y ejecución empresarial',
  productName: 'Scrumban',
  relatedPath: '/agente',
  relatedName: 'Enviardián',
  sections: [
    {
      id: 'inicio',
      name: 'Software de gestión y ejecución empresarial',
      description:
        'Convierte la estrategia en resultados. Conecta objetivos, equipos y compromisos en un sistema para ejecutar, dar seguimiento y medir avances.',
    },
    {
      id: 'coordinacion',
      name: 'Coordinación entre áreas',
      description:
        'Gestión empresarial con visibilidad entre áreas: solicitudes, responsables, compromisos y estados en un mismo flujo.',
    },
    {
      id: 'ejecucion',
      name: 'Gestión de acciones y Kanban',
      description:
        'De los planes a compromisos con seguimiento: Kanban, prioridades, fechas, checkpoints, evidencias y verificación de cumplimiento.',
    },
    {
      id: 'visibilidad',
      name: 'OKRs e indicadores BAU',
      description:
        'Consulta objetivos estratégicos, indicadores BAU, retrasos y bloqueos. Una vista de atención semanal con profundidad progresiva.',
    },
    {
      id: 'seguimiento',
      name: 'Seguimiento operativo',
      description:
        'Detecta retrasos antes de que escalen: vencimientos, bloqueos, actualizaciones y reportes de avance.',
    },
    {
      id: 'colaboracion',
      name: 'Comunicación y colaboración',
      description:
        'Cada solicitud tiene contexto, responsable y respuesta. Comentarios y evidencias ligados al compromiso.',
    },
    {
      id: 'mejora',
      name: 'Mejora continua',
      description:
        'Convierte la ejecución en seguimiento, aprendizaje y mejores decisiones: objetivos, indicadores, gaps y próximas prioridades.',
    },
    {
      id: 'enviardian',
      name: 'Enviardián integrado',
      description:
        'Consulta objetivos, acciones y bloqueos en conversación. El asistente de IA complementa Scrumban sin desconectarse del tablero.',
    },
    {
      id: 'cierre',
      name: 'Estrategia con seguimiento',
      description:
        'Tu estrategia necesita ejecución. Tu ejecución necesita seguimiento. Solicita una demostración de Scrumban.',
    },
  ],
}

const AGENT = {
  path: '/agente',
  title: 'Enviardián | Asistente de IA para Empresas',
  description:
    'Consulta tu operación por voz o chat, identifica bloqueos, prepara acciones y da seguimiento a tu equipo con inteligencia artificial.',
  keywords:
    'asistente de IA para empresas, asistente empresarial con inteligencia artificial, asistente de voz para empresas, IA para seguimiento de compromisos, asistente IA con WhatsApp, Enviardián',
  ogImage: `${BASE}/og/enviardian.svg`,
  ogImageAlt: 'Enviardián — asistente de IA para empresas',
  productName: 'Enviardián',
  relatedPath: '/producto',
  relatedName: 'Scrumban',
  sections: [
    {
      id: 'inicio',
      name: 'Asistente de IA empresarial',
      description:
        'Consulta tu empresa, asigna compromisos y da seguimiento a tu equipo por voz, chat y WhatsApp.',
    },
    {
      id: 'visibilidad',
      name: 'Consultas de información operativa',
      description:
        'Consulta OKRs, BAU, KPIs, vencidos, bloqueos y pendientes de verificación en una respuesta priorizada.',
    },
    {
      id: 'accion',
      name: 'Propuestas de acciones',
      description:
        'Instrucción en lenguaje natural, propuesta con responsable, fecha, prioridad y evidencia. Confirmación humana antes de crear.',
    },
    {
      id: 'whatsapp',
      name: 'Seguimiento por WhatsApp',
      description:
        'Aviso autorizado, reportes, apoyo y evidencia por WhatsApp; el tablero refleja el cambio.',
    },
    {
      id: 'verificacion',
      name: 'Verificación de cumplimiento',
      description: 'Evidencias, historial e informes ejecutivos. Hecho no es Verificado.',
    },
    {
      id: 'asistente',
      name: 'Asistente por voz e historial',
      description:
        'Chat, resumen de sesión, informe PDF e historial. Compartir por WhatsApp cuando esté permitido.',
    },
    {
      id: 'integraciones',
      name: 'Integraciones condicionadas',
      description:
        'Borradores de Gmail y propuestas de Calendar con cuenta Google conectada. Nada se envía ni se crea sin confirmar.',
    },
    {
      id: 'demostracion',
      name: 'Demostración Enviardián',
      description:
        'Solicita una demostración o prueba Enviardián. Conecta dirección, responsables y seguimiento.',
    },
  ],
}

function buildJsonLd(landing) {
  const url = `${BASE}${landing.path}`
  const relatedUrl = `${BASE}${landing.relatedPath}`
  const websiteId = `${url}#website`
  const webpageId = `${url}#webpage`
  const orgId = `${url}#organization`
  const appId = `${url}#software`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: 'Scrumban',
        url,
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: 'Scrumban',
        url,
        description: landing.description,
        publisher: { '@id': orgId },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': appId,
        name: landing.productName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: landing.description,
        url,
        provider: { '@id': orgId },
      },
      {
        '@type': 'WebPage',
        '@id': webpageId,
        url,
        name: landing.title,
        description: landing.description,
        isPartOf: { '@id': websiteId },
        about: { '@id': appId },
        relatedLink: relatedUrl,
        mentions: {
          '@type': 'SoftwareApplication',
          name: landing.relatedName,
          url: relatedUrl,
        },
        hasPart: landing.sections.map((section) => ({
          '@type': 'WebPageElement',
          name: section.name,
          description: section.description,
          url: `${url}#${section.id}`,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Scrumban',
            item: BASE,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: landing.productName,
            item: url,
          },
        ],
      },
    ],
  }
}

function upsertMetaByName(html, name, content) {
  const re = new RegExp(`<meta\\s+name="${name}"[^>]*>`, 'i')
  const tag = `<meta name="${name}" content="${escapeAttr(content)}" />`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function upsertMetaByProperty(html, property, content) {
  const re = new RegExp(`<meta\\s+property="${property}"[^>]*>`, 'i')
  const tag = `<meta property="${property}" content="${escapeAttr(content)}" />`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function upsertLinkCanonical(html, href) {
  const re = /<link\s+rel="canonical"[^>]*>/i
  const tag = `<link rel="canonical" href="${escapeAttr(href)}" />`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function upsertJsonLd(html, id, data) {
  const re = new RegExp(
    `<script[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/script>`,
    'i'
  )
  const tag = `<script id="${id}" type="application/ld+json">${JSON.stringify(data)}</script>`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

function applyLandingShell(html, landing, jsonLdId) {
  const canonical = `${BASE}${landing.path}`
  let next = html
  next = next.replace(/<html\s+lang="[^"]*"/i, '<html lang="es-MX"')
  next = next.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(landing.title)}</title>`)
  next = upsertMetaByName(next, 'description', landing.description)
  next = upsertMetaByName(next, 'keywords', landing.keywords)
  next = upsertMetaByName(next, 'robots', 'index,follow')
  next = upsertMetaByProperty(next, 'og:title', landing.title)
  next = upsertMetaByProperty(next, 'og:description', landing.description)
  next = upsertMetaByProperty(next, 'og:type', 'website')
  next = upsertMetaByProperty(next, 'og:url', canonical)
  next = upsertMetaByProperty(next, 'og:image', landing.ogImage)
  next = upsertMetaByProperty(next, 'og:image:alt', landing.ogImageAlt)
  next = upsertMetaByProperty(next, 'og:image:width', '1200')
  next = upsertMetaByProperty(next, 'og:image:height', '630')
  next = upsertMetaByProperty(next, 'og:locale', 'es_MX')
  next = upsertMetaByName(next, 'twitter:card', 'summary_large_image')
  next = upsertMetaByName(next, 'twitter:title', landing.title)
  next = upsertMetaByName(next, 'twitter:description', landing.description)
  next = upsertMetaByName(next, 'twitter:image', landing.ogImage)
  next = upsertLinkCanonical(next, canonical)
  next = upsertJsonLd(next, jsonLdId, buildJsonLd(landing))
  return next
}

function writeShell(landing, jsonLdId) {
  if (!existsSync(indexPath)) {
    throw new Error(`No existe ${indexPath}. Ejecuta vite build antes.`)
  }
  const baseHtml = readFileSync(indexPath, 'utf8')
  const html = applyLandingShell(baseHtml, landing, jsonLdId)
  const outDir = join(distDir, landing.path.replace(/^\//, ''))
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'index.html')
  writeFileSync(outPath, html, 'utf8')
  console.log(`[seo-html-shells] wrote ${outPath}`)
}

writeShell(PRODUCT, 'scrumban-landing-jsonld')
writeShell(AGENT, 'scrumban-agent-landing-jsonld')
console.log('[seo-html-shells] done')
