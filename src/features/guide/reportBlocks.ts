export type ReportBlock = { title: string | null; body: string }

export function parseReportBlocks(raw: string): ReportBlock[] {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const blocks: ReportBlock[] = []
  let current: ReportBlock | null = null

  const isHeading = (line: string) => {
    if (line.length > 48) return false
    if (/^REPORTE\b/i.test(line)) return true
    if (/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s\-—–:]{2,}$/.test(line) && /[A-ZÁÉÍÓÚÑ]/.test(line)) {
      return true
    }
    return false
  }

  const prettyHeading = (line: string) =>
    line
      .replace(/^REPORTE EJECUTIVO\s*[—–-]?\s*GUIA\s*/i, 'Reporte ejecutivo')
      .replace(/\bSITUACION\b/i, 'Situacion')
      .replace(/\bDIAGNOSTICO\b/i, 'Diagnostico')
      .replace(/\bDECISIONES\b/i, 'Decisiones')
      .replace(/\bPARA APROBAR\b/i, 'Para aprobar')
      .replace(/\bTRABAJO CREADO\b/i, 'Trabajo creado')
      .replace(/\bPRIORIDADES\b/i, 'Prioridades')
      .replace(/\bACCIONES\b/i, 'Acciones')
      .replace(/\bRIESGOS\b/i, 'Riesgos')
      .replace(/\bPROXIMOS PASOS\b/i, 'Proximos pasos')
      .replace(/\bCIERRE\b/i, 'Cierre')

  for (const line of lines) {
    if (isHeading(line)) {
      if (current && current.body.trim()) blocks.push(current)
      current = { title: prettyHeading(line), body: '' }
      continue
    }
    if (!current) current = { title: null, body: '' }
    current.body = current.body ? `${current.body}\n${line}` : line
  }
  if (current && (current.title || current.body.trim())) blocks.push(current)
  return blocks.length > 0 ? blocks : [{ title: null, body: raw.trim() }]
}
