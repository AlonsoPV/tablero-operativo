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

function foldWhatsAppLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
}

/** Meta MX: el tablero guarda 52XXXXXXXXXX; el webhook llega como 521XXXXXXXXXX. */
export function whatsappPhoneVariants(raw: string | null | undefined): string[] {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return []
  const out = new Set<string>([digits])
  if (digits.length === 10) {
    out.add(`52${digits}`)
    out.add(`521${digits}`)
  }
  if (digits.length === 12 && digits.startsWith('52') && !digits.startsWith('521')) {
    const local = digits.slice(2)
    out.add(local)
    out.add(`521${local}`)
  }
  if (digits.length === 13 && digits.startsWith('521')) {
    const local = digits.slice(3)
    out.add(local)
    out.add(`52${local}`)
  }
  return [...out]
}

export function isVerActividadesButton(rawId: string | null | undefined, title: string | null | undefined) {
  const id = foldWhatsAppLabel(rawId ?? '')
  const label = foldWhatsAppLabel(title ?? '')
  const haystack = `${id} ${label}`
  if (
    id === 'ver_actividades' ||
    id === 'ver-actividades' ||
    id.includes('ver_actividades') ||
    id.includes('mas_informacion') ||
    id.includes('mas-informacion') ||
    id === 'more_info'
  ) {
    return true
  }
  return /ver actividades/.test(haystack) || /mas informacion/.test(haystack)
}
