import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import type { OkrData } from '@/features/okrs/model'
import { sanitizeBoardContext } from '@/lib/assistantPrompts'
import { buildOperationalSnapshot } from './buildOperationalSnapshot'
import { sliceContextForIntent } from './sliceContextForIntent'
import { tryFactualAssistantReply } from './tryFactualAssistantReply'
import { estimateContextChars, estimateTokensFromChars } from './estimateTokens'

function action(
  partial: Partial<AccionDiaria> & Pick<AccionDiaria, 'id' | 'titulo_accion' | 'responsable'>
): AccionDiaria {
  return {
    fecha: '2026-11-03',
    descripcion_accion: '',
    hora_limite: '18:00',
    evidencia_esperada: '',
    evidencia_cargada: false,
    evidencia_adjunta: null,
    estado: 'Hoy',
    kpi_afectado: null,
    tipo_accion: 'operativa',
    story_points: 1,
    okr_impactado: null,
    proceso: null,
    area: 'Operaciones',
    cliente_id: null,
    prioridad: 'P2',
    causa_raiz: null,
    responsable_bloqueo: null,
    escalado: false,
    fecha_escalamiento: null,
    notas_escalamiento: null,
    repeticion: false,
    verificador_dato: null,
    verificador_gobierno: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...partial,
  }
}

const priorities = [
  {
    id: 'p1',
    nombre: 'Critica',
    descripcion: null,
    color: '#ef4444',
    orden: 1,
    activo: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
]

const okrData: OkrData = {
  objectives: [
    {
      id: 'o1',
      nombre_okr: 'Disponibilidad',
      descripcion: null,
      scope: 'company',
      area_id: null,
      owner_user_id: 'u1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      activo: true,
      can_manage: true,
    },
  ],
  keyResults: [
    {
      id: 'kr1',
      okr_id: 'o1',
      title: 'OTIF',
      baseline_value: null,
      target_value: 95,
      current_value: null,
      owner_user_id: null,
      unit: '%',
      metric_type: 'percent',
      can_update: true,
    },
  ],
  initiatives: [],
  checkIns: [],
  users: [],
  areas: [],
  can_manage_company: false,
}

describe('operational assistant context', () => {
  const nowMs = Date.parse('2026-11-03T18:00:00Z')

  const snapshot = buildOperationalSnapshot({
    usuarioId: 'u1',
    rol: 'Operativo',
    areas: ['Operaciones'],
    seesAllBoard: true,
    canSeeOkrs: true,
    openActions: [
      action({
        id: '1',
        titulo_accion: 'Cerrar POD',
        responsable: 'u1',
        estado: 'Retraso',
        prioridad: 'Critica',
        fecha: '2026-11-01',
        updated_at: '2026-10-20T00:00:00Z',
      }),
      action({
        id: '2',
        titulo_accion: 'Inventario ciclo',
        responsable: 'u1',
        estado: 'Bloqueado',
        fecha: '2026-11-05',
      }),
      action({
        id: '3',
        titulo_accion: 'Ruta externa',
        responsable: 'u2',
        estado: 'Retraso',
        fecha: '2026-10-30',
      }),
      action({
        id: '4',
        titulo_accion: 'Plan semana',
        responsable: 'u1',
        estado: 'Pendiente',
        fecha: '2026-11-06',
        updated_at: '2026-11-03T12:00:00Z',
      }),
    ],
    pendingVerificationActions: [
      action({
        id: '5',
        titulo_accion: 'Checklist calidad',
        responsable: 'u1',
        estado: 'Hecho',
        verificador_dato: 'u1',
        fecha: '2026-11-02',
      }),
    ],
    priorities,
    okrData,
    today: '2026-11-03',
    fetchedAt: '2026-11-03T18:00:00.000Z',
    nowMs,
  })

  it('builds role-aware counts without inventing records', () => {
    // Conteos personales = asignadas al viewer; boardOpen conserva el tablero.
    expect(snapshot.counts.open).toBe(3)
    expect(snapshot.counts.boardOpen).toBe(4)
    expect(snapshot.counts.overdue).toBeGreaterThan(0)
    expect(snapshot.counts.blocked).toBe(1)
    expect(snapshot.counts.pendingVerification).toBe(1)
    expect(snapshot.counts.teamOverdue).toBe(1)
    expect(snapshot.mine.some((item) => item.titulo === 'Cerrar POD')).toBe(true)
    expect(snapshot.mine.some((item) => item.titulo === 'Ruta externa')).toBe(false)
    expect(snapshot.pendingVerification[0]?.titulo).toBe('Checklist calidad')
  })

  it('answers red-list questions with personal counts matching the list', () => {
    const reply = tryFactualAssistantReply(
      'Puedes enlistar las acciones en rojo que tengo',
      snapshot,
      'pending'
    )
    expect(reply?.structured.finding).toContain(`${snapshot.counts.red}`)
    const list = reply?.ui.views.find((view) => view.type === 'action_list')
    expect(list?.type).toBe('action_list')
    if (list?.type !== 'action_list') throw new Error('expected action_list')
    expect(list.total).toBe(snapshot.counts.red)
    expect(list.actions.length).toBe(snapshot.counts.red)
  })

  it('answers assigned-by-me and board totals without collapsing to mine', () => {
    const named = buildOperationalSnapshot({
      usuarioId: 'u1',
      rol: 'Operativo',
      areas: ['Operaciones'],
      seesAllBoard: true,
      canSeeOkrs: false,
      openActions: [
        action({
          id: '1',
          titulo_accion: 'Mia',
          responsable: 'u1',
          created_by: 'u1',
          estado: 'Pendiente',
          fecha: '2026-11-01',
        }),
        action({
          id: '2',
          titulo_accion: 'De Jorge',
          responsable: 'u2',
          created_by: 'u1',
          estado: 'Pendiente',
          fecha: '2026-11-02',
        }),
        action({
          id: '3',
          titulo_accion: 'Ajena',
          responsable: 'u3',
          created_by: 'u3',
          estado: 'Pendiente',
          fecha: '2026-11-03',
        }),
      ],
      priorities: [],
      okrData: null,
      today: '2026-11-03',
      nowMs,
      usuarioNombreById: {
        u1: 'Ana',
        u2: 'Jorge Perez',
        u3: 'Lucia',
      },
    })

    const assignedByMe = tryFactualAssistantReply('cuales he asignado yo', named, 'pending')
    expect(assignedByMe?.structured.finding).toContain('2')
    const createdList = assignedByMe?.ui.views.find((view) => view.type === 'action_list')
    expect(createdList?.type).toBe('action_list')
    if (createdList?.type !== 'action_list') throw new Error('expected action_list')
    expect(createdList.actions.map((row) => row.title).sort()).toEqual(['De Jorge', 'Mia'])

    const board = tryFactualAssistantReply(
      'cuantas acciones en total hay en el tablero',
      named,
      'general'
    )
    expect(board?.structured.finding).toContain('3')

    const followUp = tryFactualAssistantReply('enlistalas', named, 'general', {
      priorUserMessages: ['cuantas acciones en total hay en el tablero'],
    })
    const boardList = followUp?.ui.views.find((view) => view.type === 'action_list')
    expect(boardList?.type).toBe('action_list')
    if (boardList?.type !== 'action_list') throw new Error('expected action_list')
    expect(boardList.total).toBe(3)

    const jorge = tryFactualAssistantReply('cuales tiene jorge', named, 'general')
    const jorgeList = jorge?.ui.views.find((view) => view.type === 'action_list')
    expect(jorgeList?.type).toBe('action_list')
    if (jorgeList?.type !== 'action_list') throw new Error('expected action_list')
    expect(jorgeList.actions.map((row) => row.title)).toEqual(['De Jorge'])
  })

  it('answers pending questions factually without Gemini', () => {
    const reply = tryFactualAssistantReply('Que tengo pendiente?', snapshot, 'pending')
    expect(reply).toBeTruthy()
    expect(reply?.structured.finding).toContain('abiertas')
    expect(reply?.content).toContain('Hallazgo:')
    expect(reply?.content).toContain('Cerrar POD')
    expect(reply?.structured.record?.title).toBe('Cerrar POD')
    expect(reply?.ui.views.some((view) => view.type === 'action_list' || view.type === 'brief' || view.type === 'operational_summary')).toBe(
      true
    )
  })

  it('answers OKR list questions with structured cards and no Hallazgo wall', () => {
    const reply = tryFactualAssistantReply('Que OKRs tengo', snapshot, 'okrs')
    expect(reply).toBeTruthy()
    expect(reply?.content).not.toMatch(/Hallazgo:|Evidencia:/)
    expect(reply?.content).toMatch(/OKR/i)
    const list = reply?.ui.views.find((view) => view.type === 'okr_list')
    expect(list?.type).toBe('okr_list')
  })

  it('answers list requests with structured action rows', () => {
    const reply = tryFactualAssistantReply('Muestra todas', snapshot, 'general')
    expect(reply).toBeTruthy()
    const list = reply?.ui.views.find((view) => view.type === 'action_list')
    expect(list?.type).toBe('action_list')
    if (list?.type !== 'action_list') throw new Error('expected action_list')
    expect(list.actions.length).toBeGreaterThan(0)
    expect(list.actions[0]?.href).toContain('accion=')
    expect(list.total).toBe(list.actions.length)
  })

  it('answers overdue count as a brief metric', () => {
    const reply = tryFactualAssistantReply('Cuantas acciones tengo vencidas?', snapshot, 'pending')
    expect(reply).toBeTruthy()
    expect(reply?.ui.views.some((view) => view.type === 'brief' || view.type === 'action_list')).toBe(
      true
    )
  })

  it('refuses team delay facts for users without board scope', () => {
    const limited = buildOperationalSnapshot({
      usuarioId: 'u1',
      rol: 'Operativo',
      areas: ['Operaciones'],
      seesAllBoard: false,
      canSeeOkrs: false,
      openActions: [
        action({
          id: '1',
          titulo_accion: 'Cerrar POD',
          responsable: 'u1',
          estado: 'Retraso',
          fecha: '2026-11-01',
        }),
      ],
      pendingVerificationActions: [],
      priorities,
      okrData: null,
      today: '2026-11-03',
      nowMs,
    })
    expect(limited.viewer.scope).toBe('own')
    expect(limited.counts.teamOverdue).toBe(0)
    expect(limited.truncated).toBe(false)
    const reply = tryFactualAssistantReply(
      'Que esta retrasando al equipo?',
      limited,
      'team_delay'
    )
    expect(reply?.structured.finding).toContain('no tiene vista de tablero completo')
  })

  it('marks a truncated operational list instead of treating it as complete', () => {
    const marked = buildOperationalSnapshot({
      usuarioId: 'u1',
      rol: 'Operativo',
      areas: ['Operaciones'],
      seesAllBoard: false,
      canSeeOkrs: false,
      openActions: [],
      listsTruncated: true,
      priorities,
      okrData: null,
      today: '2026-11-03',
      nowMs,
    })
    expect(marked.truncated).toBe(true)
  })

  it('breaks urgency ties in favor of OKR-linked actions', () => {
    const ranked = buildOperationalSnapshot({
      usuarioId: 'u1',
      rol: 'Operativo',
      areas: ['Operaciones'],
      seesAllBoard: false,
      canSeeOkrs: true,
      openActions: [
        action({ id: 'plain', titulo_accion: 'Sin OKR', responsable: 'u1', estado: 'Bloqueado', fecha: '2026-11-05' }),
        action({ id: 'okr', titulo_accion: 'Con OKR', responsable: 'u1', estado: 'Bloqueado', fecha: '2026-11-06', es_okr: true }),
        action({ id: 'late', titulo_accion: 'Retraso', responsable: 'u1', estado: 'Retraso', fecha: '2026-11-01' }),
      ],
      priorities: [],
      okrData: null,
      today: '2026-11-03',
      nowMs,
    })
    expect(ranked.mine.map((item) => item.id)).toEqual(['late', 'okr', 'plain'])
  })

  it('reduces tokens when slicing focused intents vs full board payload', () => {
    // Antes: tablero completo + OKRs siempre (proxy del envio previo).
    const beforePayload = {
      board: snapshot.board,
      mine: snapshot.mine,
      teamHot: snapshot.teamHot,
      pendingVerification: snapshot.pendingVerification,
    }
    const beforeChars = estimateContextChars(beforePayload)
    const beforeTokens = estimateTokensFromChars(beforeChars)

    const pending = sliceContextForIntent(snapshot, 'pending')
    const okrs = sliceContextForIntent(snapshot, 'okrs')
    const focused = sliceContextForIntent(snapshot, 'selected_action', {
      hasExplicitFocus: true,
    })

    // Despues: pending sin OKRs; foco explicito mucho mas chico; okrs mantiene objetivos.
    expect(pending.boardContext?.okrs).toBeNull()
    expect(okrs.includeOkrs).toBe(true)
    expect(focused.tokenEstimate.approxTokens).toBeLessThan(beforeTokens)
    expect(pending.tokenEstimate.approxTokens).toBeLessThan(beforeTokens)
    // Ahorro tipico en preguntas con accion seleccionada: >40% vs snapshot completo.
    expect(focused.tokenEstimate.approxTokens / beforeTokens).toBeLessThan(0.6)

    const sanitized = sanitizeBoardContext(pending.boardContext)
    expect(sanitized).toContain('Datos consultados')
    expect(sanitized).toContain('Usuario alcance')
  })
})
