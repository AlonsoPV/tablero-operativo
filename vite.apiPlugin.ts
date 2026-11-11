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

const API_ROUTES: Record<string, string> = {
  '/api/gemini-chat': 'api/gemini-chat.ts',
  '/api/assistant-audio': 'api/assistant-audio.ts',
  '/api/assistant-transcribe': 'api/assistant-transcribe.ts',
  '/api/elevenlabs-tts': 'api/elevenlabs-tts.ts',
  '/api/guide-chat': 'api/guide-chat.ts',
  '/api/guide-retell-web-call': 'api/guide-retell-web-call.ts',
  '/api/guide-report-share': 'api/guide-report-share.ts',
  '/api/guide-link-report': 'api/guide-link-report.ts',
  '/api/create-guide-user-link': 'api/create-guide-user-link.ts',
  '/api/validate-guide-user-link': 'api/validate-guide-user-link.ts',
  '/api/assistant-ops': 'api/assistant-ops.ts',
  '/api/google-oauth-start': 'api/google-oauth-start.ts',
  '/api/google-oauth-callback': 'api/google-oauth-callback.ts',
  '/api/google-oauth-disconnect': 'api/google-oauth-disconnect.ts',
  '/api/google-oauth-status': 'api/google-oauth-status.ts',
  '/api/guide-queue-workspace-draft': 'api/guide-queue-workspace-draft.ts',
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
        const url = req.url?.split('?')[0] ?? ''
        const relativeFile = API_ROUTES[url]
        if (!relativeFile) {
          next()
          return
        }

        try {
          let handler = cache.get(url)
          if (!handler) {
            handler = await loadHandler(server, relativeFile)
            cache.set(url, handler)
          }
          await handler(req as Connect.IncomingMessage & { body?: unknown; method?: string }, res)
          if (!res.writableEnded) {
            sendJson(res, 500, { error: 'El handler no cerro la respuesta.' })
          }
        } catch (error) {
          console.error(`[local-api] ${url}`, error)
          cache.delete(url)
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
