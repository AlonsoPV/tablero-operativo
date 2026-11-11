/** Resuelve la operación de un router consolidado (?op= o sufijo del path). */
export function apiOpOf(req: { url?: string }, stripPrefixes: string[] = []): string {
  const raw = req.url || '/'
  const u = new URL(raw, 'http://local')
  const q = u.searchParams.get('op')
  if (q) return q.trim().toLowerCase()
  const leaf = u.pathname.split('/').filter(Boolean).pop() || ''
  let op = leaf
  for (const prefix of stripPrefixes) {
    if (op.startsWith(prefix)) {
      op = op.slice(prefix.length)
      break
    }
  }
  return op.trim().toLowerCase()
}
