/**
 * Lectura del call de Retell para recuperar transcripcion cuando el webhook tarda
 * o el cierre autenticado necesita el transcript oficial.
 */
import { readStringEnv } from './http.js'

export async function fetchRetellCall(callId: string): Promise<unknown | null> {
  const id = callId.trim()
  const apiKey = readStringEnv('RETELL_API_KEY')
  if (!id || !apiKey) return null
  try {
    const response = await fetch(`https://api.retellai.com/v2/get-call/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!response.ok) {
      // Fallback path used by some Retell accounts.
      const alt = await fetch(`https://api.retellai.com/get-call/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!alt.ok) return null
      return (await alt.json()) as unknown
    }
    return (await response.json()) as unknown
  } catch (error) {
    console.error('fetchRetellCall', error instanceof Error ? error.message : error)
    return null
  }
}
