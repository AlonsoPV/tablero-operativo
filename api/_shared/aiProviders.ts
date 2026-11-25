/**
 * Arquitectura desacoplada de proveedores IA (LLM / STT / TTS) — SCRUMBAN Phase 3.
 *
 * Principios obligatorios:
 * 1. Preservar integraciones existentes (Gemini, ElevenLabs, Retell, navegador).
 * 2. Cero proveedores de pago automáticos: cualquier proveedor externo de pago requiere
 *    activación explícita por configuración autorizada.
 * 3. Cero dependencias pesadas en los bundles serverless de Vercel: los motores locales
 *    (faster-whisper, Kokoro TTS) operan únicamente como adaptadores HTTP loopback opcionales
 *    para desarrollo y demostración, nunca como infraestructura cloud de Producción.
 * 4. Fallback seguro y honesto:
 *    - STT no disponible -> entrada por texto sin perder contexto.
 *    - TTS no disponible -> respuesta visual intacta.
 *    - LLM no disponible -> mensaje claro y recuperación de contexto (nunca respuestas falsas).
 */

export const FREE_TIER_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
] as const

const FREE_TIER_MODEL_SET = new Set<string>(FREE_TIER_GEMINI_MODELS)

export type LlmProviderMode =
  | 'gemini_free_tier_verified'
  | 'gemini_authorized_paid'
  | 'orchestrator_only_no_llm'

export type SttProviderMode =
  | 'local_whisper_adapter'
  | 'browser_speech_recognition'
  | 'server_stt_authorized'
  | 'text_only_fallback'

export type TtsProviderMode =
  | 'local_kokoro_adapter'
  | 'browser_es_mx'
  | 'elevenlabs_authorized'
  | 'visual_only_fallback'

export type LlmProviderDecision = {
  mode: LlmProviderMode
  model: string | null
  canCallExternalApi: boolean
  isPaidProvider: boolean
  guaranteedZeroCost: boolean
  fallbackMessage: string
  blockedReason: string | null
}

export type SttProviderDecision = {
  mode: SttProviderMode
  adapterUrl: string | null
  isLocalOnly: boolean
  isPaidProvider: boolean
  fallbackBehavior: 'text_input_preserving_context'
}

export type TtsProviderDecision = {
  mode: TtsProviderMode
  adapterUrl: string | null
  isLocalOnly: boolean
  isPaidProvider: boolean
  licenseNote: string
  fallbackBehavior: 'visual_reply_intact'
}

export type AiProviderStack = {
  zeroCostEnforced: boolean
  silentFakeFallbackAllowed: false
  llm: LlmProviderDecision
  stt: SttProviderDecision
  tts: TtsProviderDecision
  externalPaidCallsActive: boolean
}

/** Valida que una URL de adaptador local apunte exclusivamente a loopback (desarrollo/demo). */
export function parseLoopbackAdapterUrl(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') return null
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function hasUsableApiKey(rawKey: string | undefined): boolean {
  const key = (rawKey ?? '').trim()
  if (key.length < 16) return false
  return !/local-qa-disabled|placeholder|dummy|fake/i.test(key)
}

/**
 * Compatibilidad: valida únicamente sintaxis básica de clave.
 * IMPORTANTE: el prefijo de una API key (p. ej. `AIza...`) NO acredita modalidad gratuita
 * ni estado de facturación; la gratuidad sólo puede acreditarse verificando billing en consola.
 */
export function isRealAiStudioGeminiKey(rawKey: string | undefined): boolean {
  const key = (rawKey ?? '').trim()
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(key)
}

export function resolveLlmProvider(
  env: Record<string, string | undefined> = process.env
): LlmProviderDecision {
  const zeroCostOnly = env.AI_ZERO_COST_ONLY === '1' || env.GEMINI_FREE_TIER_ONLY === '1'
  const rawKey = (env.GEMINI_API_KEY ?? '').trim()
  const model = (env.GEMINI_MODEL ?? 'gemini-2.5-flash').trim()
  const keyUsable = hasUsableApiKey(rawKey)

  const fallbackMessage =
    'El motor conversacional externo no está activo en este momento. Tus datos del tablero y tu conversación siguen intactos; puedes consultar prioridades, bloqueos, documentos o propuestas R2 directamente.'

  if (!keyUsable) {
    return {
      mode: 'orchestrator_only_no_llm',
      model: null,
      canCallExternalApi: false,
      isPaidProvider: false,
      guaranteedZeroCost: true,
      fallbackMessage,
      blockedReason: 'GEMINI_API_KEY ausente o deshabilitada localmente ($0 USD garantizado).',
    }
  }

  if (zeroCostOnly) {
    if (!FREE_TIER_MODEL_SET.has(model)) {
      return {
        mode: 'orchestrator_only_no_llm',
        model: null,
        canCallExternalApi: false,
        isPaidProvider: false,
        guaranteedZeroCost: true,
        fallbackMessage,
        blockedReason: `Modelo "${model}" fuera de allowlist gratuita (${FREE_TIER_GEMINI_MODELS.join(', ')}).`,
      }
    }
    if (env.GEMINI_FREE_TIER_CONFIRMED !== '1') {
      return {
        mode: 'orchestrator_only_no_llm',
        model: null,
        canCallExternalApi: false,
        isPaidProvider: false,
        guaranteedZeroCost: true,
        fallbackMessage,
        blockedReason:
          'El prefijo de la API key no acredita modalidad gratuita; requiere verificación externa de facturación y GEMINI_FREE_TIER_CONFIRMED=1 para garantizar $0 USD.',
      }
    }
    return {
      mode: 'gemini_free_tier_verified',
      model,
      canCallExternalApi: true,
      isPaidProvider: false,
      guaranteedZeroCost: true,
      fallbackMessage,
      blockedReason: null,
    }
  }

  // Modo estándar (AI_ZERO_COST_ONLY apagado): preserva Gemini autorizado sin limitar el producto al modo determinista.
  return {
    mode: 'gemini_authorized_paid',
    model,
    canCallExternalApi: true,
    isPaidProvider: true,
    guaranteedZeroCost: false,
    fallbackMessage,
    blockedReason: null,
  }
}

export function resolveSttProvider(
  env: Record<string, string | undefined> = process.env
): SttProviderDecision {
  const zeroCostOnly = env.AI_ZERO_COST_ONLY === '1' || env.GEMINI_FREE_TIER_ONLY === '1'
  const localUrl = parseLoopbackAdapterUrl(env.LOCAL_STT_URL)

  if (localUrl) {
    return {
      mode: 'local_whisper_adapter',
      adapterUrl: localUrl,
      isLocalOnly: true,
      isPaidProvider: false,
      fallbackBehavior: 'text_input_preserving_context',
    }
  }

  if (
    !zeroCostOnly &&
    env.VOICE_STT_LIVE === '1' &&
    Boolean(hasUsableApiKey(env.OPENAI_API_KEY) || hasUsableApiKey(env.GEMINI_API_KEY))
  ) {
    return {
      mode: 'server_stt_authorized',
      adapterUrl: null,
      isLocalOnly: false,
      isPaidProvider: true,
      fallbackBehavior: 'text_input_preserving_context',
    }
  }

  // SpeechRecognition del navegador puede depender de servicios cloud del proveedor del navegador (no garantiza procesamiento 100% local).
  return {
    mode: 'browser_speech_recognition',
    adapterUrl: null,
    isLocalOnly: false,
    isPaidProvider: false,
    fallbackBehavior: 'text_input_preserving_context',
  }
}

export function resolveTtsProvider(
  env: Record<string, string | undefined> = process.env
): TtsProviderDecision {
  const zeroCostOnly = env.AI_ZERO_COST_ONLY === '1' || env.GEMINI_FREE_TIER_ONLY === '1'
  const localUrl = parseLoopbackAdapterUrl(env.LOCAL_TTS_URL)

  if (localUrl) {
    return {
      mode: 'local_kokoro_adapter',
      adapterUrl: localUrl,
      isLocalOnly: true,
      isPaidProvider: false,
      licenseNote:
        'Adaptador local loopback opcional para dev/demo. Verificar licencia individual del modelo y cada voz antes de uso comercial.',
      fallbackBehavior: 'visual_reply_intact',
    }
  }

  if (!zeroCostOnly && env.VOICE_TTS_LIVE === '1' && Boolean(env.ELEVENLABS_API_KEY?.trim())) {
    return {
      mode: 'elevenlabs_authorized',
      adapterUrl: null,
      isLocalOnly: false,
      isPaidProvider: true,
      licenseNote: 'ElevenLabs API autorizado explícitamente (verificar plan y licencia comercial vigente).',
      fallbackBehavior: 'visual_reply_intact',
    }
  }

  // SpeechSynthesis no garantiza que todas las voces instaladas/expuestas sean locales (pueden existir voces online del navegador).
  return {
    mode: 'browser_es_mx',
    adapterUrl: null,
    isLocalOnly: false,
    isPaidProvider: false,
    licenseNote:
      'Web Speech API del navegador (es-MX, sin dependencias serverless). Algunas voces pueden depender de servicios del navegador/SO; verificar términos y voces locales.',
    fallbackBehavior: 'visual_reply_intact',
  }
}

export function resolveAiProviderStack(
  env: Record<string, string | undefined> = process.env
): AiProviderStack {
  const zeroCostEnforced = env.AI_ZERO_COST_ONLY === '1' || env.GEMINI_FREE_TIER_ONLY === '1'
  const llm = resolveLlmProvider(env)
  const stt = resolveSttProvider(env)
  const tts = resolveTtsProvider(env)

  return {
    zeroCostEnforced,
    silentFakeFallbackAllowed: false,
    llm,
    stt,
    tts,
    externalPaidCallsActive: llm.isPaidProvider || stt.isPaidProvider || tts.isPaidProvider,
  }
}
