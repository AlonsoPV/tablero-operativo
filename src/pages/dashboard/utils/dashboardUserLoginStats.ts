export type LoginGranularity = 'weekly' | 'biweekly' | 'monthly'

export type UserLoginPerson = {
  userId: string
  nombre: string
  area: string | null
  rol: string | null
  lastLoginAt: string | null
}

export type UserLoginBucket = {
  bucketStart: string
  bucketEnd: string
  usersLoggedIn: number
  usersTotal: number
  loggedInUsers: UserLoginPerson[]
  absentUsers: UserLoginPerson[]
}

type UserLoginBucketRow = {
  bucket_start?: unknown
  bucket_end?: unknown
  users_logged_in?: unknown
  users_total?: unknown
  logged_in_users?: unknown
  absent_users?: unknown
}

export const LOGIN_GRANULARITY_OPTIONS: ReadonlyArray<{
  value: LoginGranularity
  label: string
}> = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
]

function toNonNegativeInteger(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizePerson(raw: unknown): UserLoginPerson | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const userId = typeof row.user_id === 'string' ? row.user_id : null
  const nombre = toNullableString(row.nombre) ?? 'Sin nombre'
  if (!userId) return null
  return {
    userId,
    nombre,
    area: toNullableString(row.area),
    rol: toNullableString(row.rol),
    lastLoginAt: toNullableString(row.last_login_at),
  }
}

function normalizePersonList(value: unknown): UserLoginPerson[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const person = normalizePerson(item)
    return person ? [person] : []
  })
}

export function normalizeUserLoginBuckets(data: unknown): UserLoginBucket[] {
  if (!Array.isArray(data)) return []

  return data.flatMap((raw): UserLoginBucket[] => {
    const row = raw as UserLoginBucketRow
    if (typeof row.bucket_start !== 'string' || typeof row.bucket_end !== 'string') return []

    const usersTotal = toNonNegativeInteger(row.users_total)
    const loggedInUsers = normalizePersonList(row.logged_in_users)
    const absentUsers = normalizePersonList(row.absent_users)
    const usersLoggedIn = Math.min(
      Math.max(toNonNegativeInteger(row.users_logged_in), loggedInUsers.length),
      usersTotal
    )

    return [{
      bucketStart: row.bucket_start,
      bucketEnd: row.bucket_end,
      usersLoggedIn,
      usersTotal,
      loggedInUsers,
      absentUsers,
    }]
  })
}

export function loginBucketPercentage(bucket: UserLoginBucket): number {
  if (bucket.usersTotal === 0) return 0
  return Math.round((bucket.usersLoggedIn / bucket.usersTotal) * 100)
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T12:00:00Z`)
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parseDateOnly(value))
}

export function loginBucketLabel(
  bucket: UserLoginBucket,
  granularity: LoginGranularity
): string {
  if (granularity === 'monthly') {
    return new Intl.DateTimeFormat('es-MX', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    }).format(parseDateOnly(bucket.bucketStart))
  }

  if (granularity === 'biweekly') {
    const half = Number(bucket.bucketStart.slice(8, 10)) <= 1 ? '1ª' : '2ª'
    const month = new Intl.DateTimeFormat('es-MX', {
      month: 'short',
      timeZone: 'UTC',
    }).format(parseDateOnly(bucket.bucketStart))
    return `${half} ${month}`
  }

  return formatShortDate(bucket.bucketStart)
}

export function loginBucketDateRangeLabel(bucket: UserLoginBucket): string {
  const start = formatShortDate(bucket.bucketStart)
  const end = formatShortDate(bucket.bucketEnd)
  return start === end ? start : `${start} – ${end}`
}

export function formatLoginTimestamp(value: string | null | undefined): string {
  if (!value) return 'Sin hora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin hora'
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(date)
}
