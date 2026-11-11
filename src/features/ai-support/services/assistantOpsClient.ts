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

export async function editAssistantOp(
  opId: string,
  patch: { subject?: string; body?: string; title?: string; start?: string; end?: string }
) {
  const headers = await getAssistantAuthHeaders()
  const response = await fetch('/api/assistant-ops', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'edit', op_id: opId, ...patch }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    error?: string
    proposal?: CopilotProposal
  }
  if (!response.ok || !data.proposal) {
    throw new Error(data.error || 'No se pudo guardar la edicion.')
  }
  return data.proposal
}

export async function listSessionWorkspaceOps(sessionId: string) {
  const headers = await getAssistantAuthHeaders()
  const response = await fetch(`/api/assistant-ops?session_id=${encodeURIComponent(sessionId)}`, {
    headers,
  })
  const data = (await response.json().catch(() => ({}))) as {
    error?: string
    items?: Array<CopilotProposal & { status?: string; errorMessage?: string | null }>
  }
  if (!response.ok) {
    throw new Error(data.error || 'No se pudieron cargar las acciones de Shaman.')
  }
  return data.items ?? []
}
