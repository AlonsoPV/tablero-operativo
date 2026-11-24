import type { AssistantAudioResult } from '@/lib/assistantAudioClient'
import type { AssistantStructuredReply } from '@/features/ai-support/assistantBriefing'
import type { AssistantUiPayload } from '@/features/ai-support/chatViews/types'
import type { CopilotClarification, CopilotProposal } from '@/features/ai-support/copilot/types'

/** Mensajes válidos para el endpoint de streaming. */
export type AiChatMessage = {
  role: 'user' | 'assistant'
  requestId?: string
  content: string
  /** Versión hablada cálida y concisa en es-MX cuando el turno proviene del canal Voz R4. */
  spokenText?: string
  channel?: 'web' | 'voice'
  analysis?: AssistantAudioResult
  structured?: AssistantStructuredReply
  /** Vistas estructuradas (métricas, listas, OKRs) alimentadas por datos reales. */
  ui?: AssistantUiPayload
  proposals?: CopilotProposal[]
  clarification?: CopilotClarification
  /** Servidor: R2 simulated|qa. Nunca lo decide el cliente. */
  executionEnabled?: boolean
  batchId?: string
  /** Métricas locales de latencia del turno de voz. */
  voiceMetrics?: {
    sttMs: number
    orchestratorMs: number
    ttsStartMs: number | null
    totalTurnMs: number
    providerMode: 'local_simulated' | 'live_provider'
  }
  /** El proveedor falló de forma recuperable; el usuario puede reintentar el mismo turno. */
  retryable?: boolean
}
