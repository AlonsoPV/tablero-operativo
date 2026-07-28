import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import type { UserProfile } from '@/features/users/types/user.types'
import { addCalendarDays, dateOnlyCDMX } from '@/lib/dateUtils'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import { priorityColorFor } from '@/features/operations/utils/priorityColors'

export type RedWeekBucket = {
  weekStart: string
  weekEnd: string
  label: string
}

export type RedUploadsUserWeekCell = {
  count: number
  actions: AccionDiaria[]
}

export type RedUploadsUserRow = {
  userId: string
  nombre: string
  area: string | null
  weeks: Record<string, RedUploadsUserWeekCell>
  total: number
  actions: AccionDiaria[]
}

export type RedUploadsByWeekResult = {
  weeks: RedWeekBucket[]
  rows: RedUploadsUserRow[]
  weekTotals: Record<string, number>
  grandTotal: number
}

const DEFAULT_WEEK_COUNT = 8

function mondayOfWeek(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dow = date.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatWeekLabel(weekStart: string): string {
  const end = addCalendarDays(weekStart, 6)
  const startLabel = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${weekStart}T12:00:00Z`))
  const endLabel = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${end}T12:00:00Z`))
  return `${startLabel} – ${endLabel}`
}

export function buildRedWeekBuckets(todayYmd: string, weekCount = DEFAULT_WEEK_COUNT): RedWeekBucket[] {
  const currentMonday = mondayOfWeek(todayYmd)
  const weeks: RedWeekBucket[] = []
  for (let i = weekCount - 1; i >= 0; i -= 1) {
    const weekStart = addCalendarDays(currentMonday, -7 * i)
    const weekEnd = addCalendarDays(weekStart, 6)
    weeks.push({
      weekStart,
      weekEnd,
      label: formatWeekLabel(weekStart),
    })
  }
  return weeks
}

function isRedAction(action: AccionDiaria, priorities: Priority[]): boolean {
  const priority = findPriorityForAccion(action, priorities)
  return priorityColorFor(priority?.nombre ?? action.prioridad, priority?.color) === 'rojo'
}

export function buildRedUploadsByWeek(input: {
  actions: AccionDiaria[]
  users: UserProfile[]
  priorities: Priority[]
  today: string
  weekCount?: number
}): RedUploadsByWeekResult {
  const weeks = buildRedWeekBuckets(input.today, input.weekCount ?? DEFAULT_WEEK_COUNT)
  const weekStarts = new Set(weeks.map((week) => week.weekStart))
  const usersById = new Map(input.users.map((user) => [user.id, user]))
  const rowsByUser = new Map<string, RedUploadsUserRow>()
  const weekTotals: Record<string, number> = Object.fromEntries(weeks.map((week) => [week.weekStart, 0]))

  for (const action of input.actions) {
    if (!isRedAction(action, input.priorities)) continue
    if (!action.created_at) continue

    const createdYmd = dateOnlyCDMX(action.created_at)
    const weekStart = mondayOfWeek(createdYmd)
    if (!weekStarts.has(weekStart)) continue

    const creatorId = action.created_by?.trim() || 'sin-usuario'
    const creator = usersById.get(creatorId)
    let row = rowsByUser.get(creatorId)
    if (!row) {
      row = {
        userId: creatorId,
        nombre: creator?.nombre?.trim() || 'Usuario sin perfil',
        area: creator?.area ?? null,
        weeks: Object.fromEntries(
          weeks.map((week) => [week.weekStart, { count: 0, actions: [] as AccionDiaria[] }])
        ),
        total: 0,
        actions: [],
      }
      rowsByUser.set(creatorId, row)
    }

    const cell = row.weeks[weekStart]!
    cell.count += 1
    cell.actions.push(action)
    row.total += 1
    row.actions.push(action)
    weekTotals[weekStart] = (weekTotals[weekStart] ?? 0) + 1
  }

  const rows = [...rowsByUser.values()].sort(
    (a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es')
  )

  return {
    weeks,
    rows,
    weekTotals,
    grandTotal: rows.reduce((sum, row) => sum + row.total, 0),
  }
}
