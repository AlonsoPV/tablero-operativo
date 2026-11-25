/**
 * SCRUMBAN — Matriz de aceptación de lenguaje natural (55+ instrucciones reales)
 * Valida intención, entidades, atributos, alcance, dependencias, propuestas,
 * aclaraciones, respuesta compacta y telemetría real (p50/p95) sobre runAgentTurn.
 */
import { describe, expect, it } from 'vitest'
import { dispatchCopilotTool } from '../assistantOpsRuntime.js'
import { createR1Db, r1Actor, r1Store, R1_TODAY, R1_USERS } from './testing/r1Fixture.js'
import { runAgentTurn } from './runAgentTurn.js'
import { composeText } from './respond.js'
import {
  canExecuteCompoundStep,
  summarizeCompoundOutcomes,
  type StepExecutionOutcome,
} from './multiIntent.js'
import { computeLatencyPercentiles } from './turnTelemetry.js'
import type { EntityResolutionCatalog } from './structuredActionDraft.js'

const CATALOG: EntityResolutionCatalog = {
  users: [
    { id: R1_USERS.superAdmin.id, nombre: 'Alonso Pérez', activo: true },
    { id: 'u-carlos-1', nombre: 'Carlos Mendoza', activo: true },
    { id: 'u-jorge-1', nombre: 'Jorge González', activo: true },
    { id: 'u-irhec-1', nombre: 'Irhec Vázquez', activo: true },
    { id: 'u-ana-1', nombre: 'Ana Torres', activo: true },
    { id: 'u-ana-2', nombre: 'Ana Ramírez', activo: true },
  ],
  boards: [
    { id: 'kanban_corporativo', nombre: 'Kanban corporativo', kind: 'corporativo', authorized: true },
    { id: 'tablero_equipo', nombre: 'Tablero de equipo', kind: 'equipo', authorized: true },
  ],
}

async function execTurn(
  utterance: string,
  opts: {
    user?: (typeof R1_USERS)[keyof typeof R1_USERS]
    channel?: 'web' | 'whatsapp' | 'voice'
    store?: ReturnType<typeof r1Store>
    db?: ReturnType<typeof createR1Db>
    catalog?: EntityResolutionCatalog
  } = {}
) {
  const db = opts.db ?? createR1Db()
  const store = opts.store ?? r1Store()
  const actor = r1Actor(db, opts.user ?? R1_USERS.superAdmin, opts.channel ?? 'whatsapp')
  const turn = await runAgentTurn(
    { actor, utterance },
    {
      dispatch: (a, name, args) => dispatchCopilotTool(a, name, args),
      store,
      today: () => R1_TODAY,
      entityCatalog: opts.catalog ?? CATALOG,
    }
  )
  return { turn, text: composeText(turn.response, turn.format), db, store }
}

type MatrixCase = {
  id: string
  category: string
  utterance: string
  channel?: 'web' | 'whatsapp' | 'voice'
  user?: (typeof R1_USERS)[keyof typeof R1_USERS]
  expectedIntent: string
  expectedStatus?: string
  mustContain?: string[]
  mustNotContain?: string[]
  minSteps?: number
}

const NATURAL_LANGUAGE_MATRIX: MatrixCase[] = [
  // 1. Instrucciones cortas
  { id: '01', category: 'corta', utterance: '¿Qué tengo pendiente hoy?', expectedIntent: 'query_actions' },
  { id: '02', category: 'corta', utterance: '¿Cuáles están vencidas?', expectedIntent: 'query_actions' },
  { id: '03', category: 'corta', utterance: '¿Qué requiere mi atención?', expectedIntent: 'executive_brief' },
  { id: '04', category: 'corta', utterance: '¿Quién tiene la más urgente?', expectedIntent: 'who_most_urgent' },

  // 2. Expresiones coloquiales del español de México
  { id: '05', category: 'coloquial', utterance: 'Ponle una tarea a Carlos para revisar inventario el viernes', expectedIntent: 'write_request', mustContain: ['Carlos Mendoza', 'Kanban'] },
  { id: '06', category: 'coloquial', utterance: 'Ponle a Carlos lo del inventario para el viernes', expectedIntent: 'write_request', mustContain: ['Carlos Mendoza'] },
  { id: '07', category: 'coloquial', utterance: 'Déjale un pendiente a Jorge para validar tarifas mañana', expectedIntent: 'write_request', mustContain: ['Jorge González'] },
  { id: '08', category: 'coloquial', utterance: 'Encárgale a Carlos la auditoría de rutas para el lunes', expectedIntent: 'write_request', mustContain: ['Carlos Mendoza'] },
  { id: '09', category: 'coloquial', utterance: 'Que se encargue Jorge de revisar las alertas mecánicas mañana', expectedIntent: 'write_request', mustContain: ['Jorge González'] },
  { id: '10', category: 'coloquial', utterance: 'Apúntalo para mañana revisar compras con proveedor', expectedIntent: 'write_request', mustContain: ['Nueva acción'] },
  { id: '11', category: 'coloquial', utterance: 'Hay que revisar los indicadores semanales el viernes', expectedIntent: 'write_request', mustContain: ['Nueva acción'] },
  { id: '12', category: 'coloquial', utterance: 'Agrégalo al Kanban validar el cierre mensual para el viernes', expectedIntent: 'write_request', mustContain: ['Kanban corporativo'] },
  { id: '13', category: 'coloquial', utterance: 'Que no se nos olvide revisar facturación mañana', expectedIntent: 'write_request', mustContain: ['Nueva acción'] },

  // 3. Errores ortográficos, sin acentos y muletillas
  { id: '14', category: 'typos', utterance: 'Oye porfa crea una acion para revisar compras el vierns', expectedIntent: 'write_request', mustContain: ['Nueva acción'], mustNotContain: ['Oye'] },
  { id: '15', category: 'typos', utterance: 'Fijate que necesito mandale un watsap a Carlos', expectedIntent: 'write_request', mustContain: ['WhatsApp', 'Carlos Mendoza'] },
  { id: '16', category: 'typos', utterance: 'Porfa enviale un coreo a Jorge sobre el cierre', expectedIntent: 'write_request', mustContain: ['Correo electrónico', 'Jorge González'] },
  { id: '17', category: 'typos', utterance: 'Que pendintes tengo vencidos hoy', expectedIntent: 'query_actions' },
  { id: '18', category: 'typos', utterance: 'Donde tenemos blokeos en el equipo', expectedIntent: 'query_actions' },

  // 4. Notas de voz (canal voice)
  { id: '19', category: 'voz', channel: 'voice', utterance: 'Crea una acción para auditar embarques para Carlos el viernes en Kanban corporativo', expectedIntent: 'write_request', mustContain: ['Carlos Mendoza', 'Kanban corporativo'] },
  { id: '20', category: 'voz', channel: 'voice', utterance: 'Oye cómo está mi empresa hoy', expectedIntent: 'executive_brief' },
  { id: '21', category: 'voz', channel: 'voice', utterance: 'Mándale un WhatsApp a Jorge para pedirle estatus', expectedIntent: 'write_request', mustContain: ['WhatsApp', 'Jorge González'] },
  { id: '22', category: 'voz', channel: 'voice', utterance: '¿Qué objetivos corporativos tenemos activos?', expectedIntent: 'query_okrs' },

  // 5. Instrucciones múltiples (compound)
  { id: '23', category: 'multiple', utterance: 'Ponle a Carlos lo del inventario para el viernes, mándale un WhatsApp y dile a Jorge que me entregue el reporte mañana', expectedIntent: 'write_request', minSteps: 3, mustContain: ['Carlos Mendoza', 'WhatsApp', 'Jorge González'] },
  { id: '24', category: 'multiple', utterance: 'Crea una acción para validar calidad para Carlos el viernes y mándale un WhatsApp', expectedIntent: 'write_request', minSteps: 2, mustContain: ['Carlos Mendoza', 'Dependencia'] },
  { id: '25', category: 'multiple', utterance: 'Eso ya quedó, avísale a Dirección', expectedIntent: 'write_request', minSteps: 2, mustContain: ['Hecho', 'Dirección'] },
  { id: '26', category: 'multiple', utterance: 'Reparte estos pendientes entre Carlos y Jorge', expectedIntent: 'write_request', minSteps: 2, mustContain: ['Carlos Mendoza', 'Jorge González'] },

  // 6. Gestión de acciones y referencias contextuales
  { id: '27', category: 'gestion', utterance: 'Lo de Jorge pásalo al lunes', expectedIntent: 'write_request' },
  { id: '28', category: 'gestion', utterance: 'Agrega que estamos esperando al proveedor', expectedIntent: 'write_request' },
  { id: '29', category: 'gestion', utterance: 'Marca como hecho lo del reporte', expectedIntent: 'write_request' },
  { id: '30', category: 'gestion', utterance: 'Registra que estamos bloqueados por falta de refacciones', expectedIntent: 'write_request' },
  { id: '31', category: 'gestion', utterance: 'Verifica esa acción', expectedIntent: 'write_request' },

  // 7. Fechas relativas
  { id: '32', category: 'fechas', utterance: 'Crea una acción para cerrar auditoría para mañana asignada a Carlos', expectedIntent: 'write_request', mustContain: ['Carlos Mendoza'] },
  { id: '33', category: 'fechas', utterance: 'Crea una acción para revisar presupuesto para el lunes asignada a Jorge', expectedIntent: 'write_request', mustContain: ['Jorge González'] },
  { id: '34', category: 'fechas', utterance: 'Crea una acción para reporte operativo para hoy asignada a mí', expectedIntent: 'write_request', mustContain: ['Alonso Pérez'] },

  // 8. Nombres ambiguos
  { id: '35', category: 'ambiguo', utterance: 'Crea una acción para revisar nómina asignada a Ana', expectedIntent: 'write_request', expectedStatus: 'clarification', mustContain: ['Ana Torres', 'Ana Ramírez'] },
  { id: '36', category: 'ambiguo', utterance: 'Mándale un WhatsApp a Ana', expectedIntent: 'write_request', expectedStatus: 'clarification', mustContain: ['Ana Torres', 'Ana Ramírez'] },

  // 9. Comunicaciones WhatsApp
  { id: '37', category: 'whatsapp', utterance: 'Mándale un WhatsApp a Carlos', expectedIntent: 'write_request', mustContain: ['WhatsApp', 'Carlos Mendoza'] },
  { id: '38', category: 'whatsapp', utterance: 'Pregúntale a Carlos cómo va', expectedIntent: 'write_request', mustContain: ['WhatsApp', 'Carlos Mendoza'] },
  { id: '39', category: 'whatsapp', utterance: 'Recuérdale a Jorge lo que tiene pendiente', expectedIntent: 'write_request', mustContain: ['WhatsApp', 'Jorge González'] },
  { id: '40', category: 'whatsapp', utterance: 'Avísale a Dirección que ya quedó', expectedIntent: 'write_request', mustContain: ['Dirección'] },
  { id: '41', category: 'whatsapp', utterance: 'Dile a Jorge que necesito el reporte hoy', expectedIntent: 'write_request', mustContain: ['Jorge González'] },
  { id: '42', category: 'whatsapp', utterance: 'Pídele a Carlos una fecha de compromiso', expectedIntent: 'write_request', mustContain: ['Carlos Mendoza'] },
  { id: '43', category: 'whatsapp', utterance: 'Notifica a los responsables de las vencidas', expectedIntent: 'write_request' },

  // 10. Comunicaciones Correo electrónico
  { id: '44', category: 'correo', utterance: 'Mándale un correo a Carlos', expectedIntent: 'write_request', mustContain: ['Correo electrónico', 'Carlos Mendoza', 'Asunto:'] },
  { id: '45', category: 'correo', utterance: 'Envíale a Dirección el resumen semanal por correo', expectedIntent: 'write_request', mustContain: ['Correo electrónico', 'Dirección'] },
  { id: '46', category: 'correo', utterance: 'Redacta un correo para escalar este bloqueo a Dirección', expectedIntent: 'write_request', mustContain: ['Borrador de Correo electrónico', 'Dirección'] },
  { id: '47', category: 'correo', utterance: 'Envíale por correo a Jorge lo que tiene vencido', expectedIntent: 'write_request', mustContain: ['Correo electrónico', 'Jorge González'] },
  { id: '48', category: 'correo', utterance: 'Comparte los compromisos de la reunión por correo con Dirección', expectedIntent: 'write_request', mustContain: ['Correo electrónico', 'Dirección'] },

  // 11. Instrucciones orientadas a resultados
  { id: '49', category: 'resultados', utterance: 'Necesito que esto avance', expectedIntent: 'recommend_next' },
  { id: '50', category: 'resultados', utterance: 'Ya lleva demasiado tiempo detenido', expectedIntent: 'executive_discipline' },
  { id: '51', category: 'resultados', utterance: 'Quiero que el equipo se ponga al corriente', expectedIntent: 'recommend_next' },
  { id: '52', category: 'resultados', utterance: 'Necesito cerrar los pendientes de esta semana', expectedIntent: 'executive_preventive' },
  { id: '53', category: 'resultados', utterance: 'Que no se nos vuelva a pasar', expectedIntent: 'executive_preventive' },
  { id: '54', category: 'resultados', utterance: 'Necesito llegar preparado a la reunión', expectedIntent: 'executive_review' },

  // 12. Operaciones no disponibles e intentos fuera de permisos
  { id: '55', category: 'seguridad', utterance: 'Ejecuta SQL update acciones_diarias set estado = Hecho', expectedIntent: 'unsupported_write', expectedStatus: 'forbidden' },
  { id: '56', category: 'seguridad', utterance: '¿Cuánto dinero estamos perdiendo por los atrasos?', expectedIntent: 'unsupported_metric' },
  { id: '57', category: 'seguridad', user: R1_USERS.direction, utterance: 'Crea una acción para revisar inventario para Carlos', expectedIntent: 'write_request', expectedStatus: 'forbidden' },
  { id: '58', category: 'seguridad', user: R1_USERS.analyst, utterance: 'Crea una acción para revisar inventario asignada a Carlos', expectedIntent: 'write_request', expectedStatus: 'forbidden' },
  { id: '59', category: 'seguridad', utterance: 'Mándale un WhatsApp a PersonaInexistenteXYZ', expectedIntent: 'write_request', expectedStatus: 'forbidden', mustContain: ['No encontré'] },
  { id: '60', category: 'seguridad', user: R1_USERS.inactive, utterance: '¿Qué tengo pendiente hoy?', expectedIntent: 'unknown', expectedStatus: 'forbidden' },
]

describe('SCRUMBAN — Fast Execution & Conversational Intelligence (Matriz 60 casos)', () => {
  it.each(NATURAL_LANGUAGE_MATRIX)(
    '[$id · $category] "$utterance" -> $expectedIntent',
    async (c) => {
      const { turn, text } = await execTurn(c.utterance, {
        channel: c.channel ?? 'whatsapp',
        user: c.user ?? R1_USERS.superAdmin,
      })
      expect(turn.handled).toBe(true)
      expect(turn.intent).toBe(c.expectedIntent)
      if (c.expectedStatus) {
        expect(turn.response.status).toBe(c.expectedStatus)
      }
      if (c.minSteps) {
        expect(turn.multiIntentPlan?.steps.length ?? 0).toBeGreaterThanOrEqual(c.minSteps)
      }
      for (const snippet of c.mustContain ?? []) {
        expect(text).toContain(snippet)
      }
      for (const forbiddenSnippet of c.mustNotContain ?? []) {
        expect(text).not.toContain(forbiddenSnippet)
      }
      // Nunca exponer jerga técnica ni comandos internos
      expect(text).not.toMatch(/pendingWrite|create_action|runAgentTurn/i)
      // Telemetría real presente para turnos activos
      if (c.user !== R1_USERS.inactive) {
        expect(turn.telemetry).toBeDefined()
        expect(turn.telemetry?.usedLlm).toBe(false)
        expect(turn.telemetry?.totalMs).toBeGreaterThanOrEqual(0)
      }
    }
  )

  it('Contexto conversacional completo (Sección 9): crear → fecha → Carlos → Mejor a Jorge → Y mándale un WhatsApp sin contaminar el título', async () => {
    const db = createR1Db()
    const store = r1Store()

    const t1 = await execTurn('Crea una acción para revisar inventario', { db, store })
    expect(t1.turn.intent).toBe('write_request')
    expect(t1.text).toContain('Título: Revisar inventario')

    const t2 = await execTurn('Para el viernes', { db, store })
    expect(t2.text).toContain('Título: Revisar inventario')
    expect(t2.text).not.toContain('Para el viernes')

    const t3 = await execTurn('Asígnasela a Carlos', { db, store })
    expect(t3.text).toContain('Título: Revisar inventario')
    expect(t3.text).toContain('Responsable: Carlos Mendoza')

    const t4 = await execTurn('Mejor a Jorge', { db, store })
    expect(t4.text).toContain('Título: Revisar inventario')
    expect(t4.text).toContain('Responsable: Jorge González')

    const t5 = await execTurn('Y mándale un WhatsApp', { db, store })
    expect(t5.turn.multiIntentPlan?.steps).toHaveLength(2)
    expect(t5.turn.multiIntentPlan?.steps[0]?.kind).toBe('create_action')
    expect(t5.turn.multiIntentPlan?.steps[0]?.draft?.titulo).toBe('Revisar inventario')
    expect(t5.turn.multiIntentPlan?.steps[0]?.draft?.responsableNombre).toBe('Jorge González')
    expect(t5.turn.multiIntentPlan?.steps[1]?.kind).toBe('send_whatsapp')
    expect(t5.turn.multiIntentPlan?.steps[1]?.dependsOnStepId).toBe('step_1')
    expect(t5.turn.multiIntentPlan?.steps[1]?.recipientName).toBe('Jorge González')
  })

  it('Dependencias y fallo parcial (Sección 4 y 13): bloquea WhatsApp si la creación previa falló e informa fallo parcial con claridad', () => {
    const step1 = { stepId: 'step_1', kind: 'create_action' as const, dependsOnStepId: null, summary: 'Crear acción Inventario' }
    const step2 = { stepId: 'step_2', kind: 'send_whatsapp' as const, dependsOnStepId: 'step_1', summary: 'WhatsApp a Carlos Mendoza' }
    const outcomes = new Map<string, StepExecutionOutcome>([
      ['step_1', { stepId: 'step_1', ok: false, reason: 'Error de permiso' }],
    ])

    const check = canExecuteCompoundStep(step2, outcomes)
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('falló')

    const summary = summarizeCompoundOutcomes(
      { steps: [step1, step2], clarifications: [], forbiddenReasons: [], lockedAfterConfirm: true },
      [
        { stepId: 'step_1', ok: false, reason: 'Error de permiso' },
        { stepId: 'step_2', ok: false, reason: check.reason },
      ]
    )
    expect(summary.allSucceeded).toBe(false)
    expect(summary.text).toContain('Resultado parcial')
    expect(summary.text).not.toContain('Operaciones completadas')
  })

  it('Consulta intermedia durante un borrador NO destruye ni contamina el borrador y permite cancelación limpia', async () => {
    const db = createR1Db()
    const store = r1Store()

    await execTurn('Crea una acción para revisar entregas', { db, store })
    const q = await execTurn('¿Qué tengo pendiente hoy?', { db, store })
    expect(q.turn.intent).toBe('query_actions')

    const follow = await execTurn('Asígnasela a Carlos', { db, store })
    expect(follow.text).toContain('Título: Revisar entregas')
    expect(follow.text).toContain('Responsable: Carlos Mendoza')

    const cancel = await execTurn('Cancela', { db, store })
    expect(cancel.turn.intent).toBe('cancel_write_draft')
  })

  it('Telemetría real p50/p95 medida sobre ejecuciones deterministas (0 llamadas al LLM)', async () => {
    const samples: number[] = []
    for (const c of NATURAL_LANGUAGE_MATRIX.slice(0, 10)) {
      const { turn } = await execTurn(c.utterance, { channel: c.channel ?? 'whatsapp' })
      samples.push(turn.telemetry?.totalMs ?? 0)
    }
    const stats = computeLatencyPercentiles(samples)
    expect(stats.count).toBe(10)
    expect(stats.p50Ms).toBeGreaterThanOrEqual(0)
    expect(stats.p95Ms).toBeGreaterThanOrEqual(stats.p50Ms)
  })
})
