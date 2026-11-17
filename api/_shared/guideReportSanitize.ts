/**
 * Separación estricta: errores técnicos vs hallazgos de negocio en el informe.
 */

const TOOL_NAME_RE =
  /\b(get_okr_progress|get_my_actions|get_team_actions|get_action_details|get_dashboard_summary|get_module_data|get_org_chart|search_board|search_people|get_pending_verifications|create_action|update_action|confirm_pending_op|cancel_pending_op|queue_workspace_draft|gmail_prepare_send|whatsapp_prepare_send|scrumban)\b/i

const TECH_PHRASE_RE =
  /\b(timeout|timed out|PERMISSION_DENIED|AUTHENTICATION_FAILED|SESSION_NOT_FOUND|VALIDATION_FAILED|DATABASE_ERROR|PROVIDER_ERROR|firma de retell|tool call|http\s*[45]\d\d|stack trace|ECONNRESET|fetch failed|no pude guardar el borrador|no afirmo que se (haya )?enviado|no inventes que se envio)\b/i

export type TechnicalAttentionItem = {
  code: string
  message: string
  tool?: string
  at?: string
  retryable?: boolean
}

export function looksTechnicalText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (TOOL_NAME_RE.test(t)) return true
  if (TECH_PHRASE_RE.test(t)) return true
  if (/^[a-z0-9_]+:\s+/i.test(t) && TOOL_NAME_RE.test(t.split(':')[0] || '')) return true
  return false
}

/** Quita prefijos `tool_name: ` de títulos/detalles. */
export function stripToolNamePrefix(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^([a-z0-9_]+)\s*:\s*(.+)$/i)
  if (!match) return trimmed
  if (TOOL_NAME_RE.test(match[1])) return match[2].trim()
  return trimmed
}

export function humanizeVerifiedLine(tool: string, summary: string): string {
  const clean = stripToolNamePrefix(summary.trim()) || summary.trim()
  if (!clean) return ''
  if (/get_okr_progress/i.test(tool)) {
    return clean.replace(/^CAJA\s+/i, '').trim() || clean
  }
  return clean
}

export function sanitizeBusinessText(text: string): string | null {
  const cleaned = stripToolNamePrefix(text)
  if (!cleaned) return null
  if (looksTechnicalText(cleaned) || looksTechnicalText(text)) return null
  return cleaned
}

export function partitionTechnicalFromList(items: string[]): {
  business: string[]
  technical: TechnicalAttentionItem[]
} {
  const business: string[] = []
  const technical: TechnicalAttentionItem[] = []
  for (const raw of items) {
    const item = typeof raw === 'string' ? raw.trim() : ''
    if (!item) continue
    if (looksTechnicalText(item)) {
      technical.push({
        code: 'TECHNICAL_FROM_NARRATIVE',
        message: stripToolNamePrefix(item).slice(0, 400),
        tool: (item.match(TOOL_NAME_RE) || [])[0],
      })
      continue
    }
    const clean = sanitizeBusinessText(item)
    if (clean) business.push(clean)
  }
  return { business, technical }
}

export function sanitizeFindings<T extends { title: string; detail: string; evidence?: string }>(
  findings: T[]
): { findings: T[]; technical: TechnicalAttentionItem[] } {
  const kept: T[] = []
  const technical: TechnicalAttentionItem[] = []
  for (const item of findings) {
    const titleRaw = stripToolNamePrefix(item.title)
    const detailRaw = stripToolNamePrefix(item.detail)
    if (looksTechnicalText(item.title) || looksTechnicalText(item.detail) || looksTechnicalText(titleRaw) || looksTechnicalText(detailRaw)) {
      technical.push({
        code: 'TECHNICAL_FINDING',
        message: (detailRaw || titleRaw).slice(0, 400),
        tool: (item.title.match(TOOL_NAME_RE) || item.detail.match(TOOL_NAME_RE) || [])[0],
      })
      continue
    }
    kept.push({
      ...item,
      title: titleRaw.slice(0, 120) || 'Hallazgo',
      detail: detailRaw,
    })
  }
  return { findings: kept, technical }
}
