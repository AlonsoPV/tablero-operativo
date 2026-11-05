export type WhatsAppFollowupAction = 'done' | 'progress' | 'support'

export type ParsedFollowupButton =
  | {
      kind: 'action'
      accionId: string
      action: WhatsAppFollowupAction
    }
  | {
      kind: 'corporate'
      checkpointId: string
      action: WhatsAppFollowupAction
    }
  | {
      kind: 'team'
      teamActionId: string
      checklistIndex: number
      action: WhatsAppFollowupAction
    }

const ACT_RE = /^act:([0-9a-fA-F-]{36}):(done|progress|support)$/i
const CHK_RE = /^chk:([0-9a-fA-F-]{36}):(done|progress|support)$/i
const TCHK_RE = /^tchk:([0-9a-fA-F-]{36}):(\d+):(done|progress|support)$/i

export function parseFollowupButtonId(raw: string | null | undefined): ParsedFollowupButton | null {
  const value = (raw ?? '').trim()
  if (!value) return null

  const act = ACT_RE.exec(value)
  if (act) {
    return {
      kind: 'action',
      accionId: act[1],
      action: act[2].toLowerCase() as WhatsAppFollowupAction,
    }
  }

  const corp = CHK_RE.exec(value)
  if (corp) {
    return {
      kind: 'corporate',
      checkpointId: corp[1],
      action: corp[2].toLowerCase() as WhatsAppFollowupAction,
    }
  }

  const team = TCHK_RE.exec(value)
  if (team) {
    return {
      kind: 'team',
      teamActionId: team[1],
      checklistIndex: Number(team[2]),
      action: team[3].toLowerCase() as WhatsAppFollowupAction,
    }
  }

  return null
}

export function inferFollowupTextAction(text: string): WhatsAppFollowupAction | null {
  const t = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!t) return null
  if (/\b(realizada|realizado|hecho|done|completad[oa]|lista|listo)\b/.test(t)) return 'done'
  if (/\b(en progreso|en proceso|proceso|avance|avanzando|progress|trabajando)\b/.test(t)) {
    return 'progress'
  }
  if (/\b(requiero apoyo|necesito apoyo|necesito ayuda|ayuda|support|bloquead[oa]|apoyo)\b/.test(t)) {
    return 'support'
  }
  return null
}

export function isVerActividadesButton(rawId: string | null | undefined, title: string | null | undefined) {
  const id = (rawId ?? '').trim().toLowerCase()
  const label = (title ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (id === 'ver_actividades' || id === 'ver-actividades' || id.includes('ver_actividades')) return true
  return /\bver actividades\b/.test(label)
}
