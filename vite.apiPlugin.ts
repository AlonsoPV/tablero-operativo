/**
 * Sirve handlers de /api/* en `npm run dev` (sin necesidad de `vercel dev`).
 * Usa ssrLoadModule con rutas absolutas desde `config.root` para evitar
 * resoluciones rotas desde `node_modules/.vite-temp`.
 *
 * Además, inyecta secrets de `.env` (GEMINI_*, ELEVENLABS_*, etc.) en
 * `process.env`: Vite solo expone `VITE_*` al browser, no a los handlers.
 */
import path from 'node:path'
import { loadEnv, type Connect, type Plugin, type ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { enableSystemCaCertificates } from './vite.enableSystemCa'

type ApiHandler = (
  req: IncomingMessage & { body?: unknown; method?: string },
  res: ServerResponse
) => void | Promise<void>

/** Rutas públicas → entry consolidado + op (Hobby ≤12 functions). */
const API_ROUTES: Record<string, { file: string; op: string }> = {
  '/api/gemini-chat': { file: 'api/gemini-chat.ts', op: '' },
  '/api/assistant-ops': { file: 'api/assistant-ops.ts', op: '' },
  '/api/guide-chat': { file: 'api/guide-chat.ts', op: '' },
  '/api/demo-request': { file: 'api/demo-request.ts', op: '' },
  '/api/whatsapp-assistant': { file: 'api/whatsapp-assistant.ts', op: '' },
  '/api/whatsapp-webhook': { file: 'api/whatsapp-webhook.ts', op: '' },
  '/api/google-oauth': { file: 'api/google-oauth.ts', op: '' },
  '/api/google-oauth-start': { file: 'api/google-oauth.ts', op: 'start' },
  '/api/google-oauth-callback': { file: 'api/google-oauth.ts', op: 'callback' },
  '/api/google-oauth-disconnect': { file: 'api/google-oauth.ts', op: 'disconnect' },
  '/api/google-oauth-status': { file: 'api/google-oauth.ts', op: 'status' },
  '/api/guide-user-link': { file: 'api/guide-user-link.ts', op: '' },
  '/api/create-guide-user-link': { file: 'api/guide-user-link.ts', op: 'create' },
  '/api/validate-guide-user-link': { file: 'api/guide-user-link.ts', op: 'validate' },
  '/api/assistant-media': { file: 'api/assistant-media.ts', op: '' },
  '/api/assistant-audio': { file: 'api/assistant-media.ts', op: 'audio' },
  '/api/assistant-transcribe': { file: 'api/assistant-media.ts', op: 'transcribe' },
  '/api/elevenlabs-tts': { file: 'api/assistant-media.ts', op: 'tts' },
  '/api/guide-retell': { file: 'api/guide-retell.ts', op: '' },
  '/api/guide-retell-webhook': { file: 'api/guide-retell.ts', op: 'webhook' },
  '/api/guide-retell-web-call': { file: 'api/guide-retell.ts', op: 'web-call' },
  '/api/guide-retell-tool': { file: 'api/guide-retell.ts', op: 'tool' },
  '/api/guide-queue-workspace-draft': { file: 'api/guide-retell.ts', op: 'queue-workspace-draft' },
  '/api/guide-report': { file: 'api/guide-report.ts', op: '' },
  '/api/guide-link-report': { file: 'api/guide-report.ts', op: 'link-report' },
  '/api/guide-report-share': { file: 'api/guide-report.ts', op: 'share' },
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function loadHandler(server: ViteDevServer, relativeFile: string): Promise<ApiHandler> {
  const absoluteFile = path.resolve(server.config.root, relativeFile).replace(/\\/g, '/')
  const mod = await server.ssrLoadModule(absoluteFile)
  const handler = (mod.default ?? mod) as ApiHandler
  if (typeof handler !== 'function') {
    throw new Error(`Handler invalido: ${relativeFile}`)
  }
  return handler
}

function injectServerEnv(root: string, mode: string) {
  // '' = todas las claves del .env (no solo VITE_*)
  const env = loadEnv(mode, root, '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function withOp(url: string, op: string) {
  if (!op) return url
  // Callback: no forzar ?op=; el handler detecta code/state. Aun así op=callback ayuda en local.
  const u = new URL(url, 'http://local')
  if (!u.searchParams.get('op')) u.searchParams.set('op', op)
  return `${u.pathname}?${u.searchParams.toString()}`
}

export function localApiPlugin(): Plugin {
  const cache = new Map<string, ApiHandler>()

  return {
    name: 'local-api-handlers',
    configResolved(config) {
      enableSystemCaCertificates()
      injectServerEnv(config.root, config.mode)
    },
    configureServer(server) {
      enableSystemCaCertificates()
      injectServerEnv(server.config.root, server.config.mode)

      // Invalidar cache al recargar handlers en HMR
      const clear = () => cache.clear()
      server.watcher.on('change', (file) => {
        if (file.replace(/\\/g, '/').includes('/api/')) clear()
      })

      server.middlewares.use(async (req, res, next) => {
        const pathOnly = req.url?.split('?')[0] ?? ''
        const route = API_ROUTES[pathOnly]
        if (!route) {
          next()
          return
        }

        try {
          const cacheKey = route.file
          let handler = cache.get(cacheKey)
          if (!handler) {
            handler = await loadHandler(server, route.file)
            cache.set(cacheKey, handler)
          }
          const originalUrl = req.url || pathOnly
          req.url = withOp(originalUrl, route.op)
          await handler(req as Connect.IncomingMessage & { body?: unknown; method?: string }, res)
          if (!res.writableEnded) {
            sendJson(res, 500, { error: 'El handler no cerro la respuesta.' })
          }
        } catch (error) {
          console.error(`[local-api] ${pathOnly}`, error)
          cache.delete(route.file)
          if (!res.headersSent) {
            sendJson(res, 500, {
              error: error instanceof Error ? error.message : 'Error en API local',
            })
          }
        }
      })
    },
  }
}
