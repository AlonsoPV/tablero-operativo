import type { AssistantAudioResult } from '@/lib/assistantAudioClient'
import type { AssistantStructuredReply } from '@/features/ai-support/assistantBriefing'
import type { CopilotClarification, CopilotProposal } from '@/features/ai-support/copilot/types'

/** Mensajes válidos para el endpoint de streaming. */
export type AiChatMessage = {
  role: 'user' | 'assistant'
  content: string
  analysis?: AssistantAudioResult
  structured?: AssistantStructuredReply
  proposals?: CopilotProposal[]
  clarification?: CopilotClarification
}
