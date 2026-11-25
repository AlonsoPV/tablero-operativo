import { describe, expect, it } from 'vitest'
import { createMemorySessionContextStore } from './sessionContext.js'
import { runAgentTurn, type AgentTurnDeps } from './runAgentTurn.js'
import { composeText } from './respond.js'
import { canExecuteCompoundStep, summarizeCompoundOutcomes } from './multiIntent.js'
import { createR1Db, r1Actor, R1_USERS } from './testing/r1Fixture.js'
import type { EntityResolutionCatalog } from './structuredActionDraft.js'
import type { ActionItem, OkrItem } from '../query/contracts.js'

const TODAY = '2026-11-25'

const GERARDO_ID = '22222222-2222-4222-8222-222222222201'
const CARLOS_ID = '22222222-2222-4222-8222-222222222202'
const SOFIA_EMPTY_ID = '22222222-2222-4222-8222-222222222203'
const LUIS_NO_WA_ID = '22222222-2222-4222-8222-222222222204'
const ANA_1_ID = '22222222-2222-4222-8222-222222222205'
const ANA_2_ID = '22222222-2222-4222-8222-222222222206'

const CATALOG: EntityResolutionCatalog = {
  users: [
    { id: R1_USERS.superAdmin.id, nombre: 'Alonso Pérez', activo: true, areas: ['Dirección'], hasWhatsApp: true },
    { id: GERARDO_ID, nombre: 'Gerardo Puga', activo: true, areas: ['Operaciones'], hasWhatsApp: true },
    { id: CARLOS_ID, nombre: 'Carlos Mendoza', activo: true, areas: ['Logística'], hasWhatsApp: true },
    { id: SOFIA_EMPTY_ID, nombre: 'Sofía Morales', activo: true, areas: ['Finanzas'], hasWhatsApp: true },
    { id: LUIS_NO_WA_ID, nombre: 'Luis Herrera', activo: true, areas: ['Comercial'], hasWhatsApp: false },
    { id: ANA_1_ID, nombre: 'Ana Torres', activo: true, areas: ['Calidad'], hasWhatsApp: true },
    { id: ANA_2_ID, nombre: 'Ana Ramírez', activo: true, areas: ['Compras'], hasWhatsApp: true },
  ],
  boards: [
    { id: 'kanban-corp', nombre: 'Kanban corporativo', kind: 'corporativo', authorized: true },
    { id: 'kanban-ops', nombre: 'Kanban Operaciones', kind: 'equipo', authorized: true },
  ],
}

const ALL_ACTIONS: ActionItem[] = [
  {
    id: 'act-g-1',
    title: 'Cerrar conciliación de entregas',
    estado: 'En_Ejecucion',
    fecha: TODAY,
    hora: null,
    prioridad: 'P1_Alta',
    href: '/kanban?accion=act-g-1',
    responsableId: GERARDO_ID,
    responsableNombre: 'Gerardo Puga',
    area: 'Operaciones',
  },
  {
    id: 'act-g-2',
    title: 'Validar orden de refacciones críticas',
    estado: 'Bloqueado',
    fecha: '2026-11-22',
    hora: null,
    prioridad: 'P1_Alta',
    href: '/kanban?accion=act-g-2',
    responsableId: GERARDO_ID,
    responsableNombre: 'Gerardo Puga',
    area: 'Operaciones',
  },
  {
    id: 'act-g-3',
    title: 'Actualizar matriz de proveedores',
    estado: 'Pendiente',
    fecha: '2026-11-23',
    hora: null,
    prioridad: 'P2_Media',
    href: '/kanban?accion=act-g-3',
    responsableId: GERARDO_ID,
    responsableNombre: 'Gerardo Puga',
    area: 'Operaciones',
  },
  {
    id: 'act-c-1',
    title: 'Auditar rutas de distribución norte',
    estado: 'En_Ejecucion',
    fecha: TODAY,
    hora: null,
    prioridad: 'P1_Alta',
    href: '/kanban?accion=act-c-1',
    responsableId: CARLOS_ID,
    responsableNombre: 'Carlos Mendoza',
    area: 'Logística',
  },
  {
    id: 'act-l-1',
    title: 'Enviar propuesta comercial Q4',
    estado: 'Pendiente',
    fecha: TODAY,
    hora: null,
    prioridad: 'P2_Media',
    href: '/kanban?accion=act-l-1',
    responsableId: LUIS_NO_WA_ID,
    responsableNombre: 'Luis Herrera',
    area: 'Comercial',
  },
]

const SAMPLE_OKRS: OkrItem[] = [
  {
    id: 'okr-1',
    name: 'Cumplimiento de entregas a tiempo',
    progress: 78,
    withoutInitiatives: false,
    insufficientKrs: 0,
    keyResults: [],
  },
  {
    id: 'okr-2',
    name: 'Reducir tiempos de ciclo operativo',
    progress: 62,
    withoutInitiatives: false,
    insufficientKrs: 0,
    keyResults: [],
  },
]

function buildDeps(options?: {
  store?: ReturnType<typeof createMemorySessionContextStore>
  failActionsQuery?: boolean
  onToolCall?: (name: string, args: Record<string, unknown>) => void
}): AgentTurnDeps {
  return {
    store: options?.store ?? createMemorySessionContextStore(),
    today: () => TODAY,
    entityCatalog: CATALOG,
    dispatch: async (_actor, name, args) => {
      options?.onToolCall?.(name, args as Record<string, unknown>)
      if (name === 'get_my_actions') {
        if (options?.failActionsQuery) {
          return { ok: false, kind: 'error', error: 'db_connection_timeout' }
        }
        const a = args as { responsable_id?: string; status_group?: string }
        if (a.status_group === 'verification') {
          return { ok: true, kind: 'ok', data: { items: [], total: 0, load_truncated: false } }
        }
        const filtered = a.responsable_id
          ? ALL_ACTIONS.filter((item) => item.responsableId === a.responsable_id)
          : ALL_ACTIONS
        return {
          ok: true,
          kind: 'ok',
          data: {
            items: filtered.map((item) => ({
              id: item.id,
              title: item.title,
              estado: item.estado,
              fecha: item.fecha,
              hora: item.hora,
              prioridad: item.prioridad,
              responsable: item.responsableId,
              responsable_nombre: item.responsableNombre,
              area: item.area,
            })),
            total: filtered.length,
            load_truncated: false,
          },
        }
      }
      if (name === 'get_okr_progress') {
        return {
          ok: true,
          kind: 'ok',
          data: {
            items: SAMPLE_OKRS.map((o) => ({
              id: o.id,
              name: o.name,
              progress: o.progress,
              without_initiatives: o.withoutInitiatives,
              insufficient_krs: o.insufficientKrs,
              key_results: [],
            })),
          },
        }
      }
      return { ok: true, kind: 'ok', data: {} }
    },
  }
}

async function ask(
  utterance: string,
  options?: {
    user?: (typeof R1_USERS)[keyof typeof R1_USERS]
    channel?: 'web' | 'whatsapp' | 'voice'
    store?: ReturnType<typeof createMemorySessionContextStore>
    failActionsQuery?: boolean
    onToolCall?: (name: string, args: Record<string, unknown>) => void
  }
) {
  const actor = r1Actor(
    createR1Db(),
    options?.user ?? R1_USERS.superAdmin,
    options?.channel ?? 'web',
    'comm-accept-session'
  )
  const res = await runAgentTurn(
    { actor, utterance },
    buildDeps({
      store: options?.store,
      failActionsQuery: options?.failActionsQuery,
      onToolCall: options?.onToolCall,
    })
  )
  const text = composeText(res.response, { headings: (options?.channel ?? 'web') === 'web' })
  return { res, text }
}

describe('SCRUMBAN — Contextual Intelligence & Tool Composition (20 escenarios de aceptación)', () => {
  it('1. Envíale a Gerardo un WhatsApp con la información de su día de hoy (evidencia P0)', async () => {
    const { res, text } = await ask('Envíale a Gerardo un WhatsApp con la información de su día de hoy')
    expect(res.intent).toBe('write_request')
    expect(res.communicationProposal?.recipients[0]?.recipientName).toBe('Gerardo Puga')
    const msg = res.communicationProposal?.recipients[0]?.messageBody ?? ''

    // Nunca copia la instrucción original ni expone IDs internos ni encabezados genéricos
    expect(msg).not.toMatch(/Envíale a Gerardo|un WhatsApp con la información/i)
    expect(msg).not.toMatch(/act-g-|22222222/)
    expect(text).not.toContain('Datos:\n')
    expect(text).not.toContain('Limitaciones:\n')

    // Usa nombre de pila, incluye datos reales de Gerardo, NO incluye acciones de Carlos
    expect(msg).toContain('Hola Gerardo,')
    expect(msg).toContain('Cerrar conciliación de entregas')
    expect(msg).toContain('Validar orden de refacciones críticas')
    expect(msg).not.toContain('Auditar rutas de distribución norte')
    expect(msg.length).toBeLessThanOrEqual(900)

    // UX orientada a la operación
    expect(text).toContain('WhatsApp para Gerardo Puga')
    expect(text).toContain('Confirmar envío | Editar | Cancelar')
  })

  it('2. Mándale a Gerardo sus pendientes', async () => {
    const { res } = await ask('Mándale a Gerardo sus pendientes')
    const msg = res.communicationProposal?.recipients[0]?.messageBody ?? ''
    expect(msg).toContain('Hola Gerardo,')
    expect(msg).toContain('Validar orden de refacciones críticas')
    expect(msg).toContain('Cerrar conciliación de entregas')
    expect(msg).not.toMatch(/Mándale a Gerardo/i)
  })

  it('3. Recuérdale a Gerardo sus vencimientos', async () => {
    const { res } = await ask('Recuérdale a Gerardo sus vencimientos')
    const msg = res.communicationProposal?.recipients[0]?.messageBody ?? ''
    expect(msg).toContain('Hola Gerardo,')
    expect(msg).toContain('vencid')
    expect(msg).toContain('Validar orden de refacciones críticas')
    expect(msg).not.toMatch(/Recuérdale a Gerardo/i)
  })

  it('4. Pregúntale a Gerardo cómo va con sus acciones', async () => {
    const { res } = await ask('Pregúntale a Gerardo cómo va con sus acciones')
    const msg = res.communicationProposal?.recipients[0]?.messageBody ?? ''
    expect(msg).toContain('Hola Gerardo,')
    expect(msg).toMatch(/3 abiertas|2 vencidas|1 bloqueada/)
    expect(msg).not.toMatch(/Pregúntale a Gerardo/i)
  })

  it('5. Mándale a Gerardo sus bloqueos', async () => {
    const { res } = await ask('Mándale a Gerardo sus bloqueos')
    const msg = res.communicationProposal?.recipients[0]?.messageBody ?? ''
    expect(msg).toContain('Hola Gerardo,')
    expect(msg).toContain('Validar orden de refacciones críticas')
    expect(msg).toContain('bloqueada')
    expect(msg).not.toContain('Actualizar matriz de proveedores')
  })

  it('6. Dile a Gerardo que necesito el reporte mañana (contenido explícito sin consultas innecesarias)', async () => {
    const toolsCalled: string[] = []
    const { res } = await ask('Dile a Gerardo que necesito el reporte mañana', {
      onToolCall: (name) => toolsCalled.push(name),
    })
    expect(toolsCalled).toHaveLength(0)
    const msg = res.communicationProposal?.recipients[0]?.messageBody ?? ''
    expect(msg).toContain('Hola Gerardo, necesito el reporte mañana.')
    expect(msg).not.toMatch(/Dile a Gerardo/i)
  })

  it('7. Mándale a Gerardo sus pendientes y dile que priorice los vencidos (contenido mixto)', async () => {
    const { res } = await ask('Mándale a Gerardo sus pendientes y dile que priorice los vencidos')
    const msg = res.communicationProposal?.recipients[0]?.messageBody ?? ''
    expect(msg).toContain('Hola Gerardo,')
    expect(msg).toContain('Validar orden de refacciones críticas')
    expect(msg).toMatch(/Priorice los vencidos/i)
    expect(msg).not.toMatch(/Mándale a Gerardo/i)
  })

  it('8. Comparte con Dirección el avance de su equipo', async () => {
    const { res, text } = await ask('Comparte con Dirección el avance de su equipo')
    const msg = res.communicationProposal?.recipients[0]?.messageBody ?? ''
    expect(res.communicationProposal?.recipients[0]?.recipientName).toBe('Dirección')
    expect(msg).toContain('5 acciones abiertas')
    expect(msg).toContain('70% de avance promedio')
    expect(text).not.toContain('Datos:\n')
  })

  it('9. Envíale a Gerardo un correo con el resumen semanal', async () => {
    const { res, text } = await ask('Envíale a Gerardo un correo con el resumen semanal')
    const rec = res.communicationProposal?.recipients[0]
    expect(rec?.channel).toBe('email')
    expect(rec?.subject).toContain('Resumen semanal operativo')
    expect(rec?.messageBody).toContain('Hola Gerardo,')
    expect(rec?.messageBody).toContain('Validar orden de refacciones críticas')
    expect(text).toContain('Mensaje preparado para Gerardo Puga')
    expect(text).toContain('Copiar mensaje')
    expect(text).not.toContain('Confirmar envío')
    expect(text).not.toMatch(/correo fue enviado/i)
  })

  it('10. Avísale que ya quedó (contenido contextual resuelto desde turno previo)', async () => {
    const store = createMemorySessionContextStore()
    await store.set(
      `${R1_USERS.superAdmin.id}:web:comm-accept-session`,
      {
        activeQuery: null,
        lastActions: [
          {
            id: 'act-c-1',
            title: 'Auditar rutas de distribución norte',
            estado: 'Hecho',
            fecha: TODAY,
            prioridad: 'P1_Alta',
            responsableId: CARLOS_ID,
            responsableNombre: 'Carlos Mendoza',
            area: 'Logística',
            updatedAt: TODAY,
            href: '/kanban?accion=act-c-1',
          },
        ],
        lastEntity: { kind: 'action', id: 'act-c-1', label: 'Auditar rutas de distribución norte' },
      },
      Date.now()
    )
    const { res } = await ask('Avísale que ya quedó', { store })
    const rec = res.communicationProposal?.recipients[0]
    expect(rec?.recipientName).toBe('Carlos Mendoza')
    expect(rec?.messageBody).toContain('Hola Carlos,')
    expect(rec?.messageBody).toContain('Auditar rutas de distribución norte')
    expect(rec?.messageBody).toContain('ya quedó lista')
  })

  it('11. Asígnale a Gerardo revisar inventario para el viernes y mándale un WhatsApp (acción + comunicación dependiente)', async () => {
    const { res } = await ask('Asígnale a Gerardo revisar inventario para el viernes y mándale un WhatsApp')
    expect(res.multiIntentPlan).toBeDefined()
    expect(res.multiIntentPlan?.steps.length).toBe(2)
    const step1 = res.multiIntentPlan?.steps[0]
    const step2 = res.multiIntentPlan?.steps[1]
    expect(step1?.kind).toBe('create_action')
    expect(step2?.kind).toBe('send_whatsapp')
    expect(step2?.dependsOnStepId).toBe(step1?.stepId)
    expect(step2?.recipientName).toBe('Gerardo Puga')
    expect(step2?.messageBody).toContain('Hola Gerardo,')
    expect(step2?.messageBody).not.toMatch(/Asígnale a Gerardo/i)
  })

  it('12. Mándales a los responsables sus compromisos individuales (comunicación grupal aislada)', async () => {
    const { res, text } = await ask('Mándales a los responsables sus compromisos individuales')
    const prop = res.communicationProposal
    expect(prop?.recipientMode).toBe('group_responsables')
    expect(prop?.recipients.length).toBe(3)

    const gerardoDraft = prop?.recipients.find((r) => r.recipientId === GERARDO_ID)
    const carlosDraft = prop?.recipients.find((r) => r.recipientId === CARLOS_ID)
    expect(gerardoDraft?.messageBody).toContain('Cerrar conciliación de entregas')
    expect(gerardoDraft?.messageBody).not.toContain('Auditar rutas de distribución norte')
    expect(carlosDraft?.messageBody).toContain('Auditar rutas de distribución norte')
    expect(carlosDraft?.messageBody).not.toContain('Cerrar conciliación de entregas')

    expect(text).toContain('Propuesta grupal de WhatsApp (3 destinatarios)')
    expect(text).toContain('Confirmar envío grupal')
  })

  it('13. Destinatario sin acciones asignadas (estado vacío honesto sin ampliar alcance)', async () => {
    const { res, text } = await ask('Envíale a Sofía un WhatsApp con la información de su día de hoy')
    expect(res.response.status).toBe('empty')
    expect(res.communicationProposal).toBeUndefined()
    expect(text).toContain('Sofía no tiene acciones asignadas para hoy ni compromisos vencidos registrados.')
    expect(text).not.toContain('Cerrar conciliación de entregas')
  })

  it('14. Destinatario ambiguo solicita aclaración única', async () => {
    const { res, text } = await ask('Envíale a Ana un WhatsApp con la información de su día')
    expect(res.response.status).toBe('clarification')
    expect(text).toContain('Ana Torres')
    expect(text).toContain('Ana Ramírez')
  })

  it('15. Destinatario sin canal WhatsApp disponible muestra Mensaje preparado + Copiar mensaje', async () => {
    const { res, text } = await ask('Envíale a Luis un WhatsApp con la información de su día de hoy')
    expect(res.communicationProposal?.canSendDirect).toBe(false)
    expect(text).toContain('Mensaje preparado para Luis Herrera')
    expect(text).toContain('Copiar mensaje')
    expect(text).toContain('no tiene un canal de WhatsApp verificado y disponible')
    expect(text).not.toContain('Confirmar envío')
  })

  it('16. Usuario sin permisos no puede consultar acciones ajenas para redactar comunicación', async () => {
    const { res } = await ask('Envíale a Gerardo un WhatsApp con la información de su día de hoy', {
      user: R1_USERS.analyst,
    })
    expect(res.response.status).toBe('forbidden')
    expect(res.communicationProposal).toBeUndefined()
  })

  it('17. Consulta de datos fallida informa error honesto sin inventar mensaje', async () => {
    const { res, text } = await ask('Envíale a Gerardo un WhatsApp con la información de su día de hoy', {
      failActionsQuery: true,
    })
    expect(res.response.status).toBe('error')
    expect(res.communicationProposal).toBeUndefined()
    expect(text).toMatch(/No pude consultar/i)
  })

  it('18. Comunicación dependiente de una escritura fallida queda bloqueada', async () => {
    const { res } = await ask('Asígnale a Gerardo revisar inventario para el viernes y mándale un WhatsApp')
    const plan = res.multiIntentPlan!
    const outcomesMap = new Map([
      [plan.steps[0]!.stepId, { stepId: plan.steps[0]!.stepId, ok: false, reason: 'Permiso denegado en Kanban' }],
    ])
    const gate = canExecuteCompoundStep(plan.steps[1]!, outcomesMap)
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toContain('operación previa falló')

    const summary = summarizeCompoundOutcomes(plan, [
      { stepId: plan.steps[0]!.stepId, ok: false, reason: 'Permiso denegado en Kanban' },
      { stepId: plan.steps[1]!.stepId, ok: false, reason: gate.reason },
    ])
    expect(summary.allSucceeded).toBe(false)
    expect(summary.text).toContain('falló')
    expect(summary.text).not.toMatch(/enviado exitosamente/i)
  })

  it('19. Edición del mensaje antes de confirmar actualiza contenido e incrementa versión', async () => {
    const store = createMemorySessionContextStore()
    const first = await ask('Envíale a Gerardo un WhatsApp con la información de su día de hoy', { store })
    expect(first.res.communicationProposal?.version).toBe(1)

    const edited = await ask('Agrégale que nos vemos a las 4 pm para revisarlo', { store })
    expect(edited.res.communicationProposal?.version).toBe(2)
    expect(edited.res.communicationProposal?.recipients[0]?.messageBody).toContain('Nos vemos a las 4 pm')
    expect(edited.text).toContain('Confirmar envío | Editar | Cancelar')
  })

  it('20. Sin sesión web de aprobación no se simula confirmación ni envío', async () => {
    const store = createMemorySessionContextStore()
    await ask('Envíale a Gerardo un WhatsApp con la información de su día de hoy', { store })

    const confirm1 = await ask('Confirmar envío', { store })
    expect(confirm1.res.communicationProposal?.status).toBe('pending')
    expect(confirm1.text).toContain('sesión web autenticada')
    expect(confirm1.res.proposals).toBeUndefined()

    const confirm2 = await ask('Confirmar envío', { store })
    expect(confirm2.res.communicationProposal?.status).toBe('pending')
    expect(confirm2.text).toContain('sesión web autenticada')
    expect(confirm2.res.proposals).toBeUndefined()
  })

  it('Variantes coloquiales, errores ortográficos y notas de voz', async () => {
    const coloquial = await ask('Pon a Gerardo al tanto de su día')
    expect(coloquial.res.communicationProposal?.recipients[0]?.messageBody).toContain('Cerrar conciliación de entregas')
    expect(coloquial.res.communicationProposal?.recipients[0]?.messageBody).not.toMatch(/Pon a Gerardo/i)

    const typo = await ask('Porfa mandale un wasap a Gerardo con sus pendintes')
    expect(typo.res.communicationProposal?.recipients[0]?.messageBody).toContain('Validar orden de refacciones críticas')
    expect(typo.res.communicationProposal?.recipients[0]?.messageBody).not.toMatch(/Porfa mandale/i)

    const voice = await ask('Recuérdale a Gerardo lo que vence hoy', { channel: 'voice' })
    expect(voice.res.communicationProposal?.recipients[0]?.messageBody).toContain('Hola Gerardo,')
    expect(voice.res.communicationProposal?.recipients[0]?.messageBody).not.toMatch(/Recuérdale a Gerardo/i)
  })
})


describe('aceptación transversal de referencias y cambios de atributos', () => {
  it.each(['web', 'whatsapp', 'voice'] as const)('%s: una referencia cambia responsable sin reescribir el título', async (channel) => {
    const store = createMemorySessionContextStore()
    await ask('Crea una acción para revisar inventario', { channel, store })
    const key = `${R1_USERS.superAdmin.id}:${channel}:comm-accept-session`
    const before = store.get(key)!.pendingWrite!.draft!
    const next = await ask('prepárala para gerardo', { channel, store })
    expect(next.res.handled).toBe(true)
    const after = store.get(key)!.pendingWrite!.draft!
    expect(after.responsableId).toBe(GERARDO_ID)
    expect(after.titulo).toBe(before.titulo)
    expect(after.descripcion).toBe(before.descripcion)
    expect(after.fecha).toBe(before.fecha)
  })

  it.each(['web', 'whatsapp', 'voice'] as const)('%s: destinatario y canal se editan con datos propios, sin contaminación', async (channel) => {
    const store = createMemorySessionContextStore()
    await ask('Envíale a Gerardo un WhatsApp con la información de su día de hoy', { channel, store })
    const revised = await ask('Mejor para Carlos', { channel, store })
    expect(revised.res.handled).toBe(true)
    expect(revised.text, 'recipient revision should be a proposal').not.toMatch(/No encontré|Qué información|No pude/)
    const key = `${R1_USERS.superAdmin.id}:${channel}:comm-accept-session`
    const after = store.get(key)!.pendingCommunication!
    expect(after.recipients[0]!.recipientId).toBe(CARLOS_ID)
    expect(after.recipients[0]!.messageBody).toContain('Auditar rutas')
    expect(after.recipients[0]!.messageBody).not.toContain('Cerrar conciliación')
    await ask('Mejor por correo', { channel, store })
    const email = store.get(key)!.pendingCommunication!
    expect(email.channel).toBe('email')
    expect(email.recipients[0]!.recipientId).toBe(CARLOS_ID)
    expect(email.purpose).toBe(after.purpose)
    expect(email.version).toBeGreaterThan(after.version)
  })

  it('una consulta intermedia conserva la propuesta y no reemplaza su cuerpo', async () => {
    const store = createMemorySessionContextStore()
    await ask('Envíale a Gerardo un WhatsApp con la información de su día de hoy', { store })
    const key = `${R1_USERS.superAdmin.id}:web:comm-accept-session`
    const before = store.get(key)!.pendingCommunication!
    await ask('¿Qué acciones tengo abiertas?', { store })
    expect(store.get(key)!.pendingCommunication).toEqual(before)
  })
})


describe('atributos de Kanban sin contaminación del título', () => {
  it.each(['web', 'whatsapp', 'voice'] as const)('%s: asígnamela conserva el contenido generado', async (channel) => {
    const store = createMemorySessionContextStore()
    await ask('Crea una acción para revisar inventario', {channel, store})
    const key = `${R1_USERS.superAdmin.id}:${channel}:comm-accept-session`
    const before = store.get(key)!.pendingWrite!.draft!
    await ask('asígnamela en Kanban corporativo', {channel, store})
    const after = store.get(key)!.pendingWrite!.draft!
    expect(after.titulo).toBe(before.titulo)
    expect(after.descripcion).toBe(before.descripcion)
    expect(after.responsableId).toBe(R1_USERS.superAdmin.id)
    expect(JSON.stringify(after)).not.toContain('asígnamela')
  })
})


describe('revisar y recuperar propuestas sin navegación ejecutiva ni proveedor LLM', () => {
  it.each(['web', 'whatsapp', 'voice'] as const)('%s: conserva todos los atributos al consultar cómo quedó', async channel => {
    const store=createMemorySessionContextStore()
    await ask('Crea una acción para revisar inventario',{store,channel})
    await ask('Prepárala para Gerardo',{store,channel})
    await ask('Para el viernes',{store,channel})
    const key=`${R1_USERS.superAdmin.id}:${channel}:comm-accept-session`
    const before=structuredClone(store.get(key)!)
    const review=await ask('¿Cómo quedó?',{store,channel})
    expect(review.res.handled).toBe(true)
    expect(review.text).toContain('Revisar inventario')
    expect(review.text).toContain('Gerardo')
    expect(store.get(key)!.pendingWrite).toEqual(before.pendingWrite)
    await ask('Envíale a Gerardo sus pendientes de hoy',{store,channel})
    await ask('Mejor por correo',{store,channel})
    await ask('¿Qué acciones tengo abiertas?',{store,channel})
    const pending=structuredClone(store.get(key)!)
    const back=await ask('Regresa al borrador anterior',{store,channel})
    expect(back.res.intent).toBe('review_pending')
    expect(back.text).toContain('acción del tablero o el borrador del mensaje')
    expect(store.get(key)!.pendingWrite).toEqual(pending.pendingWrite)
    expect(store.get(key)!.pendingCommunication).toEqual(pending.pendingCommunication)
    expect(store.get(key)!.executiveSession).toBeFalsy()
  })
})


it('el comando real del piloto separa título y descripción de los atributos explícitos', async () => {
  const store=createMemorySessionContextStore()
  await ask('Crea una acción QA R2: revisar inventario de prueba, para mí, en Kanban corporativo, para el viernes',{store})
  const draft=store.get(`${R1_USERS.superAdmin.id}:web:comm-accept-session`)!.pendingWrite!.draft!
  expect(draft.titulo).toBe('QA R2: revisar inventario de prueba')
  expect(draft.descripcion).toBe('QA R2: revisar inventario de prueba')
  expect(draft.responsableId).toBe(R1_USERS.superAdmin.id)
  expect(draft.fecha).toBe('2026-11-27')
})


it.each(['web','whatsapp','voice'] as const)('%s: el foco de propuesta permite volver a acción y cambiar únicamente fecha',async channel=>{
  const store=createMemorySessionContextStore()
  await ask('Crea una acción para revisar inventario, para mí, en Kanban corporativo, para el viernes',{store,channel})
  const key=`${R1_USERS.superAdmin.id}:${channel}:comm-accept-session`
  const action=structuredClone(store.get(key)!.pendingWrite!.draft!)
  await ask('Envíale a Gerardo sus pendientes de hoy',{store,channel})
  const message=structuredClone(store.get(key)!.pendingCommunication!)
  const show=await ask('Muéstrame la acción que preparamos',{store,channel})
  expect(show.text).toContain('Revisar inventario')
  const back=await ask('Regresa al mensaje para Gerardo',{store,channel})
  expect(back.text).toContain('Gerardo')
  expect(store.get(key)!.pendingCommunication).toEqual(message)
  await ask('Mejor por correo',{store,channel})
  const email=structuredClone(store.get(key)!.pendingCommunication!)
  await ask('Ahora volvamos a la acción',{store,channel})
  expect(store.get(key)!.pendingFocus).toBe('action')
  const missing=await ask('Cambia únicamente la fecha',{store,channel})
  expect(missing.text).toContain('Qué nueva fecha')
  expect(store.get(key)!.pendingWrite!.draft).toEqual(action)
  await ask('Cambia únicamente la fecha al lunes',{store,channel})
  expect(store.get(key)!.pendingWrite!.draft).toEqual({...action,fecha:'2026-11-30',fechaSource:'explicit'})
  expect(store.get(key)!.pendingCommunication).toEqual(email)
})
