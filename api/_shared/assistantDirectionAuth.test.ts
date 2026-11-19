import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requireAssistantAuth } from './assistantAuth'

const fixture = vi.hoisted(() => ({
  profile: { id: 'profile', rol: 'Direccion', area: 'Comercial', activo: true },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-user' } }, error: null }) },
    from: (table: string) => {
      const result = { data: table === 'usuarios' ? fixture.profile : [], error: null }
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      }
      return query
    },
  }),
}))
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://qa.test')
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-key')
  fixture.profile = { id: 'profile', rol: 'Direccion', area: 'Comercial', activo: true }
})
afterEach(() => vi.unstubAllEnvs())
const request = { headers: { authorization: 'Bearer session-test' } } as never

it('authenticates executive queries outside OKRS without assigning an admin role', async () => {
  const result = await requireAssistantAuth(request)
  expect(result).toMatchObject({ ok: true, rol: 'Direccion', usuarioId: 'profile' })
})
it('still rejects inactive executive profiles', async () => {
  fixture.profile.activo = false
  expect(await requireAssistantAuth(request)).toMatchObject({ ok: false, status: 403 })
})
it('keeps existing module restrictions for other profiles', async () => {
  fixture.profile.rol = 'Operativo'
  expect(await requireAssistantAuth(request)).toMatchObject({ ok: false, status: 403 })
})
