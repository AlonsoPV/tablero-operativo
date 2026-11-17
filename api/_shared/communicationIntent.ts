/**
 * Clasificador offline de intenciones de comunicación (WhatsApp/correo).
 * Contrato de comportamiento + fuente de ejemplos para el prompt Retell.
 * No se invoca en el hot path de la llamada.
 */

export type CommunicationIntentCategory =
  | 'explicit'
  | 'contextual'
  | 'mention'
  | 'cancel_or_modify'

export type CommunicationIntentAction = 'prepare' | 'update' | 'cancel' | 'none'

export type CommunicationIntentChannel =
  | 'whatsapp'
  | 'email'
  | 'both'
  | 'unspecified'
  | 'none'

export type CommunicationIntentResult = {
  category: CommunicationIntentCategory
  shouldQueue: boolean
  action: CommunicationIntentAction
  channel: CommunicationIntentChannel
  softConfirm: boolean
  askChannel: boolean
  reason: string
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectChannel(t: string): CommunicationIntentChannel {
  const hasWa = /\b(whats?\s*app|wasap|whatsapp|\bwa\b)\b/.test(t) || /\bmensaje\b/.test(t) && /\bwhats/.test(t)
  const hasEmail =
    /\b(correo|email|e-?mail|mail)\b/.test(t) || /\bmail(ear|ealo|eale)?\b/.test(t)
  const bothHint =
    /\b(ambos|los dos|whats?\s*app y correo|correo y whats?\s*app)\b/.test(t) ||
    (hasWa && hasEmail)
  if (bothHint && hasWa && hasEmail) return 'both'
  if (hasWa && !hasEmail) return 'whatsapp'
  if (hasEmail && !hasWa) return 'email'
  if (hasWa || hasEmail) return hasWa ? 'whatsapp' : 'email'
  // "mensaje" / "escríbele" sin canal → unspecified
  if (/\b(mensaje|escribele|dejale|avisale|mandale|enviale)\b/.test(t)) return 'unspecified'
  return 'none'
}

const PREPARE_VERBS =
  /\b(prepara(me|nos)?|redacta(me)?|genera(me)?|dejale|dejame|deja listo|dejalo listo|hazme|hazle|escribe(le|me)?|anota(me)?|arma(me)?|quiero mandar|quiero enviar|necesito (un |el )?(whats|correo|mensaje)|manda(le|me)? un|envia(le|me)? un)\b/

const CONTEXTUAL =
  /\b(mandale eso|enviale eso|prepara uno igual|uno igual|que tambien|tambien le llegue|hazlo mas|mejor por|incluye tambien|dejalo listo para cuando|con lo que (acordamos|platicamos|hablamos)|sobre lo que)\b/

const CANCEL =
  /\b(ya no (lo )?prepares|ya no prepares|no lo prepares|cancela(lo|r)?|descarta(lo)?|olvidalo|no hace falta (el |ese )?(correo|whats|mensaje))\b/

const MODIFY =
  /\b(cambia(lo)? a|cambia (el )?destinatario|mejor mandalo por|mejor por|quita (la|el)|hazlo mas|mas directo|mas formal|otro para|prepara otro)\b/

const MENTION_ONLY =
  /\b(tenemos que mejorar|nunca revisa|el cliente nos escribio|nos escribio por|la comunicacion por)\b/

const HYPOTHESIS =
  /\b(quiza|quizas|tal vez|no se si conviene|podriamos|deberiamos|conviene|seria bueno|habra que)\b/

const PERSONAL_FUTURE = /\b(voy a (enviar|mandar|escribir)|estare enviando|mando yo)\b/

const IMMEDIATE_SEND = /\b(envia (este|el|ese)|mandalo ya|envialo ahora|envia ahora)\b/

const SOFT_ACT =
  /\b(habria que avisar|hay que avisar|deberiamos avisar|conviene avisar|avisarle al equipo|mandar(le)? (un )?aviso)\b/

export function classifyCommunicationIntent(
  utterance: string,
  opts?: { hasOpenDraft?: boolean }
): CommunicationIntentResult {
  const t = normalize(utterance)
  const hasDraft = Boolean(opts?.hasOpenDraft)
  const channel = detectChannel(t)

  if (!t) {
    return {
      category: 'mention',
      shouldQueue: false,
      action: 'none',
      channel: 'none',
      softConfirm: false,
      askChannel: false,
      reason: 'empty',
    }
  }

  // D — cancel
  if (CANCEL.test(t)) {
    return {
      category: 'cancel_or_modify',
      shouldQueue: true,
      action: 'cancel',
      channel: channel === 'none' ? 'unspecified' : channel,
      softConfirm: false,
      askChannel: false,
      reason: 'cancel',
    }
  }

  // D — modify / channel switch / additional draft
  if (MODIFY.test(t) || (hasDraft && CONTEXTUAL.test(t))) {
    const additional = /\b(otro|otra|ademas prepara|tambien prepara un)\b/.test(t)
    if (additional) {
      return {
        category: 'cancel_or_modify',
        shouldQueue: true,
        action: 'prepare',
        channel: channel === 'none' ? 'unspecified' : channel,
        softConfirm: false,
        askChannel: channel === 'unspecified' || channel === 'none',
        reason: 'additional_draft',
      }
    }
    return {
      category: 'cancel_or_modify',
      shouldQueue: true,
      action: 'update',
      channel: channel === 'none' ? 'unspecified' : channel,
      softConfirm: false,
      askChannel: false,
      reason: 'modify_existing',
    }
  }

  // Exploratory / personal future / pure mention → no queue
  if (PERSONAL_FUTURE.test(t) && !PREPARE_VERBS.test(t)) {
    return {
      category: 'mention',
      shouldQueue: false,
      action: 'none',
      channel: channel === 'none' ? 'none' : channel,
      softConfirm: false,
      askChannel: false,
      reason: 'personal_future',
    }
  }

  if (MENTION_ONLY.test(t) && !PREPARE_VERBS.test(t)) {
    return {
      category: 'mention',
      shouldQueue: false,
      action: 'none',
      channel: channel === 'none' ? 'none' : channel,
      softConfirm: false,
      askChannel: false,
      reason: 'informative_mention',
    }
  }

  // Hypothesis / "deberíamos" / "¿podríamos?" without prepare verb
  if (HYPOTHESIS.test(t) && !PREPARE_VERBS.test(t) && !IMMEDIATE_SEND.test(t)) {
    const soft = SOFT_ACT.test(t)
    return {
      category: 'mention',
      shouldQueue: false,
      action: 'none',
      channel: channel === 'none' ? 'none' : channel,
      softConfirm: soft,
      askChannel: false,
      reason: soft ? 'soft_action_intent' : 'hypothesis',
    }
  }

  // Immediate send phrasing → still prepare (approval later), treat as explicit
  if (IMMEDIATE_SEND.test(t) || PREPARE_VERBS.test(t)) {
    const ch = channel === 'none' ? 'unspecified' : channel
    return {
      category: 'explicit',
      shouldQueue: ch !== 'unspecified',
      action: 'prepare',
      channel: ch,
      softConfirm: false,
      askChannel: ch === 'unspecified',
      reason: IMMEDIATE_SEND.test(t) ? 'immediate_send_as_prepare' : 'explicit_prepare',
    }
  }

  // B — contextual reference without prepare verb but with draft
  if (hasDraft && (CONTEXTUAL.test(t) || /\b(eso|ese|esa|lo mismo)\b/.test(t))) {
    return {
      category: 'contextual',
      shouldQueue: true,
      action: 'update',
      channel: channel === 'none' ? 'unspecified' : channel,
      softConfirm: false,
      askChannel: false,
      reason: 'contextual_update',
    }
  }

  // Contextual without open draft but clear prepare-like reference + channel
  if (CONTEXTUAL.test(t) && channel !== 'none') {
    const ch = channel === 'unspecified' ? 'unspecified' : channel
    return {
      category: 'contextual',
      shouldQueue: ch !== 'unspecified',
      action: ch === 'unspecified' ? 'none' : 'prepare',
      channel: ch,
      softConfirm: false,
      askChannel: ch === 'unspecified',
      reason: 'contextual_prepare',
    }
  }

  // Soft act without hypothesis already handled
  if (SOFT_ACT.test(t)) {
    return {
      category: 'mention',
      shouldQueue: false,
      action: 'none',
      channel: channel === 'none' ? 'none' : channel,
      softConfirm: true,
      askChannel: false,
      reason: 'soft_action_intent',
    }
  }

  return {
    category: 'mention',
    shouldQueue: false,
    action: 'none',
    channel: channel === 'none' ? 'none' : channel,
    softConfirm: false,
    askChannel: false,
    reason: 'no_actionable_intent',
  }
}

/** Textos cortos para inyectar en el prompt de voz. */
export const COMMUNICATION_INTENT_PROMPT_EXAMPLES = `
Comunicaciones (WhatsApp/correo) — interpreta intencion, no palabras clave:
A) Explicita → queue_workspace_draft action=prepare (channel whatsapp|email|both). Ej: "Prepara un WhatsApp para Carlos", "Redactame un correo", "Hazme un WhatsApp con los acuerdos", "Escribele a Pedro".
B) Contextual → action=update con pending_op_id (no dupliques). Ej: "Mandale eso a Carlos", "Uno igual para Mariana", "Mejor por correo", "Incluye lo de las fechas".
C) Mencion sin instruccion → NO uses la tool. Ej: "Tenemos que mejorar la comunicacion por WhatsApp", "Carlos nunca revisa sus correos", "El cliente nos escribio por WhatsApp". Si hay intencion suave de actuar (no solo comentario): pregunta "Quieres que te deje preparado el mensaje?" — nunca ante mencion meramente informativa.
D) Cancel/mod → action=cancel o update; "prepara otro" = nuevo prepare. Ej: "Ya no prepares el correo", "Cambia a Mariana", "Mejor mandalo por WhatsApp".
Distingue: "Voy a enviar un correo" (comentario) ≠ "Preparamelo" (prepare) ≠ "Deberiamos enviar" (hipotesis) ≠ "Envia este correo" (prepare + revision al colgar, no envio en la llamada).
Si el canal no se deduce: una sola pregunta "Lo prefieres por WhatsApp o correo?" — no encoles hasta saber el canal.
Confirma en una frase SOLO si la tool ok. Si falta contacto: "Lo dejo preparado y podras completar el numero/correo al revisar." No leas el borrador completo. No pidas "que quieres que diga" si la llamada ya tiene acuerdos. No envies en la llamada.
`.trim()
