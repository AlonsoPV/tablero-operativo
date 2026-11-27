/**
 * Extrae acciones concretas de un plan consultivo (Gemini u orquestador)
 * para convertirlas en propuestas R2. No inventa responsables ni fechas.
 */
export type AdvisoryPlanItem = {
  titulo: string
  responsableHint?: string
  fecha?: string
}

const MAX_ITEMS = 5
const MIN_TITLE = 8
const SKIP_TITLE =
  /^(para resolver|aqui tienes|el objetivo|diagnostico|estandarizacion|plan de accion|fase\b|paso\b|objetivo\b|contexto\b|resumen\b|checkpoints?\b|siguiente paso)/i

function cleanTitle(raw: string): string {
  return raw
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[:.]+$/, '')
    .trim()
    .slice(0, 70)
}

function lookLikeDate(value: string | undefined): string | undefined {
  const match = value?.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  return match?.[1]
}

function parseBlock(block: string, today: string): AdvisoryPlanItem | null {
  const header = block.match(/^(?:\d+[\.)]\s+|[-*•]\s+)(.+?)(?:\n|$)/)
  if (!header) return null
  let title = cleanTitle(header[1] ?? '')
  const sameLineResp = title.match(/^(.*?)\s*[·|—-]\s*(?:responsable|asigna(?:do)?(?:\s+a)?):\s*(.+)$/i)
  if (sameLineResp) title = cleanTitle(sameLineResp[1] ?? '')
  if (title.length < MIN_TITLE || SKIP_TITLE.test(title)) return null
  if (/^(tabla|fase\s*\|)/i.test(title)) return null

  const respLine = block.match(/\bresponsable\s*:\s*([^\n|]+)/i)
  let responsableHint = (sameLineResp?.[2] ?? respLine?.[1] ?? '')
    .replace(/\[.*?]/g, '')
    .replace(/\b(asignar|por definir|pendiente|tbd)\b/gi, '')
    .trim()
  if (!responsableHint || responsableHint.length < 3) responsableHint = ''

  const fecha =
    lookLikeDate(block.match(/\bfecha(?:\s*l[ií]mite)?\s*:\s*([^\n|]+)/i)?.[1]) ??
    lookLikeDate(block) ??
    today

  return {
    titulo: title,
    ...(responsableHint ? { responsableHint } : {}),
    fecha,
  }
}

function parseTableRows(text: string, today: string): AdvisoryPlanItem[] {
  const items: AdvisoryPlanItem[] = []
  for (const line of text.split('\n')) {
    if (!/^\|.+\|.+\|/.test(line)) continue
    if (/^\|?\s*[-:| ]+\s*\|/.test(line)) continue
    if (/\bfase\s*\|\s*acci/i.test(line) || /\bacci[oó]n\s*\|\s*responsable/i.test(line)) continue
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
    if (cells.length < 2) continue
    const actionCell = cells.find((cell) => cell.length >= MIN_TITLE && !SKIP_TITLE.test(cell)) ?? cells[1]
    const title = cleanTitle(actionCell ?? '')
    if (title.length < MIN_TITLE || SKIP_TITLE.test(title)) continue
    const respCell = cells.find((cell) => /\bresponsable\b/i.test(cell)) 
    const hint = cells
      .slice(1)
      .map((cell) => cell.replace(/\[.*?]/g, '').trim())
      .find((cell) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/.test(cell) && !lookLikeDate(cell))
    items.push({
      titulo: title,
      ...(hint && hint.length >= 3 ? { responsableHint: hint } : {}),
      fecha: lookLikeDate(line) ?? lookLikeDate(respCell) ?? today,
    })
    if (items.length >= MAX_ITEMS) break
  }
  return items
}

export function parseAdvisoryPlanItems(text: string, today: string): AdvisoryPlanItem[] {
  const source = (text ?? '').trim()
  if (!source) return []

  const blocks = source
    .split(/(?:^|\n)\s*(?=(?:\d+[\.)]\s+|[-*•]\s+))/)
    .map((block) => block.trim())
    .filter(Boolean)

  const items: AdvisoryPlanItem[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    const item = parseBlock(block, today)
    if (!item) continue
    const key = item.titulo.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
    if (items.length >= MAX_ITEMS) return items
  }

  if (items.length > 0) return items
  return parseTableRows(source, today)
}
