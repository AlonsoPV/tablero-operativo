import { describe, expect, it } from 'vitest'
import type { CopilotActor, CopilotToolResult } from '../../src/features/ai-support/copilot/types.js'
import { resolveActor } from './query/resolveActor.js'
import { runAgentTurn } from './orchestrator/runAgentTurn.js'
import { formatForChannel } from './orchestrator/channelAdapters.js'
import { createMemorySessionContextStore, type SessionContextStore } from './orchestrator/sessionContext.js'
import type { ToolDispatcher } from './query/index.js'

function makeActor(
  id: string,
  nombre: string,
  rol: 'Super Admin' | 'Dirección' | 'Líder' | 'Operativo',
  areas: string[] = ['operaciones'],
  channel: 'web' | 'whatsapp' = 'whatsapp',
  sessionId = 's-1'
) {
  const copilot: CopilotActor = {
    supabase: {} as CopilotActor['supabase'],
    usuarioId: id,
    nombre,
    email: `${nombre.toLowerCase().replace(/\s+/g, '.')}@empresa.test`,
    rol,
    areas,
    modulosPermitidos: ['dashboard', 'kanban', 'okrs', 'equipo'],
  }
  return resolveActor(copilot, { channel, sessionId })
}

const SUPER_ADMIN = makeActor('u-admin', 'Alonso Perez', 'Super Admin', ['direccion'])
const DIRECCION = makeActor('u-dir', 'Laura Director', 'Dirección', ['direccion'])
const LIDER = makeActor('u-lider', 'Carlos Lider', 'Líder', ['operaciones'])
const OPERATIVO = makeActor('u-op', 'Sofia Operativa', 'Operativo', ['operaciones'])

const MOCK_OKRS = [
  {
    id: 'okr-1',
    nombre: 'Aumentar productividad operativa 20%',
    progress: 45,
    without_initiatives: false,
    insufficient_krs: 0,
    owner_user_id: 'u-dir',
    scope: 'empresa',
  },
  {
    id: 'okr-2',
    nombre: 'Reducir entregas vencidas debajo de 5%',
    progress: 70,
    without_initiatives: false,
    insufficient_krs: 0,
    owner_user_id: 'u-lider',
    scope: 'area',
  },
]

const MOCK_INITIATIVES = [
  {
    id: 'init-1',
    key_result_id: 'kr-1',
    action_id: 'act-init-1',
    team_action_id: null,
    title: 'Automatizar reporte semanal de productividad',
    estado: 'En_Ejecucion',
    fecha: '2026-11-30',
    responsable_id: 'u-lider',
    responsable_nombre: 'Carlos Lider',
    okr_id: 'okr-1',
    okr_nombre: 'Aumentar productividad operativa 20%',
    kr_title: 'Horas ahorradas por semana',
    active: true,
  },
  {
    id: 'init-2',
    key_result_id: 'kr-2',
    action_id: 'act-init-2',
    team_action_id: null,
    title: 'Implementar tablero de alertas tempranas',
    estado: 'Pendiente',
    fecha: '2026-12-05',
    responsable_id: 'u-op',
    responsable_nombre: 'Sofia Operativa',
    okr_id: 'okr-2',
    okr_nombre: 'Reducir entregas vencidas debajo de 5%',
    kr_title: 'Alertas atendidas < 24h',
    active: true,
  },
  {
    id: 'init-3',
    key_result_id: 'kr-2',
    action_id: 'act-init-3',
    team_action_id: null,
    title: 'Estandarizar checklist de cierre',
    estado: 'En_Ejecucion',
    fecha: '2026-12-08',
    responsable_id: 'u-op',
    responsable_nombre: 'Sofia Operativa',
    okr_id: 'okr-2',
    okr_nombre: 'Reducir entregas vencidas debajo de 5%',
    kr_title: 'Checklists completados',
    active: true,
  },
  {
    id: 'init-4',
    key_result_id: 'kr-1',
    action_id: 'act-init-4',
    team_action_id: null,
    title: 'Capacitación inicial Q3 (cerrada)',
    estado: 'Verificado',
    fecha: '2026-10-15',
    responsable_id: 'u-admin',
    responsable_nombre: 'Alonso Perez',
    okr_id: 'okr-1',
    okr_nombre: 'Aumentar productividad operativa 20%',
    kr_title: 'Sesiones impartidas',
    active: false,
  },
]

const MOCK_ACTIONS = [
  {
    id: 'act-1',
    title: 'Validar presupuesto Q4',
    estado: 'Pendiente',
    fecha: '2026-11-26',
    prioridad: 'P1 - Alta',
    responsable: 'u-lider',
    responsable_nombre: 'Carlos Lider',
    area: 'operaciones',
  },
  {
    id: 'act-2',
    title: 'Cerrar auditoría de inventario',
    estado: 'En_Ejecucion',
    fecha: '2026-11-27',
    prioridad: 'P2 - Media',
    responsable: 'u-op',
    responsable_nombre: 'Sofia Operativa',
    area: 'operaciones',
  },
]

function createDispatcher(): ToolDispatcher {
  return async (actor, name, args): Promise<CopilotToolResult> => {
    if (name === 'get_okr_progress') {
      return {
        ok: true,
        kind: 'ok',
        name,
        data: {
          objectives: MOCK_OKRS.length,
          insufficient_krs: 0,
          truncated: false,
          items: MOCK_OKRS,
          initiative_items: MOCK_INITIATIVES,
        },
      }
    }
    if (name === 'get_my_actions') {
      const scope = String(args.scope ?? 'assigned_to_me')
      const statusGroup = String(args.status_group ?? 'open')
      if (statusGroup === 'verification') {
        return { ok: true, kind: 'ok', name, data: { total: 0, items: [] } }
      }
      const rows =
        scope === 'assigned_to_me'
          ? MOCK_ACTIONS.filter((a) => a.responsable === actor.usuarioId)
          : MOCK_ACTIONS
      return {
        ok: true,
        kind: 'ok',
        name,
        data: { total: rows.length, acciones: rows, items: rows },
      }
    }
    return { ok: true, kind: 'ok', name, data: { total: 0, items: [] } }
  }
}

async function ask(
  actor: ReturnType<typeof makeActor>,
  utterance: string,
  channel: 'web' | 'whatsapp' = 'whatsapp',
  store: SessionContextStore = createMemorySessionContextStore()
) {
  const turn = await runAgentTurn(
    {
      actor: { ...actor, channel },
      utterance,
    },
    {
      dispatch: createDispatcher(),
      store,
      today: () => '2026-11-24',
    }
  )
  const text = formatForChannel(turn, channel)
  return { turn, text, store }
}

describe('SCRUMBAN — Precisión semántica, alcance de datos y estados vacíos (10 consultas de aceptación)', () => {
  it('1. "Muéstrame mis iniciativas activas" — Super Admin con 0 activas NO recibe OKRs corporativos ni ampliación automática', async () => {
    const { turn, text } = await ask(SUPER_ADMIN, 'Muéstrame mis iniciativas activas', 'whatsapp')
    expect(turn.handled).toBe(true)
    expect(turn.intent).toBe('query_initiatives')
    expect(turn.response?.status).toBe('empty')
    expect(text).toContain('No tienes iniciativas activas asignadas actualmente')
    expect(text).toContain('iniciativas de la organización')
    expect(text).toContain('objetivos estratégicos corporativos')
    // Nunca sustituye por OKRs corporativos ni muestra iniciativas de otros usuarios ni cerradas
    expect(text).not.toContain('Aumentar productividad operativa 20%')
    expect(text).not.toContain('Automatizar reporte semanal')
    expect(text).not.toContain('Capacitación inicial Q3')
  })

  it('1b. Transversalidad Web vs WhatsApp — misma respuesta honesta para Super Admin y Dirección con 0 iniciativas', async () => {
    const webRes = await ask(SUPER_ADMIN, 'Muéstrame mis iniciativas activas', 'web')
    const dirRes = await ask(DIRECCION, 'Muéstrame mis iniciativas activas', 'whatsapp')
    expect(webRes.turn.intent).toBe('query_initiatives')
    expect(webRes.text).toContain('No tienes iniciativas activas asignadas actualmente')
    expect(dirRes.turn.intent).toBe('query_initiatives')
    expect(dirRes.text).toContain('No tienes iniciativas activas asignadas actualmente')
  })

  it('2. "¿Qué iniciativas tengo asignadas?" — Líder (1 iniciativa) y Operativo (2 iniciativas) con conteo exacto y sin UUIDs', async () => {
    const liderRes = await ask(LIDER, '¿Qué iniciativas tengo asignadas?', 'whatsapp')
    expect(liderRes.turn.intent).toBe('query_initiatives')
    expect(liderRes.turn.response?.status).toBe('ok')
    expect(liderRes.text).toContain('1 iniciativa(s) activas asignadas a ti')
    expect(liderRes.text).toContain('Automatizar reporte semanal de productividad')
    expect(liderRes.text).not.toContain('Implementar tablero de alertas')
    expect(liderRes.text).not.toContain('u-lider')

    const opRes = await ask(OPERATIVO, '¿Qué iniciativas tengo asignadas?', 'web')
    expect(opRes.turn.intent).toBe('query_initiatives')
    expect(opRes.text).toContain('2 iniciativa(s) activas asignadas a ti')
    expect(opRes.text).toContain('Implementar tablero de alertas tempranas')
    expect(opRes.text).toContain('Estandarizar checklist de cierre')
    expect(opRes.text).not.toContain('Automatizar reporte semanal')
  })

  it('3. "¿Qué iniciativas tiene la empresa?" — devuelve exactamente las 3 iniciativas activas de la organización (excluye la cerrada)', async () => {
    const { turn, text } = await ask(SUPER_ADMIN, '¿Qué iniciativas tiene la empresa?', 'whatsapp')
    expect(turn.intent).toBe('query_initiatives')
    expect(turn.response?.status).toBe('ok')
    expect(text).toContain('3 iniciativa(s) activas de la organización')
    expect(text).toContain('Automatizar reporte semanal de productividad')
    expect(text).toContain('Implementar tablero de alertas tempranas')
    expect(text).toContain('Estandarizar checklist de cierre')
    expect(text).not.toContain('Capacitación inicial Q3')
  })

  it('4. "¿Cuáles son mis objetivos?" — Super Admin con 0 objetivos propios NO recibe los corporativos; Dirección (1) sí recibe el suyo', async () => {
    const adminRes = await ask(SUPER_ADMIN, '¿Cuáles son mis objetivos?', 'whatsapp')
    expect(adminRes.turn.intent).toBe('query_okrs')
    expect(adminRes.turn.response?.status).toBe('empty')
    expect(adminRes.text).toContain('No tienes objetivos asignados directamente actualmente')
    expect(adminRes.text).not.toContain('Aumentar productividad operativa 20%')

    const dirRes = await ask(DIRECCION, '¿Cuáles son mis objetivos?', 'whatsapp')
    expect(dirRes.turn.intent).toBe('query_okrs')
    expect(dirRes.turn.response?.status).toBe('ok')
    expect(dirRes.text).toContain('1 objetivo(s) activo(s) asignado(s) a ti')
    expect(dirRes.text).toContain('Aumentar productividad operativa 20%')
    expect(dirRes.text).not.toContain('Reducir entregas vencidas')
  })

  it('5. "¿Cómo van los objetivos corporativos?" — devuelve los 2 objetivos corporativos reales', async () => {
    const { turn, text } = await ask(SUPER_ADMIN, '¿Cómo van los objetivos corporativos?', 'whatsapp')
    expect(turn.intent).toBe('query_okrs')
    expect(turn.response?.status).toBe('ok')
    expect(text).toContain('2 objetivo(s) activo(s)')
    expect(text).toContain('Aumentar productividad operativa 20%')
    expect(text).toContain('Reducir entregas vencidas debajo de 5%')
  })

  it('6. "¿Qué acciones tengo pendientes?" — Super Admin con 0 acciones propias NO recibe acciones del equipo; Líder recibe su acción', async () => {
    const adminRes = await ask(SUPER_ADMIN, '¿Qué acciones tengo pendientes?', 'whatsapp')
    expect(adminRes.turn.intent).toBe('query_actions')
    expect(adminRes.turn.response?.status).toBe('empty')
    expect(adminRes.text).not.toContain('Validar presupuesto Q4')

    const liderRes = await ask(LIDER, '¿Qué acciones tengo pendientes?', 'whatsapp')
    expect(liderRes.turn.intent).toBe('query_actions')
    expect(liderRes.text).toContain('Validar presupuesto Q4')
    expect(liderRes.text).not.toContain('Cerrar auditoría de inventario')
  })

  it('7. "¿Qué acciones tiene pendientes el equipo?" — Líder/Dirección ven las 2 acciones del equipo', async () => {
    const { turn, text } = await ask(LIDER, '¿Qué acciones tiene pendientes el equipo?', 'whatsapp')
    expect(turn.intent).toBe('query_actions')
    expect(text).toContain('Validar presupuesto Q4')
    expect(text).toContain('Cerrar auditoría de inventario')
  })

  it('8. "¿Qué compromisos tengo pendientes?" — Super Admin con 0 compromisos propios NO recibe compromisos ajenos', async () => {
    const { turn, text } = await ask(SUPER_ADMIN, '¿Qué compromisos tengo pendientes?', 'whatsapp')
    expect(turn.intent).toBe('executive_commitments')
    expect(turn.response?.status).toBe('empty')
    expect(text).toContain('No tienes compromisos pendientes asignados actualmente')
    expect(text).not.toContain('Validar presupuesto Q4')
  })

  it('9. "¿Qué proyectos tengo asignados?" — alcance personal estricto y transparencia sobre modelo de datos SCRUMBAN', async () => {
    const adminRes = await ask(SUPER_ADMIN, '¿Qué proyectos tengo asignados?', 'whatsapp')
    expect(adminRes.turn.intent).toBe('query_actions')
    expect(adminRes.turn.response?.status).toBe('empty')
    expect(adminRes.text).toContain('no cuenta con una entidad separada de proyectos')
    expect(adminRes.text).not.toContain('Validar presupuesto Q4')

    const liderRes = await ask(LIDER, '¿Qué proyectos tengo asignados?', 'web')
    expect(liderRes.turn.intent).toBe('query_actions')
    expect(liderRes.text).toContain('Validar presupuesto Q4')
    expect(liderRes.text).not.toContain('Cerrar auditoría de inventario')
  })

  it('10. "¿Quién es responsable de esta iniciativa?" — responde responsable real en contexto y pide aclaración sin inventar si no hay contexto', async () => {
    const noCtx = await ask(SUPER_ADMIN, '¿Quién es responsable de esta iniciativa?', 'whatsapp')
    expect(noCtx.turn.intent).toBe('query_initiatives')
    expect(noCtx.turn.response?.status).toBe('clarification')
    expect(noCtx.text).toContain('No tengo identificada una iniciativa específica')

    // Con contexto previo (Líder consultó su única iniciativa → sigue preguntando por el responsable)
    const first = await ask(LIDER, '¿Qué iniciativas tengo asignadas?', 'whatsapp')
    const second = await ask(LIDER, '¿Quién es responsable de esta iniciativa?', 'whatsapp', first.store)
    expect(second.turn.intent).toBe('query_initiatives')
    expect(second.turn.response?.status).toBe('ok')
    expect(second.text).toContain('Carlos Lider')
    expect(second.text).toContain('Automatizar reporte semanal de productividad')
  })
})
