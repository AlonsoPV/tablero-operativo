export type LoginGranularity = 'weekly' | 'biweekly' | 'monthly'

export type UserLoginBucket = {
  bucketStart: string
  bucketEnd: string
  usersLoggedIn: number
  usersTotal: number
}

type UserLoginBucketRow = {
  bucket_start?: unknown
  bucket_end?: unknown
  users_logged_in?: unknown
  users_total?: unknown
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

export function normalizeUserLoginBuckets(data: unknown): UserLoginBucket[] {
  if (!Array.isArray(data)) return []

  return data.flatMap((raw): UserLoginBucket[] => {
    const row = raw as UserLoginBucketRow
    if (typeof row.bucket_start !== 'string' || typeof row.bucket_end !== 'string') return []

    const usersTotal = toNonNegativeInteger(row.users_total)
    const usersLoggedIn = Math.min(toNonNegativeInteger(row.users_logged_in), usersTotal)

    return [{
      bucketStart: row.bucket_start,
      bucketEnd: row.bucket_end,
      usersLoggedIn,
      usersTotal,
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
