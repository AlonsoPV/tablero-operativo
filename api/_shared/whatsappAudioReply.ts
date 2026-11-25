/**
 * Contrato de preferencias y decisión de modalidad de respuesta por audio en WhatsApp.
 *
 * Modalidades conservadas:
 * - `text` (Texto): siempre responde por texto.
 * - `audio` (Audio): solicita síntesis de audio con fallback seguro a texto si TTS no está disponible o falla.
 * - `smart` (Inteligente): prioriza audio para respuestas breves conversacionales y texto para
 *   indicadores/métricas, propuestas R2, enlaces y datos estructurados.
 *
 * Reglas estrictas:
 * - ElevenLabs nunca se activa remotamente por defecto (`elevenLabsEnabled` default `false`).
 * - Nunca afirma que el audio fue enviado (`audioSent: true`) si únicamente fue generado (`audioGenerated: true`).
 * - Cero conservación innecesaria de audio (`audioRetained: false`).
 */

export type WhatsAppReplyAudioMode = 'text' | 'audio' | 'smart'

export type WhatsAppAudioReplyPreference = {
  mode: WhatsAppReplyAudioMode
  /** Longitud máxima de texto para priorizar audio en modo `smart` (default: 320 caracteres). */
  maxSmartAudioChars?: number
  /** Longitud máxima general enviada a TTS (default: 900 caracteres). */
  maxTtsChars?: number
  /** Interruptor explícito de síntesis (default: false; nunca se activa remotamente). */
  ttsEnabled?: boolean
  /** Fallback automático a texto si TTS está deshabilitado, falla o no entrega (default: true). */
  fallbackToText?: boolean
}

export type WhatsAppReplyContentMeta = {
  hasProposal?: boolean
  hasIndicators?: boolean
  hasStructuredData?: boolean
  hasLinks?: boolean
}

export type WhatsAppReplyModalityDecision = {
  requestedMode: WhatsAppReplyAudioMode
  selectedModality: 'text' | 'audio'
  reason:
    | 'mode_text'
    | 'mode_audio'
    | 'smart_brief_conversational'
    | 'smart_proposal_requires_text'
    | 'smart_indicators_require_text'
    | 'smart_structured_requires_text'
    | 'smart_links_require_text'
    | 'smart_too_long_for_audio'
    | 'empty_reply'
}

export type WhatsAppAudioDeliveryResult = {
  requestedMode: WhatsAppReplyAudioMode
  selectedModality: 'text' | 'audio'
  decisionReason: WhatsAppReplyModalityDecision['reason']
  text: string
  /** True sólo si el proveedor TTS generó bytes de audio en memoria. */
  audioGenerated: boolean
  /** True ÚNICAMENTE si un transporte confirmó el envío del audio al destinatario. */
  audioSent: boolean
  /** True si se aplicó fallback a texto (TTS deshabilitado, error de síntesis o fallo de entrega). */
  fallbackUsed: boolean
  fallbackReason: string | null
  audioMeta: { mimeType: 'audio/mpeg' | 'audio/ogg'; byteLength: number } | null
  deliveryMessageId: string | null
  audioRetained: false
}

const DEFAULT_SMART_MAX_CHARS = 320
const DEFAULT_MAX_TTS_CHARS = 900

export function normalizeReplyAudioMode(raw: unknown): WhatsAppReplyAudioMode {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'audio' || value === 'voz' || value === 'voice') return 'audio'
  if (value === 'smart' || value === 'inteligente' || value === 'auto') return 'smart'
  return 'text'
}

export function detectStructuredOrSensitiveText(
  replyText: string,
  meta: WhatsAppReplyContentMeta = {}
): {
  hasProposal: boolean
  hasIndicators: boolean
  hasStructuredData: boolean
  hasLinks: boolean
} {
  const text = replyText.trim()
  const hasProposal =
    meta.hasProposal === true ||
    /\b(propuesta preparada|borrador preparado|c[oó]digo:\s*[A-Z0-9]{6,16}|confirmar\s+[A-Z0-9]{6,16}|cancelar\s+[A-Z0-9]{6,16}|r2 deshabilitado)\b/i.test(
      text
    )
  const hasLinks = meta.hasLinks === true || /https?:\/\/\S+/i.test(text)
  const numericIndicators =
    (text.match(/\b\d+(?:\.\d+)?\s*%/g)?.length ?? 0) >= 1 ||
    (text.match(/\b(?:okr|kpi|avance|vencidas?|bloqueadas?|pendientes?|hechas?|verificadas?)\s*[:=]?\s*\d+/gi)?.length ??
      0) >= 2 ||
    (text.match(/\b\d+\s*\/\s*\d+\b/g)?.length ?? 0) >= 1
  const hasIndicators = meta.hasIndicators === true || numericIndicators

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const listLines = lines.filter((line) => /^([-•*]|\d+[.)])\s+/.test(line)).length
  const kvLines = lines.filter((line) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,24}:\s+\S+/.test(line)).length
  const hasStructuredData =
    meta.hasStructuredData === true || listLines >= 2 || kvLines >= 2 || lines.length >= 4

  return { hasProposal, hasIndicators, hasStructuredData, hasLinks }
}

/**
 * Decide modalidad ideal (`text` vs `audio`) según preferencia del usuario y tipo de contenido.
 */
export function decideWhatsAppReplyModality(
  replyText: string,
  preference: WhatsAppAudioReplyPreference,
  meta: WhatsAppReplyContentMeta = {}
): WhatsAppReplyModalityDecision {
  const mode = normalizeReplyAudioMode(preference.mode)
  const trimmed = replyText.trim()
  if (!trimmed) {
    return { requestedMode: mode, selectedModality: 'text', reason: 'empty_reply' }
  }
  if (mode === 'text') {
    return { requestedMode: mode, selectedModality: 'text', reason: 'mode_text' }
  }
  if (mode === 'audio') {
    return { requestedMode: mode, selectedModality: 'audio', reason: 'mode_audio' }
  }

  // Modo `smart` (inteligente): audio para respuestas breves; texto para indicadores, propuestas, links y datos estructurados.
  const signals = detectStructuredOrSensitiveText(trimmed, meta)
  if (signals.hasProposal) {
    return { requestedMode: mode, selectedModality: 'text', reason: 'smart_proposal_requires_text' }
  }
  if (signals.hasIndicators) {
    return { requestedMode: mode, selectedModality: 'text', reason: 'smart_indicators_require_text' }
  }
  if (signals.hasStructuredData) {
    return { requestedMode: mode, selectedModality: 'text', reason: 'smart_structured_requires_text' }
  }
  if (signals.hasLinks) {
    return { requestedMode: mode, selectedModality: 'text', reason: 'smart_links_require_text' }
  }
  const maxSmart = preference.maxSmartAudioChars ?? DEFAULT_SMART_MAX_CHARS
  if (trimmed.length > maxSmart) {
    return { requestedMode: mode, selectedModality: 'text', reason: 'smart_too_long_for_audio' }
  }
  return { requestedMode: mode, selectedModality: 'audio', reason: 'smart_brief_conversational' }
}

export type AudioReplySynthesizer = (input: {
  text: string
}) => Promise<{ audioBytes: Uint8Array; mimeType: 'audio/mpeg' | 'audio/ogg' } | null>

export type AudioReplyDeliverer = (input: {
  audioBytes: Uint8Array
  mimeType: 'audio/mpeg' | 'audio/ogg'
}) => Promise<{ delivered: boolean; messageId?: string | null }>

/**
 * Ejecuta el contrato de respuesta por audio con fallback limpio a texto y
 * separación explícita entre `audioGenerated` y `audioSent`.
 */
export async function prepareWhatsAppAudioReply(input: {
  replyText: string
  preference: WhatsAppAudioReplyPreference
  contentMeta?: WhatsAppReplyContentMeta
  synthesize?: AudioReplySynthesizer
  deliverAudio?: AudioReplyDeliverer
}): Promise<WhatsAppAudioDeliveryResult> {
  const decision = decideWhatsAppReplyModality(input.replyText, input.preference, input.contentMeta)
  const fallbackToText = input.preference.fallbackToText !== false
  const text = input.replyText.trim()

  if (decision.selectedModality === 'text') {
    return {
      requestedMode: decision.requestedMode,
      selectedModality: 'text',
      decisionReason: decision.reason,
      text,
      audioGenerated: false,
      audioSent: false,
      fallbackUsed: false,
      fallbackReason: null,
      audioMeta: null,
      deliveryMessageId: null,
      audioRetained: false,
    }
  }

  if (!input.preference.ttsEnabled || !input.synthesize) {
    return {
      requestedMode: decision.requestedMode,
      selectedModality: 'text',
      decisionReason: decision.reason,
      text,
      audioGenerated: false,
      audioSent: false,
      fallbackUsed: fallbackToText,
      fallbackReason: 'tts_disabled',
      audioMeta: null,
      deliveryMessageId: null,
      audioRetained: false,
    }
  }

  const maxTtsChars = input.preference.maxTtsChars ?? DEFAULT_MAX_TTS_CHARS
  let synthesized: { audioBytes: Uint8Array; mimeType: 'audio/mpeg' | 'audio/ogg' } | null = null
  try {
    synthesized = await input.synthesize({ text: text.slice(0, maxTtsChars) })
    if (!synthesized || synthesized.audioBytes.byteLength === 0) {
      return {
        requestedMode: decision.requestedMode,
        selectedModality: 'text',
        decisionReason: decision.reason,
        text,
        audioGenerated: false,
        audioSent: false,
        fallbackUsed: fallbackToText,
        fallbackReason: 'tts_empty_audio',
        audioMeta: null,
        deliveryMessageId: null,
        audioRetained: false,
      }
    }

    const audioMeta = {
      mimeType: synthesized.mimeType,
      byteLength: synthesized.audioBytes.byteLength,
    }

    // Nunca afirmar que el audio se envió si no existe un transporte que confirme la entrega.
    if (!input.deliverAudio) {
      return {
        requestedMode: decision.requestedMode,
        selectedModality: 'audio',
        decisionReason: decision.reason,
        text,
        audioGenerated: true,
        audioSent: false,
        fallbackUsed: false,
        fallbackReason: null,
        audioMeta,
        deliveryMessageId: null,
        audioRetained: false,
      }
    }

    try {
      const delivery = await input.deliverAudio({
        audioBytes: synthesized.audioBytes,
        mimeType: synthesized.mimeType,
      })
      if (delivery.delivered) {
        return {
          requestedMode: decision.requestedMode,
          selectedModality: 'audio',
          decisionReason: decision.reason,
          text,
          audioGenerated: true,
          audioSent: true,
          fallbackUsed: false,
          fallbackReason: null,
          audioMeta,
          deliveryMessageId: delivery.messageId ?? null,
          audioRetained: false,
        }
      }
      return {
        requestedMode: decision.requestedMode,
        selectedModality: 'text',
        decisionReason: decision.reason,
        text,
        audioGenerated: true,
        audioSent: false,
        fallbackUsed: fallbackToText,
        fallbackReason: 'audio_delivery_failed',
        audioMeta,
        deliveryMessageId: null,
        audioRetained: false,
      }
    } catch {
      return {
        requestedMode: decision.requestedMode,
        selectedModality: 'text',
        decisionReason: decision.reason,
        text,
        audioGenerated: true,
        audioSent: false,
        fallbackUsed: fallbackToText,
        fallbackReason: 'audio_delivery_error',
        audioMeta,
        deliveryMessageId: null,
        audioRetained: false,
      }
    }
  } catch {
    return {
      requestedMode: decision.requestedMode,
      selectedModality: 'text',
      decisionReason: decision.reason,
      text,
      audioGenerated: false,
      audioSent: false,
      fallbackUsed: fallbackToText,
      fallbackReason: 'tts_error',
      audioMeta: null,
      deliveryMessageId: null,
      audioRetained: false,
    }
  } finally {
    if (synthesized?.audioBytes) {
      synthesized.audioBytes.fill(0)
    }
    synthesized = null
  }
}
