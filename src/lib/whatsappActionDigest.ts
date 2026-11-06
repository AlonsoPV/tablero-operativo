/**
 * IDs públicos `emx_XXXXX` para el tablero (kanban/UI).
 * No es protocolo WhatsApp: el inbound usa `act:` / `chk:` / `tchk:`.
 */

export function accionIdPublico(id: string): string {
  const hex = id.replace(/-/g, '').toLowerCase()
  if (/^[0-9a-f]{32}$/.test(hex)) {
    const last12 = hex.slice(20)
    const n = BigInt('0x' + last12) % 100000n
    return `emx_${String(n).padStart(5, '0')}`
  }
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  const n = Math.abs(h) % 100000
  return `emx_${String(n).padStart(5, '0')}`
}

export function normalizeEmxPublicId(raw: string): string | null {
  const match = /emx[_-]?(\d{1,5})/i.exec(raw.trim())
  if (!match) return null
  return `emx_${match[1].padStart(5, '0')}`
}

export function parseEmxPublicIdFromText(text: string): string | null {
  return normalizeEmxPublicId(text)
}

export function matchAccionByPublicId<T extends { id: string }>(
  actions: T[],
  publicId: string
): T | null {
  const normalized = normalizeEmxPublicId(publicId)
  if (!normalized) return null
  return actions.find((item) => accionIdPublico(item.id) === normalized) ?? null
}

export function formatActionIdLine(
  action: { id: string; titulo?: string | null },
  index?: number
): string {
  const n = typeof index === 'number' ? `${index}. ` : ''
  const titulo = (action.titulo ?? 'Actividad').trim() || 'Actividad'
  return `${n}${accionIdPublico(action.id)} ${titulo}`
}
