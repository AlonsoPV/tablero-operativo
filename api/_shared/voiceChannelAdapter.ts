/**
 * Adaptador de canal Voz (R4) — capa delgada sobre el orquestador unificado R1/R2/R3/Executive MVP.
 *
 * No duplica lógica de negocio ni permisos. Responsabilidades:
 * 1. Formatear respuestas para escucha natural en español de México (pausas, brevedad,
 *    una decisión principal por turno, confirmaciones claras y sin markdown/UUIDs).
 * 2. Declarar de forma honesta el modo de interacción (`turn_based`, sin fingir streaming
 *    en tiempo real cuando no existe un proveedor en vivo activo).
 * 3. Emitir un resumen escrito idempotente de acuerdos de la sesión de voz (reutilizando
 *    la garantía de finalización única de R4).
 */
import type { AgentTurnResult } from './orchestrator/runAgentTurn.js'
import { resolveAiProviderStack } from './aiProviders.js'

export const VOICE_TURN_MODE = 'turn_based' as const
export const VOICE_DEFAULT_LOCALE = 'es-MX' as const
const DEFAULT_VOICE_MAX_CHARS = 440

export type VoiceProviderReadiness = {
  mode: typeof VOICE_TURN_MODE
  locale: typeof VOICE_DEFAULT_LOCALE
  realtimeStreamingAvailable: false
  sttProvider: 'server_transcribe' | 'local_whisper_adapter' | 'browser_speech_recognition'
  ttsProvider: 'elevenlabs_live' | 'local_kokoro_adapter' | 'browser_es_mx_fallback'
  llmProvider: 'gemini_free_tier_verified' | 'gemini_authorized_paid' | 'orchestrator_only_no_llm'
  localTtsUrl?: string | null
  externalPaidCallsActive: boolean
}

export function resolveVoiceProviderReadiness(
  env: Record<string, string | undefined> = process.env
): VoiceProviderReadiness {
  const stack = resolveAiProviderStack(env)
  const sttProvider =
    stack.stt.mode === 'server_stt_authorized'
      ? 'server_transcribe'
      : stack.stt.mode === 'local_whisper_adapter'
        ? 'local_whisper_adapter'
        : 'browser_speech_recognition'
  const ttsProvider =
    stack.tts.mode === 'elevenlabs_authorized'
      ? 'elevenlabs_live'
      : stack.tts.mode === 'local_kokoro_adapter'
        ? 'local_kokoro_adapter'
        : 'browser_es_mx_fallback'

  return {
    mode: VOICE_TURN_MODE,
    locale: VOICE_DEFAULT_LOCALE,
    realtimeStreamingAvailable: false,
    sttProvider,
    ttsProvider,
    llmProvider: stack.llm.mode,
    ...(stack.tts.adapterUrl ? { localTtsUrl: stack.tts.adapterUrl } : {}),
    externalPaidCallsActive: stack.externalPaidCallsActive,
  }
}

const SPANISH_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

function humanizeIsoDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return iso
  const monthIdx = Number(match[2]) - 1
  const day = Number(match[3])
  const monthName = SPANISH_MONTHS[monthIdx]
  if (!monthName || day < 1 || day > 31) return iso
  return `${day} de ${monthName}`
}

/**
 * Limpia texto visual/markdown para lectura natural en español de México.
 * Elimina URLs, UUIDs, viñetas duras, símbolos markdown y pronuncia fechas, prioridades y porcentajes.
 */
export function sanitizeTextForVoiceSpeech(
  rawText: string,
  options: { hasProposals?: boolean; maxChars?: number } = {}
): string {
  const maxChars = options.maxChars ?? DEFAULT_VOICE_MAX_CHARS
  let cleaned = rawText
    // 1. Conservar texto visible de enlaces Markdown antes de eliminar URLs crudas
    .replace(/\[([^\]]+)\]\((?:https?:\/\/[^)]+|\/[^)]+)\)/gi, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    // 2. Eliminar bloques de código, backticks y UUIDs
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    // 3. Humanizar enums, fechas ISO y porcentajes ANTES de limpiar guiones bajos/símbolos
    .replace(/\bP1_Alta\b/g, 'prioridad alta')
    .replace(/\bP2_Media\b/g, 'prioridad media')
    .replace(/\bP3_Baja\b/g, 'prioridad baja')
    .replace(/\bEn_Ejecucion\b/g, 'en ejecución')
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_, d: string) => humanizeIsoDate(d))
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, '$1 por ciento')
    // 4. Eliminar símbolos Markdown/tablas y normalizar puntuación para lectura fluida
    .replace(/[*#_~`[\]]/g, '')
    .replace(/[«»]/g, '')
    .replace(/^\s*[-•·]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\r?\n+/g, '. ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/\.\s*\.+/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Quitar encabezados técnicos redundantes al hablar
  cleaned = cleaned.replace(/^(Datos|Análisis|Analisis|Recomendación|Recomendacion|Limitaciones)\s*:\s*/i, '')

  if (options.hasProposals && !/aprob|propuesta|tarjeta|confirm/i.test(cleaned)) {
    const suffix = ' Dejé la propuesta lista en pantalla para que puedas aprobarla, editarla o cancelarla.'
    cleaned = cleaned ? `${cleaned.replace(/[.\s]+$/, '')}.${suffix}` : suffix.trim()
  }

  if (cleaned.length <= maxChars) return cleaned
  const slice = cleaned.slice(0, maxChars - 1)
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '))
  if (lastStop >= Math.floor(maxChars * 0.55)) {
    return slice.slice(0, lastStop + 1).trim()
  }
  return `${slice.trim()}…`
}

function firstCleanLines(lines: string[] | undefined, max: number): string[] {
  if (!Array.isArray(lines)) return []
  return lines
    .map((line) => line.replace(/^\s*[-•·]\s+/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, max)
}

/**
 * Convierte un AgentTurnResult del orquestador R1/R2/R3 en una respuesta hablada cálida,
 * natural, clara y concisa en español de México, conservando los detalles en el complemento visual.
 */
export function formatVoiceSpokenReply(result: AgentTurnResult): string {
  const { response } = result
  const hasProposals = Boolean(
    (result.proposals && result.proposals.length > 0) || result.proposal
  )

  if (response.status === 'forbidden') {
    const msg = firstCleanLines(response.blocks.data, 1)[0] ||
      firstCleanLines(response.blocks.limitations, 1)[0] ||
      'No tienes permiso para consultar o modificar esa información.'
    return sanitizeTextForVoiceSpeech(msg)
  }

  if (response.status === 'error') {
    const msg = firstCleanLines(response.blocks.data, 1)[0] ||
      'No pude consultar el tablero en este momento. No invento datos; puedes intentarlo de nuevo.'
    return sanitizeTextForVoiceSpeech(msg)
  }

  if (response.status === 'clarification') {
    const q = result.clarification?.question || firstCleanLines(response.blocks.data, 1)[0] ||
      '¿Me confirmas a qué acción o equipo te refieres para ayudarte con precisión?'
    return sanitizeTextForVoiceSpeech(q)
  }

  const parts: string[] = []
  if (result.notice) parts.push(result.notice)

  if (hasProposals) {
    const summary = firstCleanLines(response.blocks.data, 1)[0] ||
      'Preparé la propuesta con los datos de tu solicitud.'
    parts.push(summary)
    parts.push(
      'Todavía no se aplicó ningún cambio. Puedes revisarla en pantalla para aprobarla, editarla o cancelarla.'
    )
    return sanitizeTextForVoiceSpeech(parts.join(' '), { hasProposals: true, maxChars: DEFAULT_VOICE_MAX_CHARS })
  }

  // Hechos observados (máximo 2 puntos para no saturar al oído)
  const dataLines = firstCleanLines(response.blocks.data, 2)
  if (dataLines.length > 0) parts.push(dataLines.join('. '))

  // Interpretación / Por qué importa (1 frase breve si cabe)
  const analysisLine = firstCleanLines(response.blocks.interpretation, 1)[0]
  if (analysisLine && parts.join(' ').length < 240) {
    parts.push(analysisLine)
  }

  // Una decisión / recomendación principal por turno
  const recLine = firstCleanLines(response.blocks.recommendation, 1)[0]
  if (recLine) {
    parts.push(`Te recomiendo: ${recLine}`)
  } else if (response.status === 'empty') {
    const lim = firstCleanLines(response.blocks.limitations, 1)[0]
    if (lim) parts.push(lim)
  }

  const combined = parts.join(' ')
  return sanitizeTextForVoiceSpeech(combined, { hasProposals, maxChars: DEFAULT_VOICE_MAX_CHARS })
}

export type VoiceAgreementTurnInput = {
  role: 'user' | 'assistant'
  text: string
  intent?: string | null
  timestamp?: string
}

export type VoiceAgreementProposalInput = {
  id: string
  tool: string
  summary: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'error'
}

export type VoiceAgreementsSummary = {
  sessionId: string
  generatedAt: string
  mode: typeof VOICE_TURN_MODE
  turnsCount: number
  executedCommitments: string[]
  pendingProposals: string[]
  cancelledProposals: string[]
  keyFindings: string[]
  markdown: string
  duplicate: boolean
}

/**
 * Finalizador idempotente de resumen escrito de acuerdos (garantía R4):
 * nunca marca propuestas pendientes como ejecutadas y evita resúmenes duplicados idénticos.
 */
export function createVoiceAgreementSummaryFinalizer(nowIso: () => string = () => new Date().toISOString()) {
  const bySession = new Map<string, { digest: string; summary: VoiceAgreementsSummary }>()

  return {
    finalize(input: {
      sessionId: string
      actorLabel?: string
      turns: VoiceAgreementTurnInput[]
      proposals: VoiceAgreementProposalInput[]
    }): VoiceAgreementsSummary {
      const executed = input.proposals
        .filter((p) => p.status === 'confirmed')
        .map((p) => p.summary.trim())
        .filter(Boolean)
      const pending = input.proposals
        .filter((p) => p.status === 'pending')
        .map((p) => p.summary.trim())
        .filter(Boolean)
      const cancelled = input.proposals
        .filter((p) => p.status === 'cancelled')
        .map((p) => p.summary.trim())
        .filter(Boolean)
      const keyFindings = input.turns
        .filter((t) => t.role === 'assistant' && t.text.trim().length > 0)
        .slice(-4)
        .map((t) => t.text.trim().split('\n')[0]!.slice(0, 180))

      const digest = JSON.stringify({
        turnsCount: input.turns.length,
        executed,
        pending,
        cancelled,
        keyFindings,
      })

      const previous = bySession.get(input.sessionId)
      if (previous && previous.digest === digest) {
        return { ...previous.summary, duplicate: true }
      }

      const generatedAt = nowIso()
      const lines: string[] = [
        `Resumen escrito de acuerdos — Sesión de voz (${input.sessionId})`,
        `Fecha: ${generatedAt}${input.actorLabel ? ` · Participante: ${input.actorLabel}` : ''}`,
        `Modalidad: Conversación por turnos (es-MX) · Turnos registrados: ${input.turns.length}`,
        '',
      ]

      if (executed.length > 0) {
        lines.push('Compromisos aprobados y ejecutados:')
        executed.forEach((item, idx) => lines.push(`${idx + 1}. ${item}`))
        lines.push('')
      }

      if (pending.length > 0) {
        lines.push('Propuestas pendientes de aprobación explícita (sin escritura aplicada):')
        pending.forEach((item, idx) => lines.push(`${idx + 1}. ${item}`))
        lines.push('')
      }

      if (cancelled.length > 0) {
        lines.push('Propuestas canceladas:')
        cancelled.forEach((item, idx) => lines.push(`${idx + 1}. ${item}`))
        lines.push('')
      }

      if (keyFindings.length > 0) {
        lines.push('Puntos clave revisados:')
        keyFindings.forEach((item, idx) => lines.push(`${idx + 1}. ${item}`))
      } else {
        lines.push('Sin acuerdos ni consultas registradas todavía en esta sesión.')
      }

      const summary: VoiceAgreementsSummary = {
        sessionId: input.sessionId,
        generatedAt,
        mode: VOICE_TURN_MODE,
        turnsCount: input.turns.length,
        executedCommitments: executed,
        pendingProposals: pending,
        cancelledProposals: cancelled,
        keyFindings,
        markdown: lines.join('\n').trim(),
        duplicate: false,
      }

      bySession.set(input.sessionId, { digest, summary })
      return summary
    },
  }
}
