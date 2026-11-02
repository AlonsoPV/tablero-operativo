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

export async function requestAssistantTextAnalysis({
  text,
  context,
  clarifications,
  intent = 'plan_actions',
  signal,
}: AssistantAudioRequest): Promise<AssistantAudioResult> {
  const response = await fetch('/api/assistant-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    if (response.status === 404) {
      throw new Error(
        'No se encontro /api/assistant-audio. En local usa npm run dev (plugin API) o vercel dev.'
      )
    }
    throw new Error(data.error || 'No se pudo interpretar la nota.')
  }

  if (!data.result) {
    throw new Error('La interpretacion no devolvio un resultado util.')
  }

  return data.result
}

export function actionDraftSpeechText(draft: AssistantActionDraft) {
  return [
    draft.title,
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
