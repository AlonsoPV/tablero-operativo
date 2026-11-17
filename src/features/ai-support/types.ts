import type { AssistantAudioResult } from '@/lib/assistantAudioClient'
import type { AssistantStructuredReply } from '@/features/ai-support/assistantBriefing'
import type { AssistantUiPayload } from '@/features/ai-support/chatViews/types'
import type { CopilotClarification, CopilotProposal } from '@/features/ai-support/copilot/types'

/** Mensajes válidos para el endpoint de streaming. */
export type AiChatMessage = {
  role: 'user' | 'assistant'
  requestId?: string
  content: string
  analysis?: AssistantAudioResult
  structured?: AssistantStructuredReply
  /** Vistas estructuradas (métricas, listas, OKRs) alimentadas por datos reales. */
  ui?: AssistantUiPayload
  proposals?: CopilotProposal[]
  clarification?: CopilotClarification
}
