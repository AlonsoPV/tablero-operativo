import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchActivePeopleByName } from './searchActivePeople.js'

function mockSupabase(rowsByPattern: Record<string, Array<{ id: string; nombre: string; rol?: string; area?: string }>>) {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.ilike = vi.fn((_col: string, pattern: string) => {
    ;(chain as { _pattern?: string })._pattern = pattern
    return chain
  })
  chain.limit = vi.fn((_n: number) => {
    const pattern = (chain as { _pattern?: string })._pattern || ''
    return Promise.resolve({ data: rowsByPattern[pattern] ?? [], error: null })
  })
  return chain as unknown as SupabaseClient
}

describe('searchActivePeopleByName', () => {
  it('finds a person by full name via ilike even if many users exist', async () => {
    const supabase = mockSupabase({
      '%Gerardo Puga%': [{ id: 'u-gerardo', nombre: 'Gerardo Puga', rol: 'Responsable', area: 'Ops' }],
    })
    const matches = await searchActivePeopleByName(supabase, 'Gerardo Puga')
    expect(matches).toHaveLength(1)
    expect(matches[0]?.id).toBe('u-gerardo')
  })

  it('falls back to surname token when full-name ilike is empty', async () => {
    const supabase = mockSupabase({
      '%Gerardo Puga%': [],
      '%Puga%': [
        { id: 'u-1', nombre: 'Ana Puga' },
        { id: 'u-gerardo', nombre: 'Gerardo Puga' },
      ],
    })
    const matches = await searchActivePeopleByName(supabase, 'Gerardo Puga')
    expect(matches.some((p) => p.id === 'u-gerardo')).toBe(true)
  })

  it('returns empty for blank name', async () => {
    const supabase = mockSupabase({})
    expect(await searchActivePeopleByName(supabase, '   ')).toEqual([])
  })

  it('matches partial and compound names', async () => {
    const supabase = mockSupabase({
      '%Puga%': [{ id: 'u-gerardo', nombre: 'Gerardo Puga' }],
      '%Gerardo%': [{ id: 'u-gerardo', nombre: 'Gerardo Puga' }],
    })
    const partial = await searchActivePeopleByName(supabase, 'Puga')
    expect(partial.map((p) => p.id)).toContain('u-gerardo')
    const compound = await searchActivePeopleByName(
      mockSupabase({
        '%Maria Elena Soto%': [{ id: 'u-mes', nombre: 'Maria Elena Soto' }],
      }),
      'Maria Elena Soto'
    )
    expect(compound).toHaveLength(1)
    expect(compound[0]?.id).toBe('u-mes')
  })

  it('returns multiple homonyms for clarification upstream', async () => {
    const supabase = mockSupabase({
      '%Juan Perez%': [
        { id: 'u-1', nombre: 'Juan Perez', area: 'Ops' },
        { id: 'u-2', nombre: 'Juan Perez', area: 'Comercial' },
      ],
    })
    const matches = await searchActivePeopleByName(supabase, 'Juan Perez')
    expect(matches.length).toBeGreaterThan(1)
  })

  it('escapes ilike wildcards in the search needle', async () => {
    const patterns: string[] = []
    const chain: Record<string, unknown> = {}
    chain.from = vi.fn(() => chain)
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.ilike = vi.fn((_col: string, pattern: string) => {
      patterns.push(pattern)
      return chain
    })
    chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
    await searchActivePeopleByName(chain as unknown as SupabaseClient, '100%_test')
    expect(patterns[0]).toBe('%100\\%\\_test%')
  })

  it('only queries activo=true (inactive users never returned by filter)', async () => {
    const eqCalls: Array<[string, unknown]> = []
    const chain: Record<string, unknown> = {}
    chain.from = vi.fn(() => chain)
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val])
      return chain
    })
    chain.ilike = vi.fn(() => chain)
    chain.limit = vi.fn(() =>
      Promise.resolve({
        data: [{ id: 'u-active', nombre: 'Persona Activa' }],
        error: null,
      })
    )
    const matches = await searchActivePeopleByName(chain as unknown as SupabaseClient, 'Persona Activa')
    expect(eqCalls).toContainEqual(['activo', true])
    expect(matches).toHaveLength(1)
  })
})
