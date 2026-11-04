import { getAssistantAuthHeaders } from '@/lib/assistantApiAuth'
import type { CopilotProposal } from '@/features/ai-support/copilot/types'

export async function confirmAssistantOp(opId: string) {
  const headers = await getAssistantAuthHeaders()
  const response = await fetch('/api/assistant-ops', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'confirm', op_id: opId }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    error?: string
    status?: string
    result?: { id?: string; href?: string; title?: string; estado?: string }
    preview?: CopilotProposal
  }
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo confirmar la operacion.')
  }
  return data
}

export async function cancelAssistantOp(opId: string) {
  const headers = await getAssistantAuthHeaders()
  const response = await fetch('/api/assistant-ops', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'cancel', op_id: opId }),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string; status?: string }
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo cancelar la operacion.')
  }
  return data
}
