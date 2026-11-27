import { getAssistantAuthHeaders } from '@/lib/assistantApiAuth'

export type PilotAllowlistUser = {
  id: string
  nombre: string | null
  email: string | null
  activo: boolean | null
}

export type PilotAllowlistState = {
  enabled: boolean
  projectRef: string | null
  usuarioIds: string[]
  users: PilotAllowlistUser[]
  envLocks: { r2: boolean; whatsapp: boolean; r3: boolean }
}

async function parse(response: Response) {
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(data.error || `http_${response.status}`)
  return data
}

export const assistantPilotAllowlistService = {
  async get(): Promise<PilotAllowlistState> {
    const headers = await getAssistantAuthHeaders()
    const response = await fetch('/api/assistant-pilot-allowlist', { headers })
    return (await parse(response)) as PilotAllowlistState
  },
  async update(action: 'add' | 'remove', usuarioId: string) {
    const headers = await getAssistantAuthHeaders()
    const response = await fetch('/api/assistant-pilot-allowlist', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, usuarioId }),
    })
    return parse(response)
  },
}
