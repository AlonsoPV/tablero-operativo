import { getAssistantAuthHeaders } from '@/lib/assistantApiAuth'

export type GoogleConnectionStatusPayload = {
  connected: boolean
  google_email: string | null
  scopes: string[]
  scope_labels: string[]
  status: 'active' | 'revoked' | 'needs_reauth' | 'disconnected'
  connected_at: string | null
  updated_at: string | null
}

async function authHeaders() {
  const headers = await getAssistantAuthHeaders()
  return headers
}

export async function fetchGoogleConnectionStatus(): Promise<GoogleConnectionStatusPayload> {
  const headers = await authHeaders()
  const response = await fetch('/api/google-oauth-status', { headers })
  const data = (await response.json().catch(() => ({}))) as GoogleConnectionStatusPayload & {
    error?: string
  }
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo consultar Google Workspace.')
  }
  return {
    connected: Boolean(data.connected),
    google_email: data.google_email ?? null,
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    scope_labels: Array.isArray(data.scope_labels) ? data.scope_labels : [],
    status: data.status || 'disconnected',
    connected_at: data.connected_at ?? null,
    updated_at: data.updated_at ?? null,
  }
}

export async function startGoogleOAuth(): Promise<string> {
  const headers = await authHeaders()
  const response = await fetch('/api/google-oauth-start', { method: 'GET', headers })
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!response.ok || !data.url) {
    throw new Error(data.error || 'No se pudo iniciar la conexion con Google.')
  }
  return data.url
}

export async function disconnectGoogleConnection() {
  const headers = await authHeaders()
  const response = await fetch('/api/google-oauth-disconnect', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo desconectar Google Workspace.')
  }
}
