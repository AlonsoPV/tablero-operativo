/**
 * Interpreta texto dictado/escrito y devuelve borradores de acción estructurados.
 * Usa Gemini (mismo stack que /api/gemini-chat). Opcionalmente Claude si hay ANTHROPIC_API_KEY.
 */
import type { ServerResponse } from 'node:http'
import {
  asJsonResponse,
  readNumberEnv,
  readRequestBody,
  readStringEnv,
  type VercelRequestLike,
} from './_shared/http'
import { enableSystemCaCertificates } from './_shared/enableSystemCa'

enableSystemCaCertificates()

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

const MAX_TEXT_CHARS = 4000
const MAX_CONTEXT_CHARS = 6000
const MAX_CLARIFICATIONS_CHARS = 2000
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 2200
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_TIMEOUT_MS = 35000
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const EMPTY_RESULT = (transcript: string): AssistantAudioResult => ({
  transcript,
  validation: {
    status: 'not_usable',
    summary: 'No se pudo interpretar la nota.',
    missingPoints: [],
    clarificationQuestions: [],
  },
  interpretation: {
    executiveSummary: '',
    signals: [],
    risks: [],
    opportunities: [],
  },
  nextSteps: [],
  actionDrafts: [],
})

function buildSystemPrompt(intent: AssistantAudioIntent) {
  const modeRules =
    intent === 'advisory'
      ? `
MODO advisory:
- actionDrafts DEBE ser [].
- Da criterio ejecutivo, riesgos y preguntas de aclaracion.
- No propongas crear tareas nuevas; solo asesora.
`.trim()
      : `
MODO plan_actions:
- Propone entre 1 y 3 actionDrafts cuando haya contexto suficiente.
- Cada draft: titulo con verbo + resultado (<= 70 chars), description, objective, evidenceExpected.
- priority: P1_Alta | P2_Media | P3_Baja.
- activities: 2 a 5 pasos concretos y verificables.
- No inventes clientes, fechas, KPIs ni responsables si no vienen en el texto o contexto.
- Si el Kanban ya tiene una tarea equivalente activa, no la dupliques; sugerela como nextStep.
- Si falta contexto critico, validation.status = needs_more_context y actionDrafts = [].
`.trim()

  return `
Eres un asistente operativo del Tablero Operativo (Scrumban / EOS / Scaling Up).
Recibes una nota hablada o escrita ya transcrita (nunca audio crudo).
Responde SOLO JSON valido, sin markdown ni texto fuera del JSON.

Contexto tipico (puede venir concatenado):
- Entendimiento / memoria de negocio
- "Contexto del tablero Kanban actual." con acciones abiertas
- Notas manuales del usuario
- Aclaraciones a preguntas previas

${modeRules}

Schema exacto de respuesta:
{
  "transcript": "eco del texto recibido",
  "validation": {
    "status": "usable | needs_more_context | not_usable",
    "summary": "string",
    "missingPoints": ["string"],
    "clarificationQuestions": ["string"]
  },
  "interpretation": {
    "executiveSummary": "string",
    "signals": ["string"],
    "risks": ["string"],
    "opportunities": ["string"]
  },
  "nextSteps": ["string"],
  "actionDrafts": [
    {
      "title": "string",
      "description": "string",
      "objective": "string",
      "evidenceExpected": "string",
      "priority": "P1_Alta | P2_Media | P3_Baja",
      "leanWaste": "string",
      "eosComponent": "string",
      "ownerHint": null,
      "dueDateHint": null,
      "activities": ["string"]
    }
  ]
}

Reglas:
- Espanol claro y ejecutivo.
- No uses markdown.
- Si el texto es ruido o vacio: not_usable.
- nextSteps: maximo 5, concretos.
`.trim()
}

function clip(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function asStringArray(value: unknown, maxItems = 8, maxLen = 240): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLen))
}

function normalizePriority(value: unknown): ActionDraftPriority {
  if (value === 'P1_Alta' || value === 'P2_Media' || value === 'P3_Baja') return value
  if (value === 'P1_Critica') return 'P1_Alta'
  return 'P2_Media'
}

function normalizeDraft(raw: unknown): AssistantActionDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const draft = raw as Record<string, unknown>
  const title = clip(draft.title, 70)
  if (!title) return null
  const activities = asStringArray(draft.activities, 5, 180)
  return {
    title,
    description: clip(draft.description, 800) || title,
    objective: clip(draft.objective, 400),
    evidenceExpected: clip(draft.evidenceExpected, 400),
    priority: normalizePriority(draft.priority),
    leanWaste: clip(draft.leanWaste, 120),
    eosComponent: clip(draft.eosComponent, 120),
    ownerHint: clip(draft.ownerHint, 120) || null,
    dueDateHint: clip(draft.dueDateHint, 80) || null,
    activities,
  }
}

function normalizeResult(parsed: unknown, transcript: string, intent: AssistantAudioIntent): AssistantAudioResult {
  if (!parsed || typeof parsed !== 'object') return EMPTY_RESULT(transcript)
  const raw = parsed as Record<string, unknown>
  const validationRaw =
    raw.validation && typeof raw.validation === 'object'
      ? (raw.validation as Record<string, unknown>)
      : {}
  const interpretationRaw =
    raw.interpretation && typeof raw.interpretation === 'object'
      ? (raw.interpretation as Record<string, unknown>)
      : {}

  let status = clip(validationRaw.status, 40)
  if (status !== 'usable' && status !== 'needs_more_context' && status !== 'not_usable') {
    status = 'needs_more_context'
  }

  let actionDrafts =
    intent === 'advisory'
      ? []
      : (Array.isArray(raw.actionDrafts) ? raw.actionDrafts : [])
          .map(normalizeDraft)
          .filter((draft): draft is AssistantActionDraft => Boolean(draft))
          .slice(0, 3)

  if (intent === 'plan_actions' && status === 'usable' && actionDrafts.length === 0) {
    status = 'needs_more_context'
  }

  if (status !== 'usable') {
    actionDrafts = []
  }

  return {
    transcript: clip(raw.transcript, MAX_TEXT_CHARS) || transcript,
    validation: {
      status: status as AssistantAudioResult['validation']['status'],
      summary: clip(validationRaw.summary, 400) || 'Sin resumen de validacion.',
      missingPoints: asStringArray(validationRaw.missingPoints, 6),
      clarificationQuestions: asStringArray(validationRaw.clarificationQuestions, 5),
    },
    interpretation: {
      executiveSummary: clip(interpretationRaw.executiveSummary, 800),
      signals: asStringArray(interpretationRaw.signals, 6),
      risks: asStringArray(interpretationRaw.risks, 6),
      opportunities: asStringArray(interpretationRaw.opportunities, 6),
    },
    nextSteps: asStringArray(raw.nextSteps, 5),
    actionDrafts,
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('Respuesta no JSON')
  }
}

async function callGemini(system: string, user: string, signal: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('missing_gemini')

  const model = readStringEnv('GEMINI_MODEL', DEFAULT_GEMINI_MODEL).replace(/^models\//, '')
  const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: readNumberEnv('GEMINI_MAX_TOKENS', DEFAULT_MAX_TOKENS),
        temperature: readNumberEnv('GEMINI_TEMPERATURE', DEFAULT_TEMPERATURE),
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('assistant-audio Gemini error', response.status, errorText.slice(0, 400))
    throw new Error(`gemini_${response.status}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('')
    .trim()
  if (!text) throw new Error('gemini_empty')
  return text
}

async function callClaude(system: string, user: string, signal: AbortSignal) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('missing_anthropic')

  const model = readStringEnv('CLAUDE_MODEL', DEFAULT_CLAUDE_MODEL)
  const fallback = readStringEnv('CLAUDE_FALLBACK_MODEL', '')
  const models = fallback && fallback !== model ? [model, fallback] : [model]

  let lastError: Error | null = null
  for (const candidate of models) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal,
      body: JSON.stringify({
        model: candidate,
        max_tokens: readNumberEnv('CLAUDE_MAX_TOKENS', DEFAULT_MAX_TOKENS),
        temperature: readNumberEnv('CLAUDE_TEMPERATURE', DEFAULT_TEMPERATURE),
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('assistant-audio Claude error', candidate, response.status, errorText.slice(0, 400))
      lastError = new Error(`claude_${response.status}`)
      continue
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>
    }
    const text = data.content
      ?.filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text)
      .join('')
      .trim()
    if (!text) {
      lastError = new Error('claude_empty')
      continue
    }
    return text
  }

  throw lastError ?? new Error('claude_failed')
}

export default async function handler(req: VercelRequestLike, serverRes: ServerResponse) {
  const res = asJsonResponse(serverRes)

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
    }

    const hasGemini = Boolean(process.env.GEMINI_API_KEY)
    const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY)
    if (!hasGemini && !hasClaude) {
      return res.status(500).json({
        error:
          'Falta configurar GEMINI_API_KEY o ANTHROPIC_API_KEY en variables de entorno del servidor.',
      })
    }

    const body = await readRequestBody(req)
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }

    const payload = body as Record<string, unknown>
    const text = clip(payload.text, MAX_TEXT_CHARS)
    const context = clip(payload.context, MAX_CONTEXT_CHARS)
    const clarifications = clip(payload.clarifications, MAX_CLARIFICATIONS_CHARS)
    const intent: AssistantAudioIntent =
      payload.intent === 'advisory' ? 'advisory' : 'plan_actions'

    if (!text) {
      return res.status(400).json({ error: 'Debes enviar texto para interpretar.' })
    }

    const system = buildSystemPrompt(intent)
    const user = [
      'Nota del usuario:',
      text,
      context ? `\nContexto operativo:\n${context}` : '',
      clarifications ? `\nAclaraciones del usuario:\n${clarifications}` : '',
      '\nDevuelve solo el JSON del schema.',
    ]
      .filter(Boolean)
      .join('\n')

    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      readNumberEnv(
        hasClaude && !hasGemini ? 'CLAUDE_TIMEOUT_MS' : 'GEMINI_TIMEOUT_MS',
        DEFAULT_TIMEOUT_MS
      )
    )

    let modelText: string
    try {
      // Preferimos Gemini (ya configurado en el proyecto); Claude si solo hay Anthropic o ASSISTANT_AUDIO_PROVIDER=claude
      const preferClaude =
        readStringEnv('ASSISTANT_AUDIO_PROVIDER', '').toLowerCase() === 'claude' ||
        (!hasGemini && hasClaude)
      modelText = preferClaude
        ? await callClaude(system, user, controller.signal)
        : await callGemini(system, user, controller.signal)
    } finally {
      clearTimeout(timeout)
    }

    const parsed = extractJsonObject(modelText)
    const result = normalizeResult(parsed, text, intent)
    return res.status(200).json({ result })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({
        error: 'La interpretacion tardo demasiado. Intenta con una nota mas concreta.',
      })
    }

    console.error('assistant-audio error:', error)
    return res.status(500).json({
      error: 'Ocurrio un error inesperado al interpretar la nota.',
    })
  }
}
