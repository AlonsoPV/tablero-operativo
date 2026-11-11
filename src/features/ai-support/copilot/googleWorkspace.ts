export const GOOGLE_READ_TOOLS = [
  'gmail_search',
  'gmail_get_thread',
  'calendar_list_events',
  'calendar_freebusy',
] as const

export const GOOGLE_WRITE_TOOLS = [
  'gmail_prepare_send',
  'gmail_prepare_reply',
  'calendar_prepare_event',
  'calendar_prepare_update',
  'calendar_prepare_cancel',
] as const

export type GoogleReadTool = (typeof GOOGLE_READ_TOOLS)[number]
export type GoogleWriteTool = (typeof GOOGLE_WRITE_TOOLS)[number]

export const GOOGLE_WRITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const GMAIL_SEARCH_LIMIT = 8
export const GMAIL_BODY_MAX = 4000
export const GMAIL_SNIPPET_MAX = 280

export const GOOGLE_SCOPES = {
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailCompose: 'https://www.googleapis.com/auth/gmail.compose',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
} as const

export const GOOGLE_OAUTH_SCOPES = [
  GOOGLE_SCOPES.gmailReadonly,
  GOOGLE_SCOPES.gmailCompose,
  GOOGLE_SCOPES.calendarEvents,
] as const

export const CDMX_TZ = 'America/Mexico_City'

export type CopilotWorkspaceKind = 'email' | 'event'

export type CopilotWorkspacePreview = {
  kind: CopilotWorkspaceKind
  from?: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  body?: string
  title?: string
  start?: string
  end?: string
  attendees?: string[]
  location?: string
  incomplete?: boolean
}

export function isGoogleReadTool(name: string): name is GoogleReadTool {
  return (GOOGLE_READ_TOOLS as readonly string[]).includes(name)
}

export function isGoogleWriteTool(name: string): name is GoogleWriteTool {
  return (GOOGLE_WRITE_TOOLS as readonly string[]).includes(name)
}

export function googleScopeLabels(scopes: string[] | null | undefined): string[] {
  const set = new Set(scopes ?? [])
  const labels: string[] = []
  if (set.has(GOOGLE_SCOPES.gmailReadonly)) labels.push('Leer Gmail')
  if (set.has(GOOGLE_SCOPES.gmailCompose)) labels.push('Redactar y enviar Gmail')
  if (set.has(GOOGLE_SCOPES.calendarEvents)) labels.push('Eventos de Calendar')
  return labels
}

export function hasGoogleScope(scopes: string[] | null | undefined, needed: string) {
  return (scopes ?? []).includes(needed)
}

export function canonicalWorkspacePayload(payload: Record<string, unknown>): string {
  const sortValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortValue)
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'content_hash')
        .sort(([a], [b]) => a.localeCompare(b))
      return Object.fromEntries(entries.map(([key, item]) => [key, sortValue(item)]))
    }
    return value
  }
  return JSON.stringify(sortValue(payload))
}

export function cdmxYmdFromInstant(iso: string | Date | number): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (!Number.isFinite(date.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: CDMX_TZ })
  }
  return date.toLocaleDateString('en-CA', { timeZone: CDMX_TZ })
}

export function formatAbsoluteCdmx(isoOrLocal: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(isoOrLocal)) {
    const [ymd, hm] = isoOrLocal.split('T')
    return formatCdmxWall(ymd, hm)
  }
  const date = new Date(isoOrLocal)
  if (!Number.isFinite(date.getTime())) return isoOrLocal
  return date.toLocaleString('es-MX', {
    timeZone: CDMX_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCdmxWall(ymd: string, hm: string) {
  const [year, month, day] = ymd.split('-').map(Number)
  const [hour, minute] = hm.split(':').map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hour + 6, minute)
  const date = new Date(utcGuess)
  return date.toLocaleString('es-MX', {
    timeZone: CDMX_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Interpreta YYYY-MM-DD y HH:MM como instante en America/Mexico_City. */
export function cdmxWallToRfc3339(ymd: string, hm: string): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const [hour, minute] = hm.split(':').map(Number)
  const utcProbe = Date.UTC(year, month - 1, day, 12, 0, 0)
  const asUtc = new Date(utcProbe)
  const cdmxNoon = asUtc.toLocaleString('en-US', {
    timeZone: CDMX_TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
  const [cdmxH, cdmxM] = cdmxNoon.split(':').map(Number)
  const offsetMin = 12 * 60 - (cdmxH * 60 + cdmxM)
  const startUtc = Date.UTC(year, month - 1, day, hour, minute) + offsetMin * 60_000
  return new Date(startUtc).toISOString()
}

export function addMinutesHm(hm: string, minutes: number): string {
  const [hour, minute] = hm.split(':').map(Number)
  const total = hour * 60 + minute + minutes
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const nextH = Math.floor(wrapped / 60)
  const nextM = wrapped % 60
  return `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`
}

export function clipText(value: string, max: number) {
  const text = value.trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`
}

export function emailsFromUnknown(value: unknown): string[] {
  if (typeof value === 'string') {
    const matches = value.toLowerCase().match(/[^\s<>,;]+@[^\s<>,;]+\.[a-z]{2,}/g) ?? []
    return [...new Set(matches)]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => emailsFromUnknown(item))
  }
  return []
}

export const PROFILE_GOOGLE_HREF = '/settings/profile'
