/**
 * Utilidades compartidas de validación (incluida detección real de formato por magic bytes),
 * duración y transcripción de audio con Gemini.
 * Reutilizado por el dictado web (`assistant-transcribe.ts`) y notas de voz WhatsApp (`whatsappVoiceNotes.ts`).
 *
 * Formatos verificados contra Gemini inlineData:
 *   audio/ogg (incl. codecs=opus de WhatsApp), audio/mpeg, audio/mp3, audio/mp4,
 *   audio/wav, audio/x-wav, audio/webm, audio/flac.
 * Formatos explícitamente NO soportados: audio/amr, audio/3gpp, contenedores corruptos o no-audio.
 */
import { geminiModelCandidates, isGeminiCapacityStatus } from './geminiModel.js'
import { parseLoopbackAdapterUrl, resolveLlmProvider } from './aiProviders.js'

export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_TRANSCRIBE_MODEL = 'gemini-2.5-flash'
export const MIN_AUDIO_BYTES = 64
export const MAX_AUDIO_BYTES = 4_500_000
export const MAX_AUDIO_BASE64_CHARS = 6_000_000
export const MIN_AUDIO_DURATION_SEC = 0.3
export const MAX_AUDIO_DURATION_SEC = 300

const SUPPORTED_BASE_MIMES = new Set([
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/flac',
])

const MIME_FAMILY: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/mpeg': 'mpeg',
  'audio/mp3': 'mpeg',
  'audio/mp4': 'mp4',
  'audio/m4a': 'mp4',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
  'audio/amr': 'amr',
}

export function normalizeAudioMime(rawMime: string | null | undefined): string {
  const base = (rawMime ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  return base
}

export function isSupportedAudioMime(rawMime: string | null | undefined): boolean {
  const base = normalizeAudioMime(rawMime)
  return SUPPORTED_BASE_MIMES.has(base)
}

export type SniffedAudioFormat = {
  mimeType: string
  codec: string | null
  estimatedDurationSec: number | null
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) return ''
  let out = ''
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[offset + i]!)
  }
  return out
}

function findAscii(bytes: Uint8Array, needle: string, maxOffset = 128): number {
  const limit = Math.min(bytes.byteLength - needle.length, maxOffset)
  for (let i = 0; i <= limit; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) {
        ok = false
        break
      }
    }
    if (ok) return i
  }
  return -1
}

/**
 * Extrae duración estimada de contenedores OGG/Opus leyendo la última página `OggS`
 * (reloj estándar Opus de 48 kHz sobre `granule_position` int64 little-endian).
 */
function parseOggOpusDurationSec(bytes: Uint8Array): number | null {
  let lastGranule = -1
  for (let i = 0; i <= bytes.byteLength - 27; i++) {
    if (
      bytes[i] === 0x4f &&
      bytes[i + 1] === 0x67 &&
      bytes[i + 2] === 0x67 &&
      bytes[i + 3] === 0x53
    ) {
      const segCount = bytes[i + 26]!
      if (i + 27 + segCount > bytes.byteLength) return null // Página OGG truncada
      const low =
        bytes[i + 6]! |
        (bytes[i + 7]! << 8) |
        (bytes[i + 8]! << 16) |
        ((bytes[i + 9]! << 24) >>> 0)
      const high =
        bytes[i + 10]! |
        (bytes[i + 11]! << 8) |
        (bytes[i + 12]! << 16) |
        ((bytes[i + 13]! << 24) >>> 0)
      const granule = high * 0x100000000 + (low >>> 0)
      if (Number.isFinite(granule) && granule > 0 && granule < 48_000 * 86_400) {
        lastGranule = granule
      }
    }
  }
  if (lastGranule <= 0) return null
  return Number((lastGranule / 48_000).toFixed(2))
}

/**
 * Inspecciona los magic bytes reales del binario de audio (nunca confía a ciegas en el MIME declarado).
 */
export function sniffAudioMimeFromBytes(bytes: Uint8Array): SniffedAudioFormat | null {
  if (!bytes || bytes.byteLength < 12) return null

  // OGG container (`OggS`) — formato estándar de notas de voz WhatsApp (OGG/Opus).
  if (readAscii(bytes, 0, 4) === 'OggS') {
    if (bytes.byteLength < 27) return null
    const segCount = bytes[26]!
    if (27 + segCount > bytes.byteLength) return null
    let pagePayloadBytes = 0
    for (let i = 0; i < segCount; i++) {
      pagePayloadBytes += bytes[27 + i]!
    }
    if (27 + segCount + pagePayloadBytes > bytes.byteLength) return null
    const hasOpus = findAscii(bytes, 'OpusHead', 96) >= 0
    const hasVorbis = findAscii(bytes, 'vorbis', 96) >= 0
    return {
      mimeType: 'audio/ogg',
      codec: hasOpus ? 'opus' : hasVorbis ? 'vorbis' : 'ogg',
      estimatedDurationSec: hasOpus ? parseOggOpusDurationSec(bytes) : null,
    }
  }

  // AMR (`#!AMR`) — detectado explícitamente para rechazarlo con mensaje claro.
  if (readAscii(bytes, 0, 5) === '#!AMR') {
    return { mimeType: 'audio/amr', codec: 'amr', estimatedDurationSec: null }
  }

  // MP3 (`ID3` tag o frame sync `0xFF 0xE0+`).
  if (
    readAscii(bytes, 0, 3) === 'ID3' ||
    (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x06) !== 0)
  ) {
    return { mimeType: 'audio/mpeg', codec: 'mp3', estimatedDurationSec: null }
  }

  // MP4 / M4A (`ftyp` en offset 4).
  if (readAscii(bytes, 4, 4) === 'ftyp') {
    return { mimeType: 'audio/mp4', codec: 'aac', estimatedDurationSec: null }
  }

  // WAV (`RIFF....WAVE`).
  if (readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WAVE') {
    return { mimeType: 'audio/wav', codec: 'pcm', estimatedDurationSec: null }
  }

  // FLAC (`fLaC`).
  if (readAscii(bytes, 0, 4) === 'fLaC') {
    return { mimeType: 'audio/flac', codec: 'flac', estimatedDurationSec: null }
  }

  // WebM / Matroska EBML (`1A 45 DF A3`).
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mimeType: 'audio/webm', codec: 'opus', estimatedDurationSec: null }
  }

  return null
}

/**
 * Construye un fixture sintético válido de OGG/Opus (sin datos personales ni audio real)
 * para pruebas locales deterministas de magic bytes, codec y duración.
 */
export function buildSyntheticOggOpusFixture(options: { durationSec?: number } = {}): Uint8Array {
  const durationSec = options.durationSec ?? 4
  const granule = Math.max(48_000 * Math.round(durationSec), 48_000)

  // Página 1: OpusHead (19 bytes)
  const opusHead = new Uint8Array(19)
  const headSig = 'OpusHead'
  for (let i = 0; i < headSig.length; i++) opusHead[i] = headSig.charCodeAt(i)
  opusHead[8] = 1 // version
  opusHead[9] = 1 // mono
  opusHead[12] = 0x80 // 48000 Hz little-endian (0x0000BB80)
  opusHead[13] = 0xbb

  // Página 2: paquete sintético con granule_position para duración
  const audioPacket = new Uint8Array(24)
  audioPacket.fill(0x55)

  const makePage = (payload: Uint8Array, granulePos: number, headerType: number, seq: number): Uint8Array => {
    const page = new Uint8Array(27 + 1 + payload.byteLength)
    page[0] = 0x4f // O
    page[1] = 0x67 // g
    page[2] = 0x67 // g
    page[3] = 0x53 // S
    page[4] = 0 // version
    page[5] = headerType
    const low = granulePos >>> 0
    const high = Math.floor(granulePos / 0x100000000) >>> 0
    page[6] = low & 0xff
    page[7] = (low >>> 8) & 0xff
    page[8] = (low >>> 16) & 0xff
    page[9] = (low >>> 24) & 0xff
    page[10] = high & 0xff
    page[11] = (high >>> 8) & 0xff
    page[12] = (high >>> 16) & 0xff
    page[13] = (high >>> 24) & 0xff
    page[18] = seq & 0xff
    page[26] = 1 // 1 segment
    page[27] = payload.byteLength
    page.set(payload, 28)
    return page
  }

  const p1 = makePage(opusHead, 0, 0x02, 0)
  const p2 = makePage(audioPacket, granule, 0x04, 1)
  const combined = new Uint8Array(p1.byteLength + p2.byteLength)
  combined.set(p1, 0)
  combined.set(p2, p1.byteLength)
  return combined
}

export type AudioValidationResult =
  | { ok: true; mimeType: string; codec?: string | null; durationSec?: number | null }
  | {
      ok: false
      code:
        | 'missing_audio'
        | 'audio_too_large'
        | 'audio_too_long'
        | 'unsupported_format'
        | 'corrupt_audio'
        | 'mime_mismatch'
      message: string
    }

export function validateAudioPayload(input: {
  mimeType: string | null | undefined
  byteLength?: number | null
  base64Length?: number | null
  durationSeconds?: number | null
  bytes?: Uint8Array | null
}): AudioValidationResult {
  const declaredMime = normalizeAudioMime(input.mimeType)
  if (!declaredMime || !SUPPORTED_BASE_MIMES.has(declaredMime)) {
    return {
      ok: false,
      code: 'unsupported_format',
      message:
        'Ese formato de audio no es compatible con la transcripción actual. Envía una nota de voz estándar (OGG/Opus, MP3 o M4A) o escribe tu consulta.',
    }
  }

  const effectiveByteLength =
    typeof input.byteLength === 'number' ? input.byteLength : input.bytes?.byteLength

  if (typeof effectiveByteLength === 'number') {
    if (effectiveByteLength < MIN_AUDIO_BYTES) {
      return { ok: false, code: 'missing_audio', message: 'El audio está vacío o es demasiado corto.' }
    }
    if (effectiveByteLength > MAX_AUDIO_BYTES) {
      return {
        ok: false,
        code: 'audio_too_large',
        message: 'La nota de voz supera el límite permitido (4.5 MB). Envíala en partes más cortas.',
      }
    }
  }

  if (typeof input.base64Length === 'number') {
    if (input.base64Length < 80) {
      return { ok: false, code: 'missing_audio', message: 'No llegó audio para transcribir.' }
    }
    if (input.base64Length > MAX_AUDIO_BASE64_CHARS) {
      return {
        ok: false,
        code: 'audio_too_large',
        message: 'El dictado es demasiado largo. Intenta en partes más cortas.',
      }
    }
  }

  let codec: string | null = null
  let effectiveDuration = typeof input.durationSeconds === 'number' ? input.durationSeconds : null

  // Verificación real de magic bytes frente al MIME declarado.
  if (input.bytes) {
    const sniffed = sniffAudioMimeFromBytes(input.bytes)
    if (!sniffed) {
      return {
        ok: false,
        code: 'corrupt_audio',
        message: 'El archivo de audio está corrupto o no corresponde a un formato de audio válido.',
      }
    }
    if (!SUPPORTED_BASE_MIMES.has(sniffed.mimeType)) {
      return {
        ok: false,
        code: 'unsupported_format',
        message:
          'El formato real del audio no es compatible con la transcripción. Envía una nota de voz OGG/Opus, MP3 o M4A.',
      }
    }
    const declaredFamily = MIME_FAMILY[declaredMime] ?? declaredMime
    const sniffedFamily = MIME_FAMILY[sniffed.mimeType] ?? sniffed.mimeType
    if (declaredFamily !== sniffedFamily) {
      return {
        ok: false,
        code: 'mime_mismatch',
        message:
          'El contenido real del archivo no coincide con el formato de audio declarado. Intenta grabar la nota de nuevo.',
      }
    }
    codec = sniffed.codec
    if (effectiveDuration === null && sniffed.estimatedDurationSec !== null) {
      effectiveDuration = sniffed.estimatedDurationSec
    }
  }

  if (typeof effectiveDuration === 'number') {
    if (effectiveDuration < MIN_AUDIO_DURATION_SEC) {
      return { ok: false, code: 'missing_audio', message: 'La nota de voz es demasiado corta para transcribir.' }
    }
    if (effectiveDuration > MAX_AUDIO_DURATION_SEC) {
      return {
        ok: false,
        code: 'audio_too_long',
        message: 'La nota de voz supera la duración máxima permitida (5 minutos). Envíala en partes más cortas.',
      }
    }
  }

  return { ok: true, mimeType: declaredMime, codec, durationSec: effectiveDuration }
}

export function cleanTranscript(text: string): string {
  const cleaned = text
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^transcripci[oó]n:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (
    !cleaned ||
    /^(no se (entiende|escucha|detecta|distingue).*(nada|audio|voz)?|silencio|\(vac[ií]o\)|vac[ií]o|\[inaudible\]|n\/a|none)$/i.test(
      cleaned
    )
  ) {
    return ''
  }
  return cleaned
}

export type TranscribeAudioResult =
  | { ok: true; transcript: string; model: string }
  | {
      ok: false
      status: number
      code: 'missing_key' | 'timeout' | 'provider_unavailable' | 'provider_error'
      retryable?: boolean
      message: string
    }

export async function transcribeAudioBase64WithGemini(input: {
  audioBase64: string
  mimeType: string
  apiKey: string
  preferredModel?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<TranscribeAudioResult> {
  if (!input.apiKey) {
    return {
      ok: false,
      status: 500,
      code: 'missing_key',
      message: 'Falta GEMINI_API_KEY para transcribir el audio.',
    }
  }

  const fetchFn = input.fetchImpl ?? fetch
  const candidates = geminiModelCandidates(input.preferredModel || DEFAULT_TRANSCRIBE_MODEL)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 35_000)

  const geminiBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: normalizeAudioMime(input.mimeType) || 'audio/ogg', data: input.audioBase64 } },
          {
            text: 'Transcribe este audio en espanol. Devuelve solo las palabras dichas, sin comillas ni comentarios. Si no hay habla, responde exactamente nada (cadena vacia).',
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 800,
      temperature: 0,
    },
  }

  try {
    let response: Response | undefined
    let usedModel = candidates[0] ?? DEFAULT_TRANSCRIBE_MODEL
    let lastStatus = 502
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i]!
      usedModel = model
      const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`
      response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(geminiBody),
      })
      if (response.ok) break
      lastStatus = response.status
      const errorText = await response.text()
      console.error('audio-transcribe Gemini', model, response.status, errorText.slice(0, 400))
      if (!isGeminiCapacityStatus(response.status) || i === candidates.length - 1) {
        if (response.status === 503 || response.status === 429) {
          return {
            ok: false,
            status: response.status,
            code: 'provider_unavailable',
            retryable: true,
            message: 'El servicio de transcripción está saturado temporalmente (503). Intenta de nuevo o escribe en texto.',
          }
        }
        return {
          ok: false,
          status: 502,
          code: 'provider_error',
          message: 'No se pudo transcribir el audio.',
        }
      }
    }

    if (!response?.ok) {
      return {
        ok: false,
        status: lastStatus,
        code: isGeminiCapacityStatus(lastStatus) ? 'provider_unavailable' : 'provider_error',
        retryable: isGeminiCapacityStatus(lastStatus),
        message: 'No se pudo transcribir el audio.',
      }
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const transcript = cleanTranscript(
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter(Boolean)
        .join(' ') ?? ''
    )

    return { ok: true, transcript, model: usedModel }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        status: 504,
        code: 'timeout',
        retryable: true,
        message: 'La transcripción tardó demasiado.',
      }
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export type ServerSttProviderId = 'whisper_http' | 'gemini_audio' | 'unavailable'

export type ServerSttResolution = {
  provider: ServerSttProviderId
  endpointUrl: string | null
  model: string | null
  zeroCostSafe: boolean
  reason: string
}

/**
 * Resuelve el proveedor de transcripción server-side para notas de voz WhatsApp (OGG/Opus).
 * Nunca utiliza SpeechRecognition del navegador (no existe en serverless).
 * Soporta:
 * 1) Endpoint HTTP Whisper-compatible (p. ej. servicio local faster-whisper en loopback o
 *    API OpenAI/Groq compatible autorizada vía WHATSAPP_STT_URL).
 * 2) Gemini multimodal de audio nativo (OGG/Opus), sujeto a `resolveLlmProvider`.
 */
export function resolveServerSttProvider(
  env: Record<string, string | undefined> = process.env
): ServerSttResolution {
  const zeroCostOnly = env.AI_ZERO_COST_ONLY === '1' || env.GEMINI_FREE_TIER_ONLY === '1'

  const loopbackStt = parseLoopbackAdapterUrl(env.LOCAL_STT_URL)
  if (loopbackStt) {
    return {
      provider: 'whisper_http',
      endpointUrl: loopbackStt,
      model: (env.WHATSAPP_STT_MODEL || 'whisper-large-v3-turbo').trim(),
      zeroCostSafe: true,
      reason: 'Adaptador Whisper HTTP local en loopback (dev/demo $0 USD).',
    }
  }

  const remoteSttUrl = (env.WHATSAPP_STT_URL ?? '').trim()
  const remoteSttKey = (env.WHATSAPP_STT_API_KEY ?? '').trim()
  if (remoteSttUrl && remoteSttKey) {
    const freeTierConfirmed = env.WHATSAPP_STT_FREE_TIER_CONFIRMED === '1'
    if (zeroCostOnly && !freeTierConfirmed) {
      return {
        provider: 'unavailable',
        endpointUrl: null,
        model: null,
        zeroCostSafe: true,
        reason:
          'WHATSAPP_STT_URL bloqueado en modo $0 USD hasta acreditar cuota gratuita (WHATSAPP_STT_FREE_TIER_CONFIRMED=1).',
      }
    }
    return {
      provider: 'whisper_http',
      endpointUrl: remoteSttUrl,
      model: (env.WHATSAPP_STT_MODEL || 'whisper-large-v3-turbo').trim(),
      zeroCostSafe: freeTierConfirmed,
      reason: 'Endpoint Whisper HTTP server-side autorizado (soporte nativo OGG/Opus).',
    }
  }

  const llm = resolveLlmProvider(env)
  if (llm.canCallExternalApi && llm.model) {
    return {
      provider: 'gemini_audio',
      endpointUrl: GEMINI_API_BASE_URL,
      model: llm.model,
      zeroCostSafe: llm.guaranteedZeroCost,
      reason: `Gemini audio nativo (${llm.mode}).`,
    }
  }

  return {
    provider: 'unavailable',
    endpointUrl: null,
    model: null,
    zeroCostSafe: true,
    reason:
      llm.blockedReason ||
      'Sin proveedor STT server-side autorizado. Configura WHATSAPP_STT_URL o GEMINI_API_KEY autorizada.',
  }
}

function extensionForAudioMime(mimeType: string): string {
  const base = normalizeAudioMime(mimeType)
  if (base === 'audio/ogg') return 'ogg'
  if (base === 'audio/mpeg' || base === 'audio/mp3') return 'mp3'
  if (base === 'audio/mp4') return 'm4a'
  if (base === 'audio/wav' || base === 'audio/x-wav') return 'wav'
  if (base === 'audio/webm') return 'webm'
  if (base === 'audio/flac') return 'flac'
  return 'ogg'
}

/**
 * Transcribe audio OGG/Opus en servidor mediante endpoint Whisper HTTP (multipart/form-data).
 * Compatible con faster-whisper local, Groq Whisper o OpenAI Whisper sin dependencias pesadas.
 */
export async function transcribeAudioBase64WithWhisperHttp(input: {
  audioBase64: string
  mimeType: string
  endpointUrl: string
  apiKey?: string
  model?: string
  language?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<TranscribeAudioResult> {
  const fetchFn = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 25_000)

  try {
    const normalizedMime = normalizeAudioMime(input.mimeType) || 'audio/ogg'
    const ext = extensionForAudioMime(normalizedMime)
    const rawBytes = Buffer.from(input.audioBase64, 'base64')
    const form = new FormData()
    form.append('file', new Blob([rawBytes], { type: normalizedMime }), `voice-note.${ext}`)
    form.append('model', input.model || 'whisper-large-v3-turbo')
    form.append('language', input.language || 'es')
    form.append('response_format', 'json')

    const headers: Record<string, string> = {}
    if (input.apiKey?.trim()) {
      headers.Authorization = `Bearer ${input.apiKey.trim()}`
    }

    const response = await fetchFn(input.endpointUrl, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 503 || response.status === 429) {
        return {
          ok: false,
          status: response.status,
          code: 'provider_unavailable',
          retryable: true,
          message: 'El servicio de transcripción está saturado temporalmente. Escríbeme en texto o intenta de nuevo.',
        }
      }
      return {
        ok: false,
        status: response.status,
        code: 'provider_error',
        message: 'No se pudo transcribir el audio en el servidor STT.',
      }
    }

    const data = (await response.json()) as { text?: string; transcript?: string }
    const transcript = cleanTranscript(data.text ?? data.transcript ?? '')
    return { ok: true, transcript, model: input.model || 'whisper-http' }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        status: 504,
        code: 'timeout',
        retryable: true,
        message: 'La transcripción tardó demasiado.',
      }
    }
    return {
      ok: false,
      status: 502,
      code: 'provider_error',
      message: 'Error al conectar con el servidor de transcripción.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Punto de entrada server-side unificado para notas de voz WhatsApp.
 */
export async function transcribeAudioServerSide(input: {
  audioBase64: string
  mimeType: string
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
}): Promise<TranscribeAudioResult> {
  const env = input.env ?? process.env
  const resolved = resolveServerSttProvider(env)

  if (resolved.provider === 'whisper_http' && resolved.endpointUrl) {
    return transcribeAudioBase64WithWhisperHttp({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
      endpointUrl: resolved.endpointUrl,
      apiKey: env.WHATSAPP_STT_API_KEY,
      model: resolved.model ?? undefined,
      fetchImpl: input.fetchImpl,
    })
  }

  if (resolved.provider === 'gemini_audio') {
    return transcribeAudioBase64WithGemini({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
      apiKey: env.GEMINI_API_KEY ?? '',
      preferredModel: resolved.model ?? DEFAULT_TRANSCRIBE_MODEL,
      fetchImpl: input.fetchImpl,
    })
  }

  return {
    ok: false,
    status: 503,
    code: 'provider_unavailable',
    retryable: false,
    message: resolved.reason,
  }
}
