/**
 * Pipeline endurecido de notas de voz entrantes y respuestas de audio para WhatsApp.
 *
 * Controles de seguridad y calidad:
 * 1. Identidad vinculada, usuario activo y autorización (`can_use_ai_whatsapp_for_usuario`).
 * 2. URL de descarga Meta estrictamente en allowlist HTTPS (anti-SSRF, sin fuga de tokens por redirect).
 * 3. Detección de descarga incompleta (Content-Length / file_size vs bytes descargados).
 * 4. Validación de tamaño, duración y magic bytes reales frente al MIME declarado (OGG/Opus, MP3, M4A, etc.).
 * 5. Transcripción con Gemini (manejo explícito de 503 y transcripción vacía) y limpieza de memoria en `finally`.
 * 6. Análisis de seguridad de transcripción: múltiples instrucciones, referencias/fechas/nombres ambiguos,
 *    continuidad texto↔audio y bloqueo absoluto de ejecución automática por voz ante transcripción incierta.
 * 7. Respuesta por modalidad (`text` | `audio` | `smart`) con fallback a texto y verdad en `audioGenerated` vs `audioSent`.
 */
import {
  MAX_AUDIO_BYTES,
  normalizeAudioMime,
  transcribeAudioBase64WithGemini,
  validateAudioPayload,
  type TranscribeAudioResult,
} from './audioTranscription.js'
import {
  normalizeReplyAudioMode,
  prepareWhatsAppAudioReply,
  type AudioReplyDeliverer,
  type AudioReplySynthesizer,
  type WhatsAppAudioDeliveryResult,
  type WhatsAppAudioReplyPreference,
  type WhatsAppReplyAudioMode,
  type WhatsAppReplyContentMeta,
} from './whatsappAudioReply.js'

export type WhatsAppAudioAttachment = {
  mediaId: string
  mimeType?: string | null
  voice?: boolean
  declaredByteLength?: number | null
  durationSeconds?: number | null
}

export type WhatsAppVoiceActor = {
  waId: string
  usuarioId: string | null
  active: boolean
  aiAuthorized: boolean
  /** Preferencia explícita: 'text' | 'audio' | 'smart' (retrocompatible con preferVoiceReply). */
  replyAudioMode?: WhatsAppReplyAudioMode | string
  preferVoiceReply?: boolean
}

export type FetchedMetaMedia = {
  bytes: Uint8Array
  mimeType: string
  fileSize: number
  expectedByteLength?: number | null
}

export type VoiceTranscriptSafetyReport = {
  multipleInstructions: boolean
  instructionSegments: string[]
  ambiguities: Array<'ambiguous_person' | 'ambiguous_date' | 'ambiguous_reference'>
  uncertainTranscript: boolean
  writeOrApprovalIntent: boolean
  /** Nunca se permite ejecutar una escritura automáticamente desde voz; exige confirmación explícita. */
  executionBlockedFromVoice: boolean
  clarificationPrompt: string | null
}

export type VoiceConversationContext = {
  recentTurns?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string; modality?: 'text' | 'audio' }>
  activeSubject?: string | null
}

export type WhatsAppVoiceDeps = {
  fetchMetaMedia?: (mediaId: string) => Promise<FetchedMetaMedia>
  transcribe?: (input: { audioBase64: string; mimeType: string }) => Promise<TranscribeAudioResult>
  runAssistant: (input: {
    transcript: string
    safety: VoiceTranscriptSafetyReport
    context?: VoiceConversationContext
  }) => Promise<{ text: string; contentMeta?: WhatsAppReplyContentMeta }>
  synthesizeAudio?: AudioReplySynthesizer
  deliverAudio?: AudioReplyDeliverer
  voiceReplyEnabled?: boolean
  conversationContext?: VoiceConversationContext
}

export type WhatsAppVoiceNoteResult =
  | {
      ok: true
      transcript: string
      replyText: string
      replyMode: 'text' | 'text_and_audio'
      audioDelivery: WhatsAppAudioDeliveryResult
      safety: VoiceTranscriptSafetyReport
      optionalAudio: { mimeType: 'audio/mpeg' | 'audio/ogg'; byteLength: number } | null
      audioRetained: false
    }
  | {
      ok: false
      code:
        | 'unlinked_or_inactive'
        | 'not_authorized'
        | 'missing_media_id'
        | 'unsupported_format'
        | 'mime_mismatch'
        | 'corrupt_audio'
        | 'audio_too_large'
        | 'audio_too_long'
        | 'media_url_rejected'
        | 'incomplete_download'
        | 'media_fetch_failed'
        | 'provider_unavailable'
        | 'transcription_failed'
        | 'empty_transcript'
      replyText: string
      audioRetained: false
    }

const DEFAULT_GRAPH_VERSION = 'v20.0'
const META_MEDIA_TIMEOUT_MS = 10_000

const ALLOWED_META_HOST_SUFFIXES = [
  'fbsbx.com',
  'fbcdn.net',
  'whatsapp.net',
  'graph.facebook.com',
] as const

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/

/**
 * Valida que una URL de descarga de media pertenezca exclusivamente a hosts HTTPS autorizados
 * de Meta/WhatsApp (evita SSRF, IPs privadas/metadata y exposición del Bearer token).
 */
export function validateMetaMediaDownloadUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'non_https_url' }
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'credentials_in_url' }
  }
  if (parsed.port && parsed.port !== '443') {
    return { ok: false, reason: 'non_standard_port' }
  }
  const host = parsed.hostname.toLowerCase()
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    IPV4_RE.test(host) ||
    host.includes(':')
  ) {
    return { ok: false, reason: 'disallowed_host' }
  }
  const allowed = ALLOWED_META_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  )
  if (!allowed) {
    return { ok: false, reason: 'host_not_allowlisted' }
  }
  return { ok: true, url: parsed }
}

/**
 * Descarga efímera de media de Meta Graph (solo en memoria, anti-SSRF, anti-fuga de tokens en redirects,
 * y verificación de descarga completa).
 */
export async function fetchWhatsAppMediaFromGraph(input: {
  mediaId: string
  accessToken: string
  graphVersion?: string
  fetchImpl?: typeof fetch
}): Promise<FetchedMetaMedia> {
  if (!/^[A-Za-z0-9._-]{4,128}$/.test(input.mediaId)) {
    throw new Error('invalid_media_id')
  }
  const fetchFn = input.fetchImpl ?? fetch
  const version = input.graphVersion || DEFAULT_GRAPH_VERSION
  const metaUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(input.mediaId)}`

  const metaRes = await fetchFn(metaUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${input.accessToken}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(META_MEDIA_TIMEOUT_MS),
  })
  if (metaRes.status >= 300 && metaRes.status < 400) {
    throw new Error('media_url_rejected')
  }
  if (!metaRes.ok) {
    throw new Error(`meta_media_lookup_http_${metaRes.status}`)
  }
  const metaJson = (await metaRes.json()) as {
    url?: string
    mime_type?: string
    file_size?: number
  }
  if (!metaJson.url) {
    throw new Error('meta_media_missing_url')
  }
  const urlCheck = validateMetaMediaDownloadUrl(metaJson.url)
  if (!urlCheck.ok) {
    throw new Error('media_url_rejected')
  }
  if (typeof metaJson.file_size === 'number' && metaJson.file_size > MAX_AUDIO_BYTES) {
    throw new Error('audio_too_large')
  }

  let currentUrl = urlCheck.url.toString()
  let binRes = await fetchFn(currentUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${input.accessToken}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(META_MEDIA_TIMEOUT_MS),
  })

  // Máximo 1 salto de redirección y sólo si el destino también pasa la allowlist HTTPS de Meta.
  // Jamás se reenvía el Authorization Bearer a un host distinto del origen autorizado.
  if (binRes.status >= 300 && binRes.status < 400) {
    const location = binRes.headers.get('location') ?? ''
    const nextCheck = validateMetaMediaDownloadUrl(location)
    if (!nextCheck.ok) {
      throw new Error('media_url_rejected')
    }
    const sameOrigin = nextCheck.url.origin === urlCheck.url.origin
    currentUrl = nextCheck.url.toString()
    binRes = await fetchFn(currentUrl, {
      method: 'GET',
      headers: sameOrigin ? { Authorization: `Bearer ${input.accessToken}` } : {},
      redirect: 'manual',
      signal: AbortSignal.timeout(META_MEDIA_TIMEOUT_MS),
    })
    if (binRes.status >= 300 && binRes.status < 400) {
      throw new Error('media_url_rejected')
    }
  }

  if (!binRes.ok) {
    throw new Error(`meta_media_download_http_${binRes.status}`)
  }

  const bytes = new Uint8Array(await binRes.arrayBuffer())
  const contentLengthRaw = binRes.headers.get('content-length')
  const headerLength = contentLengthRaw && /^\d+$/.test(contentLengthRaw) ? Number(contentLengthRaw) : null
  const expectedByteLength =
    typeof metaJson.file_size === 'number' && metaJson.file_size > 0
      ? metaJson.file_size
      : headerLength

  if (expectedByteLength && bytes.byteLength < expectedByteLength) {
    bytes.fill(0)
    throw new Error('incomplete_download')
  }

  const mimeType = normalizeAudioMime(metaJson.mime_type || binRes.headers.get('content-type'))
  return { bytes, mimeType, fileSize: bytes.byteLength, expectedByteLength }
}

const WRITE_OR_APPROVAL_RE =
  /\b(crea|crear|marca|marcar|cierra|cerrar|completa|completar|actualiza|actualizar|cambia|cambiar|elimina|eliminar|bloquea|bloquear|verifica|verificar|env[ií]a|enviar|confirma|confirmar|aprueba|aprobar|s[ií]\s+hazlo)\b/i

const UNCERTAIN_MARKERS_RE = /(\[inaudible\]|\?\?\?|\.\.\.|no estoy seguro|creo que era|o algo as[ií]|tal vez)/i
const AMBIGUOUS_REF_RE = /\b(eso|esa tarea|esa acci[oó]n|la otra|aquella|lo de ayer|lo que vimos|ese pendiente)\b/i
const AMBIGUOUS_DATE_RE = /\b(el viernes|el lunes|la pr[oó]xima semana|en unos d[ií]as|luego|despu[eé]s|pronto)\b/i
const AMBIGUOUS_PERSON_RE = /\b(a\s+(?:juan|mar[ií]a|carlos|ana|pedro|luis|jos[eé])(?:\s|$|[,.])|p[aá]saselo\s+a\s+[a-záéíóúñ]+|con\s+[eé]l|con\s+ella)\b/i

/**
 * Analiza una transcripción de voz para detectar:
 * - Múltiples instrucciones en un mismo audio.
 * - Nombres, fechas o referencias ambiguas.
 * - Transcripción incierta + intención de escritura/aprobación (jamás se ejecuta automáticamente desde voz).
 */
export function analyzeVoiceTranscript(
  transcript: string,
  context?: VoiceConversationContext
): VoiceTranscriptSafetyReport {
  const clean = transcript.trim()
  const segments = clean
    .split(/\s*(?:\.\s+|\;\s+|\by\s+tambi[eé]n\b|\badem[aá]s\b|\by\s+luego\b|\by\s+despu[eé]s\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
  const multipleInstructions = segments.length >= 2

  const ambiguities: VoiceTranscriptSafetyReport['ambiguities'] = []
  const hasContextAnchor = Boolean(context?.activeSubject || (context?.recentTurns && context.recentTurns.length > 0))

  if (AMBIGUOUS_REF_RE.test(clean) && !hasContextAnchor) {
    ambiguities.push('ambiguous_reference')
  }
  if (AMBIGUOUS_DATE_RE.test(clean)) {
    ambiguities.push('ambiguous_date')
  }
  if (AMBIGUOUS_PERSON_RE.test(clean)) {
    ambiguities.push('ambiguous_person')
  }

  const uncertainTranscript =
    UNCERTAIN_MARKERS_RE.test(clean) || clean.length < 6 || ambiguities.length > 0
  const writeOrApprovalIntent = WRITE_OR_APPROVAL_RE.test(clean)
  const executionBlockedFromVoice = writeOrApprovalIntent

  let clarificationPrompt: string | null = null
  if (writeOrApprovalIntent && (uncertainTranscript || multipleInstructions)) {
    const reasons: string[] = []
    if (multipleInstructions) reasons.push('varias instrucciones en el mismo audio')
    if (ambiguities.includes('ambiguous_reference')) reasons.push('referencia ambigua a la acción')
    if (ambiguities.includes('ambiguous_person')) reasons.push('nombre sin identificar de forma única')
    if (ambiguities.includes('ambiguous_date')) reasons.push('fecha relativa sin día exacto')
    if (UNCERTAIN_MARKERS_RE.test(clean)) reasons.push('transcripción incierta')
    clarificationPrompt =
      `Entendí tu nota de voz, pero detecté ${reasons.join(', ')}. ` +
      'No se aplicó ningún cambio en el tablero. Confirma los datos exactos (acción, responsable y fecha YYYY-MM-DD) o aprueba por código en texto.'
  }

  return {
    multipleInstructions,
    instructionSegments: segments.length > 0 ? segments : [clean],
    ambiguities,
    uncertainTranscript,
    writeOrApprovalIntent,
    executionBlockedFromVoice,
    clarificationPrompt,
  }
}

export async function processWhatsAppVoiceNote(
  actor: WhatsAppVoiceActor,
  attachment: WhatsAppAudioAttachment,
  deps: WhatsAppVoiceDeps
): Promise<WhatsAppVoiceNoteResult> {
  // 1. Validar identidad vinculada, estado activo y autorización explícita.
  if (!actor.usuarioId || !actor.active) {
    return {
      ok: false,
      code: 'unlinked_or_inactive',
      replyText: 'Tu cuenta no está vinculada o activa en Scrumban para usar notas de voz.',
      audioRetained: false,
    }
  }
  if (!actor.aiAuthorized) {
    return {
      ok: false,
      code: 'not_authorized',
      replyText: 'Tu cuenta no tiene acceso autorizado al asistente por WhatsApp.',
      audioRetained: false,
    }
  }
  if (!attachment.mediaId?.trim()) {
    return {
      ok: false,
      code: 'missing_media_id',
      replyText: 'No pude recibir el archivo de audio. Intenta enviarlo de nuevo o escribe tu consulta.',
      audioRetained: false,
    }
  }

  // 2. Validar formato/tamaño/duración preliminar (si Meta ya envió metadatos).
  if (
    attachment.mimeType ||
    typeof attachment.declaredByteLength === 'number' ||
    typeof attachment.durationSeconds === 'number'
  ) {
    const precheck = validateAudioPayload({
      mimeType: attachment.mimeType || 'audio/ogg',
      byteLength: attachment.declaredByteLength ?? undefined,
      durationSeconds: attachment.durationSeconds ?? undefined,
    })
    if (!precheck.ok) {
      return {
        ok: false,
        code:
          precheck.code === 'audio_too_large'
            ? 'audio_too_large'
            : precheck.code === 'audio_too_long'
              ? 'audio_too_long'
              : precheck.code === 'missing_audio'
                ? 'corrupt_audio'
                : 'unsupported_format',
        replyText: precheck.message,
        audioRetained: false,
      }
    }
  }

  // 3. Descarga autorizada y efímera (se descarta en finally, jamás se guarda en disco/Storage).
  let media: FetchedMetaMedia | null = null
  try {
    if (!deps.fetchMetaMedia) {
      throw new Error('missing_media_fetcher')
    }
    media = await deps.fetchMetaMedia(attachment.mediaId.trim())
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg === 'audio_too_large') {
      return {
        ok: false,
        code: 'audio_too_large',
        replyText: 'La nota de voz supera el límite permitido (4.5 MB). Envíala en partes más cortas.',
        audioRetained: false,
      }
    }
    if (msg === 'media_url_rejected') {
      return {
        ok: false,
        code: 'media_url_rejected',
        replyText: 'La fuente del archivo de audio no está autorizada. Intenta grabar la nota de nuevo.',
        audioRetained: false,
      }
    }
    if (msg === 'incomplete_download') {
      return {
        ok: false,
        code: 'incomplete_download',
        replyText: 'La descarga de tu nota de voz quedó incompleta. Intenta enviarla de nuevo o escribe tu consulta.',
        audioRetained: false,
      }
    }
    return {
      ok: false,
      code: 'media_fetch_failed',
      replyText: 'No pude descargar tu nota de voz en este momento. Intenta de nuevo o escríbeme tu consulta.',
      audioRetained: false,
    }
  }

  let transcript = ''
  try {
    if (media.expectedByteLength && media.bytes.byteLength < media.expectedByteLength) {
      return {
        ok: false,
        code: 'incomplete_download',
        replyText: 'La descarga de tu nota de voz quedó incompleta. Intenta enviarla de nuevo o escribe tu consulta.',
        audioRetained: false,
      }
    }

    const validation = validateAudioPayload({
      mimeType: media.mimeType || attachment.mimeType,
      byteLength: media.fileSize,
      durationSeconds: attachment.durationSeconds ?? undefined,
      bytes: media.bytes,
    })
    if (!validation.ok) {
      return {
        ok: false,
        code:
          validation.code === 'audio_too_large'
            ? 'audio_too_large'
            : validation.code === 'audio_too_long'
              ? 'audio_too_long'
              : validation.code === 'mime_mismatch'
                ? 'mime_mismatch'
                : validation.code === 'corrupt_audio' || validation.code === 'missing_audio'
                  ? 'corrupt_audio'
                  : 'unsupported_format',
        replyText: validation.message,
        audioRetained: false,
      }
    }

    const audioBase64 = Buffer.from(media.bytes).toString('base64')

    // 4. Transcribir con contrato verificado de Gemini (con manejo explícito de 503).
    const transcribed = deps.transcribe
      ? await deps.transcribe({ audioBase64, mimeType: validation.mimeType })
      : await transcribeAudioBase64WithGemini({
          audioBase64,
          mimeType: validation.mimeType,
          apiKey: process.env.GEMINI_API_KEY ?? '',
        })

    if (!transcribed.ok) {
      if (transcribed.code === 'provider_unavailable' || transcribed.status === 503) {
        return {
          ok: false,
          code: 'provider_unavailable',
          replyText:
            'El servicio de transcripción está saturado temporalmente. Intenta de nuevo en unos minutos o escríbeme en texto.',
          audioRetained: false,
        }
      }
      return {
        ok: false,
        code: 'transcription_failed',
        replyText: 'No pude transcribir tu nota de voz ahora. Por favor escríbeme tu consulta en texto.',
        audioRetained: false,
      }
    }
    transcript = transcribed.transcript.trim()
  } finally {
    // Limpiar el buffer en memoria inmediatamente: cero conservación innecesaria de audio.
    if (media?.bytes) {
      media.bytes.fill(0)
    }
    media = null
  }

  if (!transcript) {
    return {
      ok: false,
      code: 'empty_transcript',
      replyText: 'No alcancé a escuchar voz clara en el audio. ¿Puedes repetirlo o escribirme tu consulta?',
      audioRetained: false,
    }
  }

  // 5. Analizar seguridad de transcripción: bloquear ejecución automática ante incertidumbre/ambigüedad.
  const safety = analyzeVoiceTranscript(transcript, deps.conversationContext)
  let replyText = ''
  let contentMeta: WhatsAppReplyContentMeta = {}

  if (safety.clarificationPrompt) {
    // Protección estricta: nunca ejecutar escritura ni invocar mutaciones ante transcripción incierta/ambigua.
    replyText = safety.clarificationPrompt
    contentMeta = { hasProposal: true }
  } else {
    const assistant = await deps.runAssistant({
      transcript,
      safety,
      context: deps.conversationContext,
    })
    replyText = assistant.text.trim()
    contentMeta = assistant.contentMeta ?? {}
    if (safety.writeOrApprovalIntent) {
      contentMeta.hasProposal = true
    }
  }

  // 6. Modalidad de respuesta (`text` | `audio` | `smart`), fallback limpio a texto, sin mentir sobre entrega.
  const resolvedMode: WhatsAppReplyAudioMode = actor.replyAudioMode
    ? normalizeReplyAudioMode(actor.replyAudioMode)
    : actor.preferVoiceReply
      ? 'audio'
      : 'text'
  const preference: WhatsAppAudioReplyPreference = {
    mode: resolvedMode,
    ttsEnabled: deps.voiceReplyEnabled === true,
    fallbackToText: true,
  }
  const audioDelivery = await prepareWhatsAppAudioReply({
    replyText,
    preference,
    contentMeta,
    synthesize: deps.synthesizeAudio,
    deliverAudio: deps.deliverAudio,
  })

  return {
    ok: true,
    transcript,
    replyText: audioDelivery.text,
    replyMode: audioDelivery.audioSent ? 'text_and_audio' : 'text',
    audioDelivery,
    safety,
    optionalAudio: audioDelivery.audioGenerated ? audioDelivery.audioMeta : null,
    audioRetained: false,
  }
}
