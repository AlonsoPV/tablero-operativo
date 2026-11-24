/**
 * Harness QA Multicanal R0 (WhatsApp + Web + R1/R3 + R2 definitivo).
 *
 * Reglas:
 * - Transporte 100% simulado en ejecuciones locales (cero mensajes reales, cero llamadas pagadas).
 * - Fixtures sintéticos aislados sin datos personales.
 * - Incluye guardia fail-closed (`resolveQaWhatsAppSingleNumberTarget`) para preparar una
 *   prueba real posterior con UN solo número de WhatsApp autorizado exclusivamente para QA.
 */

export const R0_MULTICHANNEL_SCENARIOS = [
  { id: 'R0-MC-01', name: 'Consulta por texto' },
  { id: 'R0-MC-02', name: 'Consulta por nota de voz' },
  { id: 'R0-MC-03', name: 'Seguimiento de conversación iniciada en web' },
  { id: 'R0-MC-04', name: 'Recuperación documental' },
  { id: 'R0-MC-05', name: 'Propuesta R2 (individual, múltiple, edición, cancelación y R2 OFF)' },
  { id: 'R0-MC-06', name: 'Aprobación y ejecución controlada R2' },
  { id: 'R0-MC-07', name: 'Fallos del proveedor (WhatsApp y Gemini 503)' },
  { id: 'R0-MC-08', name: 'Recordatorios en dry-run' },
  { id: 'R0-MC-09', name: 'Aislamiento de usuarios' },
  { id: 'R0-MC-10', name: 'Eventos duplicados y fuera de orden' },
  { id: 'R0-MC-11', name: 'Reconciliación de efectos inciertos' },
]

/**
 * Transporte simulado aislado para QA multicanal local:
 * registra mensajes de texto y audio sin realizar jamás envíos externos.
 */
export function createSimulatedWhatsAppTransport() {
  const outbound = []
  let seq = 0

  return {
    outbound,
    async sendText({ to, body, metadata = {} }) {
      seq += 1
      const record = {
        id: `sim-wamid-text-${seq}`,
        kind: 'text',
        to,
        body,
        metadata,
        simulated: true,
        sentAt: new Date().toISOString(),
      }
      outbound.push(record)
      return { delivered: true, messageId: record.id }
    },
    async sendAudio({ to, mimeType, byteLength, failDelivery = false }) {
      seq += 1
      if (failDelivery) {
        return { delivered: false, messageId: null }
      }
      const record = {
        id: `sim-wamid-audio-${seq}`,
        kind: 'audio',
        to,
        mimeType,
        byteLength,
        simulated: true,
        sentAt: new Date().toISOString(),
      }
      outbound.push(record)
      return { delivered: true, messageId: record.id }
    },
    reset() {
      outbound.length = 0
      seq = 0
    },
  }
}

/**
 * Guardia fail-closed para una futura prueba real con UN único número de WhatsApp autorizado para QA.
 * En ejecución local sin autorización explícita, siempre bloquea el envío real.
 */
export function resolveQaWhatsAppSingleNumberTarget(env = {}, argv = []) {
  const hasExecuteFlag = argv.includes('--execute-qa-whatsapp')
  const authToken = String(env.QA_WHATSAPP_AUTH || '').trim()
  const allowedRaw = String(env.QA_WHATSAPP_ALLOWED_NUMBER || '').trim()
  const digits = allowedRaw.replace(/\D/g, '')

  if (!hasExecuteFlag || authToken !== 'AUTH-R0-WHATSAPP-QA') {
    return {
      mode: 'simulated_only',
      liveSendAllowed: false,
      allowedWaId: null,
      reason: 'missing_explicit_qa_authorization',
    }
  }
  if (!/^\d{10,15}$/.test(digits)) {
    return {
      mode: 'blocked',
      liveSendAllowed: false,
      allowedWaId: null,
      reason: 'invalid_qa_number_format',
    }
  }
  if (allowedRaw.includes(',') || allowedRaw.includes(';') || allowedRaw.includes(' ')) {
    return {
      mode: 'blocked',
      liveSendAllowed: false,
      allowedWaId: null,
      reason: 'only_single_qa_number_allowed',
    }
  }
  return {
    mode: 'single_qa_number_ready',
    liveSendAllowed: true,
    allowedWaId: digits,
    reason: 'authorized_single_qa_number',
  }
}

export function assertRecipientAllowedForQa(targetWaId, qaTarget) {
  const clean = String(targetWaId || '').replace(/\D/g, '')
  if (!qaTarget?.liveSendAllowed || !qaTarget.allowedWaId) {
    return { allowed: false, reason: 'live_send_not_authorized' }
  }
  if (clean !== qaTarget.allowedWaId) {
    return { allowed: false, reason: 'recipient_not_in_single_qa_allowlist' }
  }
  return { allowed: true, reason: 'matched_authorized_qa_number' }
}

/**
 * Ejecuta los 11 escenarios multicanal R0 sobre adaptadores/fixtures inyectados
 * y produce un resumen auditable sin efectos externos.
 */
export async function runR0MultichannelQaSuite({ scenarios }) {
  const results = []
  let passed = 0
  let failed = 0

  for (const spec of R0_MULTICHANNEL_SCENARIOS) {
    const runner = scenarios[spec.id]
    if (typeof runner !== 'function') {
      failed += 1
      results.push({
        id: spec.id,
        name: spec.name,
        status: 'FAIL',
        detail: 'Missing scenario runner',
      })
      continue
    }
    try {
      const detail = await runner()
      passed += 1
      results.push({
        id: spec.id,
        name: spec.name,
        status: 'PASS',
        detail: detail ?? {},
      })
    } catch (error) {
      failed += 1
      results.push({
        id: spec.id,
        name: spec.name,
        status: 'FAIL',
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    ok: failed === 0 && passed === R0_MULTICHANNEL_SCENARIOS.length,
    total: R0_MULTICHANNEL_SCENARIOS.length,
    passed,
    failed,
    results,
  }
}
