import { getAssistantAuthHeaders } from '@/lib/assistantApiAuth'

export type AssistantDocumentListItem = {
  id: string
  logicalId: string
  title: string
  version: number
  status: 'published' | 'withdrawn' | string
  sourceLabel: string
  publishedAt: string | null
  withdrawnAt: string | null
  excerpt: string
}

async function parse(response: Response) {
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(data.error || `http_${response.status}`)
  return data
}

const URL = '/api/assistant-ops?op=r3-documents'

export const assistantDocumentsService = {
  async list(): Promise<AssistantDocumentListItem[]> {
    const headers = await getAssistantAuthHeaders()
    const response = await fetch(URL, { headers })
    const data = (await parse(response)) as { documents?: AssistantDocumentListItem[] }
    return data.documents ?? []
  },
  async publish(input: { title: string; body: string; sourceLabel: string; logicalId?: string }) {
    const headers = await getAssistantAuthHeaders()
    const response = await fetch(URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'publish', ...input }),
    })
    return parse(response)
  },
  async withdraw(logicalId: string) {
    const headers = await getAssistantAuthHeaders()
    const response = await fetch(URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'withdraw', logicalId }),
    })
    return parse(response)
  },
}
