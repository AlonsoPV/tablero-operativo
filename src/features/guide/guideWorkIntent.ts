/**
 * Intención de sesión Guía (voz/texto): consulta vs crear acción / WhatsApp / correo.
 * Distinto del WriteIntent consult|create del asistente corporativo.
 */

export const GUIDE_WORK_INTENTS = ['consult', 'action', 'whatsapp', 'email'] as const

export type GuideWorkIntent = (typeof GUIDE_WORK_INTENTS)[number]

export const GUIDE_WORK_INTENT_OPTIONS: Array<{ id: GuideWorkIntent; label: string }> = [
  { id: 'consult', label: 'Consultar' },
  { id: 'action', label: 'Acción' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Correo' },
]

/** Acepta valores legacy (`create`) y strings desconocidos → consult. */
export function normalizeGuideWorkIntent(raw: unknown): GuideWorkIntent {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'create' || value === 'accion' || value === 'acción') return 'action'
  if (value === 'wa' || value === 'whatsapp') return 'whatsapp'
  if (value === 'mail' || value === 'correo' || value === 'email') return 'email'
  if (value === 'action' || value === 'consult') return value
  return 'consult'
}

export function isGuideCreateLikeIntent(intent: GuideWorkIntent) {
  return intent === 'action' || intent === 'whatsapp' || intent === 'email'
}

export function guideWorkIntentHint(intent: GuideWorkIntent, phase: 'idle' | 'active' | 'locked'): string {
  if (intent === 'action') {
    if (phase === 'locked') return 'Sesion en Accion: Guia arma acciones o iniciativas para aprobar.'
    if (phase === 'active') return 'Accion: cada mensaje prioriza dejar un borrador listo para aprobar.'
    return 'Accion: al iniciar, Guia prioriza dejar una accion o iniciativa para aprobar.'
  }
  if (intent === 'whatsapp') {
    if (phase === 'locked') return 'Sesion en WhatsApp: Guia prepara el borrador; no envia en la llamada.'
    if (phase === 'active') return 'WhatsApp: prioriza dejar un borrador de mensaje para revisar al terminar.'
    return 'WhatsApp: al iniciar, Guia prioriza preparar un WhatsApp (sin enviar).'
  }
  if (intent === 'email') {
    if (phase === 'locked') return 'Sesion en Correo: Guia prepara el borrador; no envia en la llamada.'
    if (phase === 'active') return 'Correo: prioriza dejar un borrador de correo para revisar al terminar.'
    return 'Correo: al iniciar, Guia prioriza preparar un correo (sin enviar).'
  }
  if (phase === 'locked') return 'Sesion en Consultar: Guia informa; si dictas un pendiente, igual lo arma.'
  return 'Consultar: diagnostico del tablero. Elige Accion, WhatsApp o Correo para crear.'
}

export function guideWorkIntentPlaceholder(intent: GuideWorkIntent) {
  if (intent === 'action') return 'Describe la accion o iniciativa…'
  if (intent === 'whatsapp') return 'Para quien y que debe decir el WhatsApp…'
  if (intent === 'email') return 'Para quien, asunto y que debe decir el correo…'
  return 'Escribe a Guia…'
}
