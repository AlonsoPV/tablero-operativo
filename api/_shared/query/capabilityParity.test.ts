/**
 * Paridad TS ↔ SQL: el mismo fixture se valida contra public.access_capabilities_for_usuario
 * en scripts/test-r1-transversal-database.mjs (PGlite).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAccessCapabilities } from '../../../src/features/auth/lib/permissions.js'

type Profile = {
  name: string
  input: {
    rol: string
    appRole: string | null
    area: string | null
    relationalAreas: string[]
    moduleKeys: string[]
    active: boolean
    catalogSuperAdmin?: boolean
  }
  expected: Record<string, boolean>
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/fixtures/r1-capability-parity.json'), 'utf8')
) as { profiles: Profile[] }

describe('paridad de capacidades TS ↔ SQL', () => {
  it.each(fixture.profiles.map((p) => [p.name, p] as const))('%s', (_name, profile) => {
    const { relationalAreas, ...input } = profile.input
    const caps: Record<string, boolean> = { ...resolveAccessCapabilities({ ...input, areas: relationalAreas }) }
    delete caps.legacyOkrsAreaGrants
    expect(caps).toEqual(profile.expected)
  })
})
