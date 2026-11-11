import { randomBytes } from 'node:crypto'
import { defineApiHandler } from './_shared/http.js'
import { requireAssistantAuth } from './_shared/assistantAuth.js'
import {
  buildGoogleAuthorizeUrl,
  googleConnectionMeta,
  googleOAuthRedirectUri,
  GoogleUserError,
  signOAuthState,
} from './_shared/googleUserClient.js'

function requestOrigin(req: { url?: string; headers?: Record<string, string | string[] | undefined> }) {
  const hostHeader = req.headers?.host
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader
  const protoHeader = req.headers?.['x-forwarded-proto']
  const protoRaw = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader
  const proto = protoRaw || (host?.startsWith('localhost') ? 'http' : 'https')
  if (!host) return req.url || ''
  return `${proto}://${host}${req.url || '/'}`
}

export default defineApiHandler(async (req, res) => {
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
})
