/**
 * Supabase en memoria para pruebas del agente. No emula RLS: la autorización
 * que se prueba es la del runtime (dispatchCopilotTool + matriz). La paridad RLS/JWT
 * sigue pendiente de QA (R0).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>

export type FakeDb = {
  tables: Record<string, Row[]>
  rpcs?: Record<string, (args: Record<string, unknown>) => unknown>
  inserts: Array<{ table: string; row: Row }>
  queries: Array<{ table: string }>
}

function parseOr(expr: string): Array<{ col: string; value: string }> {
  return expr.split(',').flatMap((part) => {
    const m = part.match(/^([a-z_]+)\.eq\.(.+)$/)
    return m ? [{ col: m[1]!, value: m[2]! }] : []
  })
}

function ilikeToRegex(pattern: string) {
  const escaped = pattern
    .split(/(\\%|\\_|%|_)/)
    .map((token) => {
      if (token === '\\%') return '%'
      if (token === '\\_') return '_'
      if (token === '%') return '.*'
      if (token === '_') return '.'
      return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${escaped}$`, 'i')
}

export function createFakeSupabase(db: FakeDb): SupabaseClient {
  const from = (table: string) => {
    db.queries.push({ table })
    const filters: Array<(row: Row) => boolean> = []
    let limitN: number | null = null
    let orderCol: string | null = null
    let ascending = true
    const run = () => {
      let rows = (db.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
      if (orderCol) {
        const col = orderCol
        rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (ascending ? 1 : -1))
      }
      if (limitN != null) rows = rows.slice(0, limitN)
      return rows
    }
    const chain = {
      select: () => chain,
      eq: (col: string, value: unknown) => { filters.push((r) => r[col] === value); return chain },
      gt: (col: string, value: unknown) => { filters.push((r) => String(r[col] ?? '') > String(value)); return chain },
      in: (col: string, values: unknown[]) => { filters.push((r) => values.includes(r[col])); return chain },
      or: (expr: string) => {
        const clauses = parseOr(expr)
        filters.push((r) => clauses.some((c) => r[c.col] === c.value))
        return chain
      },
      ilike: (col: string, pattern: string) => {
        const re = ilikeToRegex(pattern)
        filters.push((r) => re.test(String(r[col] ?? '')))
        return chain
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderCol = col
        ascending = opts?.ascending !== false
        return chain
      },
      limit: (n: number) => { limitN = n; return chain },
      insert: (row: Row) => {
        db.inserts.push({ table, row })
        return Promise.resolve({ data: null, error: null })
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(resolve, reject),
    }
    return chain
  }
  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const handler = db.rpcs?.[name]
    if (!handler) return { data: null, error: { message: `rpc ${name} not found`, code: 'PGRST202' } }
    return { data: handler(args), error: null }
  }
  return { from, rpc } as unknown as SupabaseClient
}
