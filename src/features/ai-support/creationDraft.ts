export type CreationIntent = 'create' | 'recommend' | 'update' | 'batch'

export type CreationDraft = {
  intent: CreationIntent
  title: string
  description: string
  evidence: string | null
  checkpoints: string[]
  asksNotification: boolean
}

const EVIDENCE_PLACEHOLDER = 'Por definir'

export function evidenceOrPlaceholder(evidence: string | null | undefined) {
  const value = evidence?.trim() ?? ''
  if (value.length >= 5) return value.slice(0, 2000)
  return EVIDENCE_PLACEHOLDER
}

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function sentenceCase(value: string) {
  const text = clean(value).replace(/[.]+$/, '')
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function classifyCreationIntent(request: string): CreationIntent {
  const text = request.toLowerCase()
  const creates = /\b(crea|crear|genera|agrega|añade|anade|ponle|asigna|registra)\b/.test(text)
  const several = /\b(dos|tres|cuatro|varias|varios|\d+)\s+(acciones|tareas|actividades)\b/.test(text)
  if (creates && several) return 'batch'
  if (creates) return 'create'
  if (/\b(cambia|actualiza|mueve|reagenda|modifica)\b/.test(text)) return 'update'
  if (/\b(recomiend|sugier|qu[eé] har[ií]as)\b/.test(text)) return 'recommend'
  return 'create'
}

function stripLead(request: string) {
  return clean(request)
    .replace(
      /^(crea|crear|genera|agrega|añade|anade|ponle|asigna|registra|necesito)\b[^.]{0,80}?\b(para que|para|que)\b/i,
      ''
    )
    .replace(/^(una accion|una acción|una tarea|una actividad|una iniciativa)\b/i, '')
}

function dropAssigneeAndDate(phrase: string) {
  return clean(phrase)
    .replace(
      /\b(hoy|mañana|manana|pasado mañana|el viernes|el lunes|el martes|el mi[eé]rcoles|el jueves|el s[aá]bado|el domingo|la pr[oó]xima semana|en \d+ d[ií]as|antes de fin de mes)\b/gi,
      ''
    )
    .replace(/^[A-ZÁÉÍÓÚÑ][\p{L}'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+)?\s+(?=revis|valid|prepar|entreg|analiz|document|hac)/iu, '')
    .replace(/\b(a|para)\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]+)?\b/u, '')
    .replace(/\b(porque|por que|ya que)\b[\s\S]*$/i, '')
}

export function draftFromRequest(request: string): CreationDraft {
  const source = clean(request)
  const intent = classifyCreationIntent(source)
  const body = stripLead(source)
  const reason = source.match(/\b(?:porque|por que|ya que)\b\s+(.+)$/i)?.[1]?.trim() ?? ''
  const titleSource = dropAssigneeAndDate(body) || dropAssigneeAndDate(source)
  const title = sentenceCase(titleSource).slice(0, 70)
  const description = sentenceCase(
    reason ? `${title}. ${reason}` : titleSource || source
  ).slice(0, 4000)
  const evidenceMatch = source.match(/\bevidencia\b\s*:\s*(.{5,200})/i)
  const checkpoints = extractCheckpoints(source)
  const asksNotification = /\b(avis\w*|notif\w*|m[aá]ndale|env[ií]ale)\b[\s\S]{0,40}\b(whatsapp|whats app|mensaje)\b/i.test(
    source
  )
  return {
    intent,
    title: title.length >= 3 ? title : sentenceCase(source).slice(0, 70),
    description,
    evidence: evidenceMatch ? evidenceMatch[1].trim() : null,
    checkpoints,
    asksNotification,
  }
}

function extractCheckpoints(source: string) {
  const numbered = [...source.matchAll(/(?:^|\n)\s*(?:\d+[\).\]]\s+)([^\n]{3,160})/g)].map((match) =>
    clean(match[1])
  )
  const listed = source.match(/\bpasos\b\s*:\s*(.+)$/i)?.[1]
  const fromList = listed
    ? listed.split(/,| y /i).map((item) => clean(item)).filter((item) => item.length >= 3)
    : []
  const unique = [...numbered, ...fromList].filter((item, index, all) => all.indexOf(item) === index)
  return unique.slice(0, 4)
}

export function sanitizeCheckpoints(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => (typeof item === 'string' ? clean(item) : ''))
    .filter((item) => item.length >= 3 && item.length <= 160)
    .slice(0, 4)
}
