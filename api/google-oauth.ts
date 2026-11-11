/**
 * Router Hobby: start | callback | disconnect | status.
 * URLs públicas se preservan vía rewrite a ?op=.
 */
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { apiOpOf } from './_shared/apiOp.js'
import {
  defineApiHandler,
  type JsonResponse,
  type VercelRequestLike,
} from './_shared/http.js'
import { createServiceRoleClient, requireAssistantAuth } from './_shared/assistantAuth.js'
import {
  buildGoogleAuthorizeUrl,
  disconnectGoogleConnection,
  exchangeGoogleCode,
  fetchGoogleEmail,
  GOOGLE_OAUTH_SCOPES,
  googleConnectionMeta,
  googleOAuthRedirectUri,
  GoogleUserError,
  signOAuthState,
  upsertGoogleConnection,
  verifyOAuthState,
} from './_shared/googleUserClient.js'
import { guideAppBaseUrl } from './_shared/guideUserLinks.js'
import { googleScopeLabels } from '../src/features/ai-support/copilot/googleWorkspace.js'

const PROFILE_PATH = '/settings/profile'

function requestOrigin(req: { url?: string; headers?: Record<string, string | string[] | undefined> }) {
  const hostHeader = req.headers?.host
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader
  const protoHeader = req.headers?.['x-forwarded-proto']
  const protoRaw = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader
  const proto = protoRaw || (host?.startsWith('localhost') ? 'http' : 'https')
  if (!host) return req.url || ''
  return `${proto}://${host}${req.url || '/'}`
}

function queryOf(req: { url?: string }): URLSearchParams {
  const raw = req.url || ''
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
  return new URLSearchParams(q)
}

function profileRedirect(query: Record<string, string>) {
  const params = new URLSearchParams(query)
  return `${guideAppBaseUrl()}${PROFILE_PATH}?${params.toString()}`
}

function isWebRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request
}

async function handleCallback(req: IncomingMessage): Promise<string> {
  const query = queryOf(req)
  const err = query.get('error')
  if (err) {
    return profileRedirect({ google: 'denied', reason: err.slice(0, 80) })
  }
  const code = query.get('code') || ''
  const stateRaw = query.get('state') || ''
  const state = verifyOAuthState(stateRaw)
  const usuarioId = typeof state?.uid === 'string' ? state.uid : ''
  const redirectUri =
    typeof state?.redirect_uri === 'string' && state.redirect_uri
      ? state.redirect_uri
      : googleOAuthRedirectUri()
  if (!code || !usuarioId) {
    return profileRedirect({ google: 'error', reason: 'state' })
  }

  try {
    const tokens = await exchangeGoogleCode(code, redirectUri)
    const email = await fetchGoogleEmail(tokens.accessToken)
    const supabase = createServiceRoleClient()
    await upsertGoogleConnection({
      usuarioId,
      googleEmail: email,
      scopes: tokens.scopes.length ? tokens.scopes : [...GOOGLE_OAUTH_SCOPES],
      refreshToken: tokens.refreshToken,
      supabase,
    })
    return profileRedirect({ google: 'connected' })
  } catch (error) {
    const reason =
      error instanceof GoogleUserError
        ? error.code
        : error instanceof Error
          ? 'callback'
          : 'callback'
    console.error('google-oauth-callback', error instanceof Error ? error.message : error)
    return profileRedirect({ google: 'error', reason })
  }
}

function redirectNode(res: ServerResponse, location: string) {
  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}

async function handleStart(req: VercelRequestLike, res: JsonResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' })
  }

  const auth = await requireAssistantAuth(req, { requireAiModule: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  try {
    const meta = await googleConnectionMeta(auth.usuarioId)
    const redirectUri = googleOAuthRedirectUri(requestOrigin(req))
    const state = signOAuthState({
      uid: auth.usuarioId,
      nonce: randomBytes(16).toString('hex'),
      redirect_uri: redirectUri,
      exp: Date.now() + 10 * 60 * 1000,
    })
    const url = buildGoogleAuthorizeUrl({
      state,
      redirectUri,
      promptConsent: !meta.connected || meta.status !== 'active',
    })
    return res.status(200).json({ url })
  } catch (error) {
    const message =
      error instanceof GoogleUserError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'No se pudo iniciar Google Workspace.'
    return res.status(500).json({ error: message.slice(0, 240) })
  }
}

async function handleStatus(req: VercelRequestLike, res: JsonResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido. Usa GET.' })
  }
  const auth = await requireAssistantAuth(req, { requireAiModule: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  try {
    const meta = await googleConnectionMeta(auth.usuarioId)
    return res.status(200).json({
      ...meta,
      scope_labels: googleScopeLabels(meta.scopes),
    })
  } catch (error) {
    const message =
      error instanceof GoogleUserError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'No se pudo leer el estado de Google.'
    return res.status(500).json({ error: message.slice(0, 240) })
  }
}

async function handleDisconnect(req: VercelRequestLike, res: JsonResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
  }
  const auth = await requireAssistantAuth(req, { requireAiModule: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  try {
    await disconnectGoogleConnection(auth.usuarioId)
    return res.status(200).json({ ok: true, status: 'revoked' })
  } catch (error) {
    const message =
      error instanceof GoogleUserError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'No se pudo desconectar Google.'
    return res.status(400).json({ error: message.slice(0, 240) })
  }
}

/** Callback no usa ?op= en el rewrite (hay que conservar code/state de Google). */
function isGoogleCallback(url?: string) {
  const op = apiOpOf({ url }, ['google-oauth-'])
  if (op === 'start' || op === 'status' || op === 'disconnect') return false
  if (op === 'callback') return true
  const q = queryOf({ url })
  return Boolean(q.get('code') || q.get('state') || q.get('error'))
}

const jsonRouter = defineApiHandler(async (req, res) => {
  const op = apiOpOf(req, ['google-oauth-'])
  if (op === 'start') return handleStart(req, res)
  if (op === 'status') return handleStatus(req, res)
  if (op === 'disconnect') return handleDisconnect(req, res)
  return res.status(404).json({ error: `Operacion Google desconocida: ${op || '(vacia)'}` })
})

const handler = async (req: IncomingMessage | Request | VercelRequestLike, serverRes?: ServerResponse) => {
  const url = isWebRequest(req) ? req.url : (req as { url?: string }).url
  if (isGoogleCallback(url)) {
    if (isWebRequest(req)) {
      const location = await handleCallback({ url: req.url, headers: {} } as IncomingMessage)
      return Response.redirect(location, 302)
    }
    const location = await handleCallback(req as IncomingMessage)
    if (serverRes && typeof serverRes.end === 'function') {
      redirectNode(serverRes, location)
      return
    }
    return Response.redirect(location, 302)
  }
  return jsonRouter(req as VercelRequestLike | Request, serverRes)
}

handler.fetch = async (request: Request) => {
  if (isGoogleCallback(request.url)) {
    const location = await handleCallback({ url: request.url, headers: {} } as IncomingMessage)
    return Response.redirect(location, 302)
  }
  return jsonRouter.fetch(request)
}

export default handler
