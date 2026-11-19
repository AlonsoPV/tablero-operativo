/**
 * Supabase en memoria para pruebas del agente. No emula RLS: la autorización
 * que se prueba es la del runtime (dispatchCopilotTool + matriz). La paridad RLS/JWT
 * sigue pendiente de QA (R0).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>

export type FakeSession = { usuarioId?: string }

export type FakeDb = {
  tables: Record<string, Row[]>
  rpcs?: Record<string, (args: Record<string, unknown>, session: FakeSession) => unknown>
  inserts: Array<{ table: string; row: Row }>
  queries: Array<{ table: string }>
  /** Inserciones persistentes, update y unicidad (pruebas R2). Apagado conserva el comportamiento R1. */
  mutable?: boolean
  /** Índices únicos parciales: se violan sólo si todas las columnas son no nulas e iguales. */
  unique?: Record<string, string[][]>
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

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value as Row).sort().map((k) => `${JSON.stringify(k)}:${stable((value as Row)[k])}`).join(',')}}`
}

/** jsonb comparado con su texto, como hace PostgREST con eq sobre una columna jsonb. */
function same(cell: unknown, value: unknown) {
  if (cell === value) return true
  if (cell && typeof cell === 'object' && typeof value === 'string') {
    try { return stable(cell) === stable(JSON.parse(value)) } catch { return false }
  }
  return false
}

const duplicateKey = { code: '23505', message: 'duplicate key value violates unique constraint' }

export function createFakeSupabase(db: FakeDb, session: FakeSession = {}): SupabaseClient {
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
    const violates = (row: Row, ignore?: Row) => {
      const rows = (db.tables[table] ?? []).filter((r) => r !== ignore)
      if (row.id != null && rows.some((r) => r.id === row.id)) return true
      return (db.unique?.[table] ?? []).some((cols) =>
        cols.every((c) => row[c] != null) && rows.some((r) => cols.every((c) => r[c] === row[c])))
    }
    // Resultado diferido: update/insert se aplican al resolver, como una petición HTTP.
    const deferred = (exec: () => { data: unknown; error: unknown; count?: number }) => {
      let single = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: Record<string, any> = {
        eq: (col: string, value: unknown) => { filters.push((r) => same(r[col], value)); return q },
        gt: (col: string, value: unknown) => { filters.push((r) => String(r[col] ?? '') > String(value)); return q },
        in: (col: string, values: unknown[]) => { filters.push((r) => values.includes(r[col])); return q },
        select: () => q,
        single: () => { single = true; return q },
        maybeSingle: () => { single = true; return q },
        then: (resolve: (value: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          const out = exec()
          const data = single && Array.isArray(out.data) ? (out.data[0] ?? null) : out.data
          return Promise.resolve({ ...out, data }).then(resolve, reject)
        },
      }
      return q
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {
      select: () => chain,
      eq: (col: string, value: unknown) => { filters.push((r) => same(r[col], value)); return chain },
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
      insert: (input: Row | Row[]) => {
        const rows = Array.isArray(input) ? input : [input]
        for (const row of rows) db.inserts.push({ table, row })
        if (!db.mutable) return Promise.resolve({ data: null, error: null })
        return deferred(() => {
          const created = rows.map((row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row }))
          if (created.some((row) => violates(row))) return { data: null, error: duplicateKey }
          ;(db.tables[table] ??= []).push(...created)
          return { data: created, error: null }
        })
      },
      update: (patch: Row, opts?: { count?: 'exact' }) => deferred(() => {
        const targets = run()
        for (const row of targets) {
          if (violates({ ...row, ...patch }, row)) return { data: null, error: duplicateKey }
        }
        for (const row of targets) Object.assign(row, patch)
        return { data: targets, error: null, ...(opts?.count ? { count: targets.length } : {}) }
      }),
      upsert: (row: Row, opts?: { onConflict?: string }) => {
        db.inserts.push({ table, row })
        const keys = (opts?.onConflict ?? 'id').split(',')
        const rows = db.tables[table] ?? (db.tables[table] = [])
        const index = rows.findIndex((existing) => keys.every((k) => existing[k] === row[k]))
        if (index >= 0) rows[index] = { ...rows[index], ...row }
        else rows.push({ ...row })
        return Promise.resolve({ data: null, error: null })
      },
      delete: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const remove: Record<string, any> = {
          eq: (col: string, value: unknown) => { chain.eq(col, value); return remove },
          then: (resolve: (value: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            const doomed = new Set(run())
            db.tables[table] = (db.tables[table] ?? []).filter((row) => !doomed.has(row))
            return Promise.resolve({ data: null, error: null }).then(resolve, reject)
          },
        }
        return remove
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
    try {
      return { data: await handler(args, session), error: null }
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err), code: 'P0001' } }
    }
  }
  return { from, rpc } as unknown as SupabaseClient
}
