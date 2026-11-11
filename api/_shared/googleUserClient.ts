/**
 * Cliente Google por usuario (Shaman). No usar el GOOGLE_REFRESH_TOKEN de organizacion.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readStringEnv } from './http.js'
import { createServiceRoleClient } from './assistantAuth.js'
import { guideAppBaseUrl } from './guideUserLinks.js'
import {
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_SCOPES,
  hasGoogleScope,
} from '../../src/features/ai-support/copilot/googleWorkspace.js'

export { GOOGLE_OAUTH_SCOPES, GOOGLE_SCOPES }

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export type GoogleConnectionStatus = 'active' | 'revoked' | 'needs_reauth'

export type GoogleConnectionMeta = {
  connected: boolean
  google_email: string | null
  scopes: string[]
  status: GoogleConnectionStatus | 'disconnected'
  connected_at: string | null
  updated_at: string | null
}

export type GoogleConnectionRow = {
  usuario_id: string
  google_email: string | null
  scopes: string[]
  status: GoogleConnectionStatus
  refresh_token_enc: string | null
  token_expires_at: string | null
  connected_at: string
  updated_at: string
}

export class GoogleUserError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function adminClient(supabase?: SupabaseClient) {
  return supabase ?? createServiceRoleClient()
}

function tokenEncKey(): Buffer {
  const raw = readStringEnv('GOOGLE_TOKEN_ENC_KEY')
  if (!raw) {
    throw new GoogleUserError(
      'missing_enc_key',
      'Falta GOOGLE_TOKEN_ENC_KEY en el servidor (32 bytes hex o frase secreta).'
    )
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  return scryptSync(raw, 'shaman-google-token-v1', 32)
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', tokenEncKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(packed: string): string {
  const buf = Buffer.from(packed, 'base64')
  if (buf.length < 29) throw new GoogleUserError('bad_token', 'Token cifrado invalido.')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', tokenEncKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

export function googleClientId() {
  const id = readStringEnv('GOOGLE_CLIENT_ID')
  if (!id) throw new GoogleUserError('missing_client', 'Falta GOOGLE_CLIENT_ID.')
  return id
}

export function googleClientSecret() {
  const secret = readStringEnv('GOOGLE_CLIENT_SECRET')
  if (!secret) throw new GoogleUserError('missing_client', 'Falta GOOGLE_CLIENT_SECRET.')
  return secret
}

export function googleOAuthRedirectUri(requestUrl?: string | null) {
  if (requestUrl) {
    try {
      const url = new URL(requestUrl, 'http://localhost')
      const host = url.host
      if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
        const proto = url.protocol === 'https:' ? 'https' : 'http'
        return `${proto}://${host}/api/google-oauth-callback`
      }
    } catch {
      /* usar base publica */
    }
  }
  return `${guideAppBaseUrl()}/api/google-oauth-callback`
}

export function signOAuthState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const mac = createHmac('sha256', tokenEncKey()).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verifyOAuthState(raw: string): Record<string, unknown> | null {
  const [body, mac] = raw.split('.')
  if (!body || !mac) return null
  const expected = createHmac('sha256', tokenEncKey()).update(body).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
    const exp = typeof parsed.exp === 'number' ? parsed.exp : 0
    if (exp && Date.now() > exp) return null
    return parsed
  } catch {
    return null
  }
}

export function buildGoogleAuthorizeUrl(input: {
  state: string
  redirectUri: string
  promptConsent: boolean
}) {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    state: input.state,
  })
  if (input.promptConsent) params.set('prompt', 'consent')
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }
  if (!response.ok || !json.access_token) {
    throw new GoogleUserError(
      'oauth_exchange',
      json.error_description || json.error || 'Google rechazo el intercambio de codigo.'
    )
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || '',
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 3600,
    scopes: (json.scope || '').split(/\s+/).filter(Boolean),
  }
}

export async function fetchGoogleEmail(accessToken: string) {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const json = (await response.json().catch(() => ({}))) as { email?: string }
  return typeof json.email === 'string' ? json.email.trim().toLowerCase() : ''
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      grant_type: 'refresh_token',
    }),
  })
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }
  if (!response.ok || !json.access_token) {
    const invalid = json.error === 'invalid_grant' || /revoked|expired/i.test(json.error_description || '')
    throw new GoogleUserError(
      invalid ? 'needs_reauth' : 'token_refresh',
      invalid
        ? 'Hay que reconectar Google Workspace. El permiso expiro o se revoco.'
        : json.error_description || 'No se pudo renovar el acceso a Google.'
    )
  }
  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 3600,
    scopes: (json.scope || '').split(/\s+/).filter(Boolean),
  }
}

export async function loadGoogleConnection(
  usuarioId: string,
  supabase?: SupabaseClient
): Promise<GoogleConnectionRow | null> {
  const admin = adminClient(supabase)
  const { data, error } = await admin
    .from('user_google_connections')
    .select(
      'usuario_id,google_email,scopes,status,refresh_token_enc,token_expires_at,connected_at,updated_at'
    )
    .eq('usuario_id', usuarioId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    usuario_id: data.usuario_id as string,
    google_email: (data.google_email as string | null) ?? null,
    scopes: Array.isArray(data.scopes) ? (data.scopes as string[]) : [],
    status: (data.status as GoogleConnectionStatus) || 'active',
    refresh_token_enc: (data.refresh_token_enc as string | null) ?? null,
    token_expires_at: (data.token_expires_at as string | null) ?? null,
    connected_at: String(data.connected_at),
    updated_at: String(data.updated_at),
  }
}

export async function googleConnectionMeta(
  usuarioId: string,
  supabase?: SupabaseClient
): Promise<GoogleConnectionMeta> {
  const row = await loadGoogleConnection(usuarioId, supabase)
  if (!row || row.status === 'revoked' || !row.refresh_token_enc) {
    return {
      connected: false,
      google_email: row?.google_email ?? null,
      scopes: row?.scopes ?? [],
      status: row?.status === 'needs_reauth' ? 'needs_reauth' : 'disconnected',
      connected_at: row?.connected_at ?? null,
      updated_at: row?.updated_at ?? null,
    }
  }
  return {
    connected: row.status === 'active',
    google_email: row.google_email,
    scopes: row.scopes,
    status: row.status,
    connected_at: row.connected_at,
    updated_at: row.updated_at,
  }
}

async function markNeedsReauth(usuarioId: string, supabase?: SupabaseClient) {
  const admin = adminClient(supabase)
  await admin
    .from('user_google_connections')
    .update({ status: 'needs_reauth', updated_at: new Date().toISOString() })
    .eq('usuario_id', usuarioId)
}

export async function upsertGoogleConnection(input: {
  usuarioId: string
  googleEmail: string
  scopes: string[]
  refreshToken?: string
  supabase?: SupabaseClient
}) {
  const admin = adminClient(input.supabase)
  const existing = await loadGoogleConnection(input.usuarioId, admin)
  const refreshEnc = input.refreshToken
    ? encryptSecret(input.refreshToken)
    : existing?.refresh_token_enc ?? null
  if (!refreshEnc) {
    throw new GoogleUserError(
      'missing_refresh',
      'Google no devolvio refresh token. Desconecta y vuelve a conectar con consentimiento.'
    )
  }
  const now = new Date().toISOString()
  const { error } = await admin.from('user_google_connections').upsert({
    usuario_id: input.usuarioId,
    google_email: input.googleEmail,
    scopes: input.scopes.length ? input.scopes : [...GOOGLE_OAUTH_SCOPES],
    status: 'active',
    refresh_token_enc: refreshEnc,
    connected_at: existing?.connected_at ?? now,
    updated_at: now,
  })
  if (error) throw error
}

export async function disconnectGoogleConnection(usuarioId: string, supabase?: SupabaseClient) {
  const admin = adminClient(supabase)
  const row = await loadGoogleConnection(usuarioId, admin)
  if (row?.refresh_token_enc) {
    try {
      const token = decryptSecret(row.refresh_token_enc)
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' })
    } catch (error) {
      console.warn('google revoke', error instanceof Error ? error.message : error)
    }
  }
  const now = new Date().toISOString()
  const { error } = await admin.from('user_google_connections').upsert({
    usuario_id: usuarioId,
    google_email: row?.google_email ?? null,
    scopes: [],
    status: 'revoked',
    refresh_token_enc: null,
    token_expires_at: null,
    connected_at: row?.connected_at ?? now,
    updated_at: now,
  })
  if (error) throw error
}

export async function accessTokenForUser(
  usuarioId: string,
  neededScope?: string,
  supabase?: SupabaseClient
): Promise<{ token: string; email: string | null; scopes: string[] }> {
  const admin = adminClient(supabase)
  const row = await loadGoogleConnection(usuarioId, admin)
  if (!row || row.status === 'revoked' || !row.refresh_token_enc) {
    throw new GoogleUserError(
      'not_connected',
      'Conecta Google Workspace en tu perfil para consultar Gmail o Calendar. No uso la cuenta de administracion.'
    )
  }
  if (row.status === 'needs_reauth') {
    throw new GoogleUserError(
      'needs_reauth',
      'Hay que reconectar Google Workspace en tu perfil. El permiso expiro.'
    )
  }
  if (neededScope && !hasGoogleScope(row.scopes, neededScope) && row.scopes.length > 0) {
    throw new GoogleUserError(
      'missing_scope',
      'Faltan permisos de Google. Reconecta Google Workspace en tu perfil para conceder el alcance.'
    )
  }
  let refreshToken: string
  try {
    refreshToken = decryptSecret(row.refresh_token_enc)
  } catch {
    await markNeedsReauth(usuarioId, admin)
    throw new GoogleUserError('needs_reauth', 'No se pudo leer el token. Reconecta Google Workspace.')
  }
  try {
    const refreshed = await refreshAccessToken(refreshToken)
    const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
    const scopes = refreshed.scopes.length ? refreshed.scopes : row.scopes
    await admin
      .from('user_google_connections')
      .update({
        token_expires_at: expiresAt,
        scopes,
        updated_at: new Date().toISOString(),
        status: 'active',
      })
      .eq('usuario_id', usuarioId)
    return { token: refreshed.accessToken, email: row.google_email, scopes }
  } catch (error) {
    if (error instanceof GoogleUserError && error.code === 'needs_reauth') {
      await markNeedsReauth(usuarioId, admin)
    }
    throw error
  }
}

async function googleApi<T>(
  token: string,
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let json: unknown = {}
  if (text) {
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = { raw: text.slice(0, 200) }
    }
  }
  if (!response.ok) {
    const err = json as { error?: { message?: string; status?: string } }
    throw new GoogleUserError(
      'google_api',
      err.error?.message || `Google API ${response.status}`
    )
  }
  return json as T
}

export type GmailHeader = { name?: string; value?: string }
export type GmailMessageLite = {
  id: string
  threadId: string
  snippet?: string
  internalDate?: string
  payload?: {
    headers?: GmailHeader[]
    mimeType?: string
    body?: { data?: string; size?: number }
    parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>
  }
}

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  const wanted = name.toLowerCase()
  return headers?.find((item) => (item.name || '').toLowerCase() === wanted)?.value ?? ''
}

function decodeGmailBody(data: string | undefined) {
  if (!data) return ''
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function extractPlainBody(payload: GmailMessageLite['payload'], max: number): string {
  if (!payload) return ''
  if (payload.mimeType?.startsWith('text/plain') && payload.body?.data) {
    return decodeGmailBody(payload.body.data).slice(0, max)
  }
  const parts = payload.parts ?? []
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeGmailBody(part.body.data).slice(0, max)
    }
  }
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      const html = decodeGmailBody(part.body.data)
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    }
  }
  return ''
}

export async function gmailSearch(token: string, query: string, limit: number) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(8, Math.max(1, limit))),
  })
  const list = await googleApi<{ messages?: Array<{ id: string; threadId: string }> }>(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`
  )
  const ids = (list.messages ?? []).slice(0, Math.min(8, limit))
  const messages: Array<{
    id: string
    threadId: string
    from: string
    to: string
    subject: string
    date: string
    snippet: string
  }> = []
  for (const item of ids) {
    const full = await googleApi<GmailMessageLite>(
      token,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
    )
    const headers = full.payload?.headers
    messages.push({
      id: full.id,
      threadId: full.threadId,
      from: headerValue(headers, 'From'),
      to: headerValue(headers, 'To'),
      subject: headerValue(headers, 'Subject'),
      date: headerValue(headers, 'Date'),
      snippet: (full.snippet || '').slice(0, 280),
    })
  }
  return messages
}

export async function gmailGetThread(token: string, threadId: string, bodyMax: number) {
  const thread = await googleApi<{
    id: string
    messages?: GmailMessageLite[]
  }>(token, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`)
  const messages = (thread.messages ?? []).slice(0, 12).map((message) => {
    const headers = message.payload?.headers
    return {
      id: message.id,
      from: headerValue(headers, 'From'),
      to: headerValue(headers, 'To'),
      subject: headerValue(headers, 'Subject'),
      date: headerValue(headers, 'Date'),
      snippet: (message.snippet || '').slice(0, 280),
      body: extractPlainBody(message.payload, bodyMax),
    }
  })
  return { id: thread.id, messages }
}

function rfc5322Raw(input: {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}) {
  const lines = [
    `To: ${input.to.join(', ')}`,
    input.cc?.length ? `Cc: ${input.cc.join(', ')}` : '',
    input.bcc?.length ? `Bcc: ${input.bcc.join(', ')}` : '',
    `Subject: ${input.subject}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : '',
    input.references ? `References: ${input.references}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    input.body,
  ].filter((line) => line !== '')
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

export async function gmailSend(
  token: string,
  input: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    body: string
    threadId?: string
    inReplyTo?: string
  }
) {
  const raw = rfc5322Raw({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
    inReplyTo: input.inReplyTo,
    references: input.inReplyTo,
  })
  const sent = await googleApi<{ id?: string; threadId?: string }>(
    token,
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      body: JSON.stringify({
        raw,
        threadId: input.threadId || undefined,
      }),
    }
  )
  return {
    gmail_message_id: sent.id || '',
    threadId: sent.threadId || input.threadId || '',
  }
}

export async function calendarListEvents(
  token: string,
  input: { timeMin: string; timeMax: string; query?: string; limit?: number }
) {
  const params = new URLSearchParams({
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.min(20, Math.max(1, input.limit ?? 12))),
    timeZone: 'America/Mexico_City',
  })
  if (input.query) params.set('q', input.query)
  const data = await googleApi<{
    items?: Array<{
      id?: string
      summary?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
      attendees?: Array<{ email?: string }>
      htmlLink?: string
      status?: string
    }>
  }>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`)
  return (data.items ?? []).map((item) => ({
    id: item.id || '',
    summary: item.summary || '(sin titulo)',
    start: item.start?.dateTime || item.start?.date || '',
    end: item.end?.dateTime || item.end?.date || '',
    attendees: (item.attendees ?? []).map((row) => row.email || '').filter(Boolean),
    href: item.htmlLink || '',
    status: item.status || '',
  }))
}

export async function calendarFreebusy(token: string, timeMin: string, timeMax: string) {
  const data = await googleApi<{
    calendars?: { primary?: { busy?: Array<{ start?: string; end?: string }> } }
  }>(token, 'https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: 'America/Mexico_City',
      items: [{ id: 'primary' }],
    }),
  })
  return data.calendars?.primary?.busy ?? []
}

export async function calendarInsertEvent(
  token: string,
  input: {
    summary: string
    description?: string
    start: string
    end: string
    attendees?: string[]
    location?: string
  }
) {
  const created = await googleApi<{ id?: string; htmlLink?: string }>(
    token,
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      body: JSON.stringify({
        summary: input.summary,
        description: input.description || '',
        location: input.location || '',
        start: { dateTime: input.start, timeZone: 'America/Mexico_City' },
        end: { dateTime: input.end, timeZone: 'America/Mexico_City' },
        attendees: (input.attendees ?? []).map((email) => ({ email })),
      }),
    }
  )
  return { event_id: created.id || '', href: created.htmlLink || '' }
}

export async function calendarPatchEvent(
  token: string,
  eventId: string,
  patch: Record<string, unknown>
) {
  const updated = await googleApi<{ id?: string; htmlLink?: string }>(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  )
  return { event_id: updated.id || eventId, href: updated.htmlLink || '' }
}

export async function calendarDeleteEvent(token: string, eventId: string) {
  await googleApi(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  )
  return { event_id: eventId, cancelled: true }
}
