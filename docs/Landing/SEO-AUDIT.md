# Auditoría SEO inicial — Scrumban / Enviardián

Fecha de referencia: implementación de `docs/Landing/SEO.md`.
Dominio público definitivo en proyecto: `https://scrumbanemx.vercel.app` (`VITE_APP_URL`).

## Rutas comerciales

| Producto | Ruta | H1 visible |
|----------|------|------------|
| Scrumban | `/producto` | Convierte la estrategia en resultados. |
| Enviardián | `/agente` | Tu operación, bajo control. |

`/` no es landing de marketing: redirige a la app autenticada (`/kanban`).

## Hallazgos previos (antes de la implementación)

1. Metadatos solo en CSR (`LandingSeoHead` / `AgentSeoHead`); el HTML inicial era genérico (`index.html`).
2. Titles y descriptions no coincidían con el copy del spec SEO.
3. Sin `robots.txt`, sin `sitemap.xml`, sin `og:image` / `twitter:image`.
4. Sin `meta robots` en landings ni `noindex` en rutas de aplicación.
5. JSON-LD: `WebPage.isPartOf` apuntaba a `#website` sin `@id` en `WebSite`.
6. Sin `Organization` ni `BreadcrumbList`.
7. `html lang="es"` (spec: `es-MX`).
8. Enlaces cruzados en nav; faltaba copy contextual del spec en secciones.

## Mapa de keywords (hipótesis)

Sin volúmenes ni rankings afirmados.

### Scrumban (`/producto`)

- Principal: software de gestión empresarial
- Secundarias: software de gestión de operaciones, plataforma de ejecución empresarial, seguimiento de compromisos, gestión de equipos de trabajo, software OKR, gestión de tareas empresariales, control de actividades empresariales, seguimiento de objetivos estratégicos, tableros de gestión empresarial

### Enviardián (`/agente`)

- Principal: asistente de IA para empresas
- Secundarias: asistente empresarial con inteligencia artificial, asistente de voz para empresas, IA para gestión de tareas, IA para seguimiento de compromisos, asistente IA para operaciones, asistente IA con WhatsApp, consultas empresariales con IA, inteligencia artificial para gestión empresarial

## Qué se implementó en repo

- Titles / descriptions / keywords alineados al spec
- Helper compartido de document meta + JSON-LD enriquecido
- OG images en `/og/`
- `robots.txt` + `sitemap.xml` (solo `/producto` y `/agente`)
- `noindex` en app autenticada y auth
- Enlaces contextuales entre landings
- Shells HTML build-time (`scripts/seo-html-shells.mjs`) para meta indexable

## Checklist Fase 12 (local)

1. Titles únicos: Scrumban vs Enviardián — sí
2. Descriptions únicas — sí
3. Un H1 por landing (sin cambiar copy comercial) — sí
4. H2 / eyebrows con vocabulario de capacidades reales — sí (ajustes ligeros)
5. Canonicals absolutos por ruta — sí (`VITE_APP_URL` / fallback)
6. HTML inicial indexable en `/producto` y `/agente` — shells build-time
7. JSON-LD Organization + WebSite (`@id`) + WebPage + SoftwareApplication + BreadcrumbList — sí
8. Sitemap solo URLs públicas — sí
9. Rutas privadas con `noindex` (app + auth) + `robots.txt` Disallow — sí
10. OG images con alt / width / height — sí (`/og/*.svg`)
11. Enlaces internos contextuales entre landings — sí
12. Sin migración de framework / demos intactas — sí
13. `lang=es-MX` — sí
14. Analítica nueva — no instalada (pendiente externo)
15. Lógica de producto no tocada fuera de landings/SEO — sí

## Pendientes externos

- Google Search Console / verificación de dominio
- Refresh de cache social (Facebook Sharing Debugger, LinkedIn Post Inspector); preferible export PNG 1200×630 si un depurador social no acepta SVG
- Medición real de LCP / INP / CLS en producción
- Analítica de conversión (no se instaló herramienta nueva; no hay gtag en el repo)
