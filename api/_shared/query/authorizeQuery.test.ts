import { describe, expect, it } from 'vitest'
import { AGENT_PERMISSION_MATRIX, authorizeOperation, authorizeQuery } from './authorizeQuery.js'
import { classifyRole, resolveActor, type AgentActor } from './resolveActor.js'
import type { ActionQueryScope } from '../../../src/features/ai-support/actionQuery/types.js'

function actor(rol: string, opts: { active?: boolean; boardScope?: 'role' | 'organization' } = {}): AgentActor {
  return resolveActor(
    { supabase: {} as never, authUserId: 'a', usuarioId: 'u', rol, active: opts.active ?? true, boardScope: opts.boardScope },
    { channel: 'web', sessionId: 's' }
  )
}

const actions = (scope: ActionQueryScope) => ({ entity: 'actions' as const, scope, statusGroup: 'open' as const, visual: 'none' as const })

describe('classifyRole', () => {
  it.each([
    ['super_admin', 'super_admin'],
    ['Direccion', 'direction'],
    ['Direccion_Comercial', 'direction'],
    ['Lider', 'leader'],
    ['Analista', 'analyst'],
    ['Operativo', 'operative'],
  ])('%s → %s', (rol, expected) => {
    expect(classifyRole(rol)).toBe(expected)
  })
  it('inactivo prevalece sobre cualquier rol', () => {
    expect(classifyRole('super_admin', false)).toBe('inactive')
  })
})

describe('matriz de permisos (pares permitido/denegado)', () => {
  it('Analista: propias sí, tablero y equipo no', () => {
    expect(authorizeQuery(actor('Analista'), actions('assigned_to_me')).allowed).toBe(true)
    expect(authorizeQuery(actor('Analista'), actions('created_by_me')).allowed).toBe(true)
    const team = authorizeQuery(actor('Analista'), actions('team_authorized'))
    expect(team).toMatchObject({ allowed: false, fallbackScope: 'assigned_to_me' })
    expect(authorizeQuery(actor('Analista'), actions('board_authorized')).allowed).toBe(false)
  })

  it('Analista con piloto organizacional explícito conserva la lectura amplia vigente', () => {
    expect(authorizeQuery(actor('Analista', { boardScope: 'organization' }), actions('board_authorized')).allowed).toBe(true)
  })

  it('Dirección: lectura amplia sí; preparar o ejecutar cambios no', () => {
    expect(authorizeQuery(actor('Direccion'), actions('board_authorized')).allowed).toBe(true)
    expect(authorizeOperation(actor('Direccion'), 'propose_write').allowed).toBe(false)
    expect(authorizeOperation(actor('Direccion'), 'execute_write').allowed).toBe(false)
  })

  it('Líder y super_admin pueden proponer, pero nadie ejecuta en R1', () => {
    expect(authorizeOperation(actor('Lider'), 'propose_write').allowed).toBe(true)
    expect(authorizeOperation(actor('super_admin'), 'propose_write').allowed).toBe(true)
    for (const role of ['super_admin', 'Direccion', 'Lider', 'Operativo', 'Analista']) {
      expect(authorizeOperation(actor(role), 'execute_write').allowed).toBe(false)
    }
  })

  it('inactivo no consulta nada', () => {
    const off = actor('super_admin', { active: false })
    expect(authorizeQuery(off, actions('assigned_to_me')).allowed).toBe(false)
    expect(authorizeQuery(off, { entity: 'okrs' }).allowed).toBe(false)
  })

  it('combinada exige ambas partes', () => {
    const r = authorizeQuery(actor('Analista'), {
      entity: 'combined',
      actions: { scope: 'board_authorized', statusGroup: 'open', visual: 'none' },
      okrs: {},
    })
    expect(r.allowed).toBe(false)
  })

  it('ninguna fila de la matriz habilita ejecución real en R1', () => {
    for (const row of Object.values(AGENT_PERMISSION_MATRIX)) {
      expect(row.execute_write === 'disabled_r1' || row.execute_write === 'deny').toBe(true)
    }
  })
})
