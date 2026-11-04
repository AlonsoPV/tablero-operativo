export type AssistantLane = 'talk' | 'write'
export type WriteIntent = 'consult' | 'create'

export function looksLikeCreateWork(text: string) {
  const normalized = text.toLowerCase()
  const asksCreate =
    /\b(crea(?:r|me)?|genera(?:r|me)?|agrega(?:r|me)?|registra(?:r)?|anota(?:r)?|arma(?:r|me)?|propon(?:e|me|er)?)\b/.test(
      normalized
    )
  const namesWork =
    /\b(acci[oó]n(?:es)?|iniciativa(?:s)?|pendiente(?:s)?|tarea(?:s)?|plan(?:es)?|okrs?|objetivo(?:s)?|krs?|resultado(?:s)?\s+clave|medici[oó]n(?:es)?|kpi)\b/.test(
      normalized
    )
  return asksCreate && namesWork
}

export function looksLikeDraftCorrection(text: string) {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (!normalized || normalized.length > 280) return false
  if (looksLikeCreateWork(text) && !/\b(no|corrige|cambia|en realidad|error|equivoc)\b/.test(normalized)) {
    return false
  }
  return (
    /\b(corrige|cambia|cambiar|en realidad|equivoc|error|la fecha|el plazo|el compromiso|el responsable|la evidencia)\b/.test(
      normalized
    ) ||
    /\bno[,.]?\s+(es|era|fue|la fecha|el dia|el viernes|el lunes|el martes)\b/.test(normalized) ||
    /\b(manana|pasado manana|para\s+hoy|hoy\s+mismo|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(
      normalized
    ) ||
    /\bpara\s+el\s+\d{1,2}\b/.test(normalized) ||
    /\b\d{1,2}\s+de\s+(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|junio|jun|julio|jul|agosto|ago|septiembre|sep|octubre|oct|noviembre|nov|diciembre|dic)\b/.test(
      normalized
    )
  )
}

export function resolveWriteIntent(text: string, selected: WriteIntent): WriteIntent {
  if (selected === 'create') return 'create'
  return looksLikeCreateWork(text) ? 'create' : 'consult'
}
