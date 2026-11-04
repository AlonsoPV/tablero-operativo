import { addCalendarDays } from '@/lib/dateUtils'

export type WorkFacts = {
  dateYmd: string | null
  timeHm: string | null
}

const MONTHS: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  sept: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}

function fold(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function ymdFromParts(year: number, month: number, day: number): string | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return `${year}-${pad(month)}-${pad(day)}`
}

function weekdayOf(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

export function nextWeekdayOnOrAfter(todayYmd: string, weekday: number) {
  const current = weekdayOf(todayYmd)
  const delta = (weekday - current + 7) % 7
  return addCalendarDays(todayYmd, delta)
}

function dateFromDayOfMonth(todayYmd: string, day: number) {
  const [year, month] = todayYmd.split('-').map(Number)
  const thisMonth = ymdFromParts(year, month, day)
  if (thisMonth && thisMonth >= todayYmd) return thisMonth
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return ymdFromParts(nextYear, nextMonth, day)
}

function parseClock(raw: string): string | null {
  const ampm = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/)
  if (ampm) {
    let hour = Number(ampm[1])
    const minute = Number(ampm[2] || '0')
    const isPm = /p/.test(ampm[3])
    if (isPm && hour < 12) hour += 12
    if (!isPm && hour === 12) hour = 0
    if (hour > 23 || minute > 59) return null
    return `${pad(hour)}:${pad(minute)}`
  }

  const hm = raw.match(/\b(?:a\s+las?\s+)?(\d{1,2}):(\d{2})\b/)
  if (hm) {
    const hour = Number(hm[1])
    const minute = Number(hm[2])
    if (hour > 23 || minute > 59) return null
    return `${pad(hour)}:${pad(minute)}`
  }

  const hourOnly = raw.match(/\ba\s+las?\s+(\d{1,2})\b/)
  if (hourOnly) {
    const hour = Number(hourOnly[1])
    if (hour > 23) return null
    return `${pad(hour)}:00`
  }

  return null
}

export function parseWorkFacts(text: string, todayYmd: string): WorkFacts {
  const raw = fold(text)
  let dateYmd: string | null = null

  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) dateYmd = ymdFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  if (!dateYmd) {
    const slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}|\d{2}))?\b/)
    if (slash) {
      const day = Number(slash[1])
      const month = Number(slash[2])
      let year = slash[3] ? Number(slash[3]) : Number(todayYmd.slice(0, 4))
      if (year < 100) year += 2000
      dateYmd = ymdFromParts(year, month, day)
      if (dateYmd && !slash[3] && dateYmd < todayYmd) {
        dateYmd = ymdFromParts(year + 1, month, day)
      }
    }
  }

  if (!dateYmd) {
    const named = raw.match(
      /\b(\d{1,2})\s+de\s+(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|junio|jun|julio|jul|agosto|ago|septiembre|setiembre|sep|sept|octubre|oct|noviembre|nov|diciembre|dic)(?:\s+(?:de\s+)?(20\d{2}))?\b/
    )
    if (named) {
      const day = Number(named[1])
      const month = MONTHS[named[2]]
      const year = named[3] ? Number(named[3]) : Number(todayYmd.slice(0, 4))
      dateYmd = ymdFromParts(year, month, day)
      if (dateYmd && !named[3] && dateYmd < todayYmd) {
        dateYmd = ymdFromParts(year + 1, month, day)
      }
    }
  }

  if (!dateYmd) {
    if (/\bpasado\s+manana\b/.test(raw)) dateYmd = addCalendarDays(todayYmd, 2)
    else if (/\bmanana\b/.test(raw)) dateYmd = addCalendarDays(todayYmd, 1)
    else if (/\b(para\s+hoy|hoy\s+mismo|el\s+dia\s+de\s+hoy|compromiso\s+hoy|fecha\s+hoy)\b/.test(raw)) {
      dateYmd = todayYmd
    }
  }

  if (!dateYmd) {
    const weekday = raw.match(
      /\b(?:para\s+el\s+|el\s+|este\s+|proximo\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/
    )
    if (weekday) {
      dateYmd = nextWeekdayOnOrAfter(todayYmd, WEEKDAYS[weekday[1]])
    }
  }

  if (!dateYmd) {
    const dayOnly = raw.match(/\b(?:para\s+el|el\s+dia|fecha(?:\s+al|\s+el)?|compromiso(?:\s+el)?)\s+(\d{1,2})\b/)
    if (dayOnly) {
      dateYmd = dateFromDayOfMonth(todayYmd, Number(dayOnly[1]))
    }
  }

  return { dateYmd, timeHm: parseClock(raw) }
}

export function mergeWorkFacts(latest: string, earlier: string, todayYmd: string): WorkFacts {
  const fromLatest = parseWorkFacts(latest, todayYmd)
  const fromEarlier = parseWorkFacts(earlier, todayYmd)
  return {
    dateYmd: fromLatest.dateYmd || fromEarlier.dateYmd,
    timeHm: fromLatest.timeHm || fromEarlier.timeHm,
  }
}

export function parseDueDateHint(hint: string | null | undefined, todayYmd: string): WorkFacts {
  const value = hint?.trim() ?? ''
  if (!value) return { dateYmd: null, timeHm: null }
  const iso = value.match(/^(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/)
  if (iso) return { dateYmd: iso[1], timeHm: iso[2] || null }
  return parseWorkFacts(value, todayYmd)
}

export function formatDueHint(facts: WorkFacts) {
  if (!facts.dateYmd) return null
  return facts.timeHm ? `${facts.dateYmd} ${facts.timeHm}` : facts.dateYmd
}

export function formatWorkDateLabel(hint: string | null | undefined) {
  const facts = parseDueDateHint(hint, '2000-01-01')
  if (!facts.dateYmd) return hint?.trim() || ''
  const [year, month, day] = facts.dateYmd.split('-').map(Number)
  const label = new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
  return facts.timeHm ? `${label}, ${facts.timeHm}` : label
}

export function formatWorkDateLong(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function rewriteDatesInText(text: string, fromYmd: string | null, toYmd: string) {
  if (!text) return text
  let next = text
  if (fromYmd && fromYmd !== toYmd) {
    const fromLong = formatWorkDateLong(fromYmd)
    const toLong = formatWorkDateLong(toYmd)
    next = next.replaceAll(fromYmd, toYmd)
    next = next.replaceAll(formatWorkDateLabel(fromYmd), formatWorkDateLabel(toYmd))
    next = next.replaceAll(fromLong, toLong)
    next = next.replaceAll(fromLong.replace(/ de \d{4}$/, ''), toLong.replace(/ de \d{4}$/, ''))
  }
  return next
}
