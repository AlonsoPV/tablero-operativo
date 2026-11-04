import { getAssistantAuthHeaders } from '@/lib/assistantApiAuth'

export type AssistantAudioIntent = 'plan_actions' | 'advisory'

export type ActionDraftPriority = 'P1_Alta' | 'P2_Media' | 'P3_Baja'

export type AssistantActionDraft = {
  title: string
  description: string
  objective: string
  evidenceExpected: string
  priority: ActionDraftPriority
  leanWaste: string
  eosComponent: string
  ownerHint: string | null
  dueDateHint: string | null
  activities: string[]
}

export type AssistantAudioResult = {
  transcript: string
  validation: {
    status: 'usable' | 'needs_more_context' | 'not_usable'
    summary: string
    missingPoints: string[]
    clarificationQuestions: string[]
  }
  interpretation: {
    executiveSummary: string
    signals: string[]
    risks: string[]
    opportunities: string[]
  }
  nextSteps: string[]
  actionDrafts: AssistantActionDraft[]
}

export type AssistantAudioRequest = {
  text: string
  context?: string
  clarifications?: string
  intent?: AssistantAudioIntent
  signal?: AbortSignal
}

async function readJson(response: Response) {
  const text = await response.text()
  if (!text.trim()) return {} as { result?: AssistantAudioResult; error?: string }
  try {
    return JSON.parse(text) as { result?: AssistantAudioResult; error?: string }
  } catch {
    return { error: text.trim().slice(0, 220) }
  }
}

function throwAssistantHttpError(status: number, fallback: string, error?: string) {
  if (status === 401 || status === 403) {
    throw new Error(error || 'No autorizado para usar el Asistente IA.')
  }
  if (status === 429 || status === 503) {
    throw new Error(error || 'El modelo esta saturado. Espera un momento e intenta de nuevo.')
  }
  if (status === 404) {
    throw new Error(fallback)
  }
  throw new Error(error || fallback)
}

export async function requestAssistantTextAnalysis({
  text,
  context,
  clarifications,
  intent = 'plan_actions',
  signal,
}: AssistantAudioRequest): Promise<AssistantAudioResult> {
  const headers = await getAssistantAuthHeaders()
  const response = await fetch('/api/assistant-audio', {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      text,
      context: context ?? '',
      clarifications: clarifications ?? '',
      intent,
    }),
  })

  const data = await readJson(response)

  if (!response.ok) {
    throwAssistantHttpError(
      response.status,
      'No se encontro /api/assistant-audio. En local usa npm run dev (plugin API) o vercel dev.',
      data.error
    )
  }

  if (!data.result) {
    throw new Error('La interpretacion no devolvio un resultado util.')
  }

  return data.result
}

export async function requestAssistantTranscript(audio: Blob, signal?: AbortSignal) {
  const audioBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el audio.'))
    reader.readAsDataURL(audio)
  })

  const headers = await getAssistantAuthHeaders()
  const response = await fetch('/api/assistant-transcribe', {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      audioBase64,
      mimeType: audio.type || 'audio/webm',
    }),
  })
  const data = (await response.json().catch(() => ({}))) as { transcript?: string; error?: string }
  if (!response.ok) {
    throwAssistantHttpError(
      response.status,
      'No se pudo transcribir el dictado.',
      data.error
    )
  }
  return (data.transcript || '').trim()
}

export function actionDraftSpeechText(draft: AssistantActionDraft) {
  return [
    draft.title,
    draft.dueDateHint ? `Fecha: ${draft.dueDateHint}` : '',
    draft.description,
    draft.objective ? `Objetivo: ${draft.objective}` : '',
    draft.evidenceExpected ? `Evidencia para cerrar: ${draft.evidenceExpected}` : '',
    draft.activities.length
      ? `Actividades: ${draft.activities.map((activity, index) => `${index + 1}. ${activity}`).join('. ')}`
      : '',
  ]
    .filter(Boolean)
    .join('. ')
}
