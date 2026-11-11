import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServiceRoleClient } from './_shared/assistantAuth.js'
import {
  exchangeGoogleCode,
  fetchGoogleEmail,
  GOOGLE_OAUTH_SCOPES,
  googleOAuthRedirectUri,
  GoogleUserError,
  upsertGoogleConnection,
  verifyOAuthState,
} from './_shared/googleUserClient.js'
import { guideAppBaseUrl } from './_shared/guideUserLinks.js'

const PROFILE_PATH = '/settings/profile'

function queryOf(req: IncomingMessage): URLSearchParams {
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

async function handle(req: IncomingMessage): Promise<string> {
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

const handler = async (req: IncomingMessage | Request, serverRes?: ServerResponse) => {
  if (isWebRequest(req)) {
    const url = req.url
    const nodeReq = { url, headers: {} } as IncomingMessage
    const location = await handle(nodeReq)
    return Response.redirect(location, 302)
  }
  const location = await handle(req as IncomingMessage)
  if (serverRes && typeof serverRes.end === 'function') {
    redirectNode(serverRes, location)
    return
  }
  return Response.redirect(location, 302)
}

handler.fetch = async (request: Request) => {
  const location = await handle({ url: request.url, headers: {} } as IncomingMessage)
  return Response.redirect(location, 302)
}

export default handler
