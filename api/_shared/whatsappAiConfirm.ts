export type WhatsAppAiDecision = 'confirm' | 'cancel'

const AIOP_RE = /^aiop:([0-9a-fA-F-]{36}):(ok|no)$/i

export function parseAiOpButton(raw: string | null | undefined): {
  opId: string
  action: WhatsAppAiDecision
} | null {
  const match = AIOP_RE.exec((raw ?? '').trim())
  if (!match) return null
  return {
    opId: match[1],
    action: match[2].toLowerCase() === 'ok' ? 'confirm' : 'cancel',
  }
}

export function inferAiConfirmText(text: string): WhatsAppAiDecision | null {
  const t = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!?]+$/g, '')
    .trim()
  if (!t || t.length > 24) return null
  if (/^(si|ok|okay|confirmar|confirmo|dale|de acuerdo|yes)$/.test(t)) return 'confirm'
  if (/^(no|cancelar|cancelo|nop|nel)$/.test(t)) return 'cancel'
  return null
}

export function aiOpButtonId(opId: string, action: 'ok' | 'no') {
  return `aiop:${opId}:${action}`
}
