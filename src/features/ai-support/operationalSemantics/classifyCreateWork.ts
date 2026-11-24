/**
 * Clasificación create Kanban vs iniciativa OKR (misma semántica que interpretOperationalMessage).
 * Vive en src para el chat web sin arrastrar communicationIntent al bundle.
 */
import { findTermsInText } from './operationalDictionary'

export type CreateWorkKind = 'kanban' | 'initiative' | 'clarify' | 'none'

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Pedido de preparar WhatsApp/correo (no crear accion Kanban).
 * Cubre sticky «Crear» en el toggle del chat Write.
 */
export function looksLikeCommsPrepare(text: string): boolean {
  const t = normalize(text)
  if (!t) return false
  // Mención sin pedido de envío/borrador
  if (
    /\b(mejorar|tenemos que|nunca|comunicacion por|hablar de)\b/.test(t) &&
    !/\b(prepara|redacta|manda|envia|escribe|avis|genera|dejale|armame)\w*\b/.test(t)
  ) {
    return false
  }
  const hasChannel =
    /\b(whats?\s*app|wasap|whatsapp|\bwa\b|correo|email|e-?mail|mail)\b/.test(t) ||
    (/\bmensaje\b/.test(t) && /\b(whats|wasap|correo|email|mail)\b/.test(t))
  const hasPrepareVerb =
    /\b(prepara(me|nos|le)?|redacta(me|le)?|genera(me|le)?|escribe(le|me)?|manda(le|me|lo)?|envia(le|me|lo)?|avis(a|ale|arle|ame)|dejale|dejame|arma(me|le)?|quiero (mandar|enviar)|necesito (un |el )?(whats|correo|mensaje))\b/.test(
      t
    ) || /\b(mandale|enviale|avisale|escribele|mandalo|envialo)\b/.test(t)
  if (hasChannel && hasPrepareVerb) return true
  // Sin canal explícito pero verbo de aviso a persona
  if (/\b(mandale|enviale|avisale|escribele|dejale)\b/.test(t) && /\b(a|al|para)\b/.test(t)) {
    return true
  }
  // Notificar/compartir la acción del tablero (Kanban) por correo
  if (looksLikeActionBoardNotify(t)) return true
  return false
}

/** Correo de notificación del tablero al responsable (notify_action_email), no Gmail libre. */
export function looksLikeActionBoardNotify(text: string): boolean {
  const t = normalize(text)
  if (!t) return false
  const hasAction = /\b(accion|acciones|esta accion|la accion|esa accion)\b/.test(t)
  const hasNotify =
    /\b(notif\w*|comparte|compartir|envia\w*|manda\w*|aviso|avisar|recordatorio)\b/.test(t)
  const hasResponsibleOrEmail =
    /\b(responsable|correo|email|e-?mail|mail)\b/.test(t) ||
    /\bal responsable\b/.test(t)
  return hasAction && hasNotify && hasResponsibleOrEmail
}

function hasExplicitBoardCreateNoun(text: string) {
  const t = normalize(text)
  const ids = new Set(findTermsInText(t).map((term) => term.id))
  return (
    ids.has('kanban_action') ||
    ids.has('okr_initiative') ||
    ids.has('okr_objective') ||
    ids.has('okr_key_result') ||
    /\b(tarea|accion|incidencia|pendiente|compromiso|iniciativa|okr|objetivo|\bkr\b|plan|medicion|kpi)\b/.test(
      t
    )
  )
}

export function classifyCreateWorkKind(text: string): CreateWorkKind {
  const t = normalize(text)
  // «Generame / prepara un WhatsApp» no es create Kanban
  if (looksLikeCommsPrepare(t) && !hasExplicitBoardCreateNoun(t)) return 'none'

  const asksCreate =
    /\b(crea(r|me)?|genera(r|me)?|agrega(r|me)?|registra(r)?|anota(r)?|arma(r|me)?|propon(e|me|er)?|agenda(r|me)?|programa(r|me)?|asigna(r|le|me)?)\b/.test(
      t
    )
  if (!asksCreate) return 'none'

  const ids = new Set(findTermsInText(t).map((term) => term.id))
  const hasKanban =
    ids.has('kanban_action') || /\b(tarea|accion|incidencia|pendiente|compromiso)\b/.test(t)
  const hasInitiative = ids.has('okr_initiative') || /\biniciativa(s)?\b/.test(t)
  const hasOkr =
    ids.has('okr_objective') ||
    ids.has('okr_key_result') ||
    /\b(okr|objetivo|key result|\bkr\b)\b/.test(t)
  const linkToObjective = /\b(objetivo|okr|al objetivo|al okr)\b/.test(t)

  if (hasInitiative && !hasKanban) return 'initiative'
  if ((hasKanban && hasInitiative) || (hasKanban && linkToObjective) || (linkToObjective && !hasKanban && !hasInitiative)) {
    return 'clarify'
  }
  if (hasKanban && !hasInitiative) return 'kanban'
  if (hasOkr && !hasKanban) return 'initiative'
  // create + work noun genérico (plan, medicion) → kanban por defecto operativo
  if (/\b(plan|medicion|kpi)\b/.test(t)) return 'kanban'
  return 'none'
}

export function resolveCreateWriteIntent(
  text: string,
  selected: 'consult' | 'create'
): 'consult' | 'create' {
  // WhatsApp/correo gana al toggle «Crear»: no abrir plan_actions.
  if (looksLikeCommsPrepare(text) && !hasExplicitBoardCreateNoun(text)) {
    return 'consult'
  }
  if (selected === 'create') return 'create'
  const kind = classifyCreateWorkKind(text)
  return kind === 'none' ? 'consult' : 'create'
}
