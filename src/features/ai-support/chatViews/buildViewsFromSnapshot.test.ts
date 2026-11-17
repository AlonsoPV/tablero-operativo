import { describe, expect, it } from 'vitest'
import {
  buildAssistantUiFromSnapshot,
  isBriefCountRequest,
  isListRequest,
} from './buildViewsFromSnapshot'
import type { OperationalSnapshot } from '@/features/ai-support/operationalContext/types'

const snapshot: OperationalSnapshot = {
  fetchedAt: '2026-11-17T18:00:00.000Z',
  today: '2026-11-17',
  viewer: {
    usuarioId: 'u1',
    rol: 'Operativo',
    areas: ['Ops'],
    scope: 'board',
    canSeeOkrs: true,
    canSeeTeam: true,
  },
  counts: {
    open: 2,
    overdue: 1,
    dueThisWeek: 1,
    blocked: 0,
    red: 1,
    stale: 0,
    pendingVerification: 0,
    taggedOkr: 0,
    createdOpen: 2,
    boardOpen: 2,
    teamOverdue: 0,
    teamBlocked: 0,
  },
  mine: [
    {
      id: 'a1',
      titulo: 'Cerrar POD',
      estado: 'Retraso',
      prioridad: 'P1',
      color: 'rojo',
      fecha: '2026-11-01',
      hora: '12:00',
      esOkr: false,
      okrImpactado: '',
      area: 'Ops',
      daysSinceUpdate: 2,
      dueBucket: 'overdue',
      mine: true,
      createdByMe: true,
      responsableId: 'u1',
      responsableNombre: 'Ana',
    },
    {
      id: 'a2',
      titulo: 'Preparar daily',
      estado: 'Hoy',
      prioridad: 'P2',
      color: 'amarillo',
      fecha: '2026-11-17',
      hora: '09:00',
      esOkr: false,
      okrImpactado: '',
      area: 'Ops',
      daysSinceUpdate: 0,
      dueBucket: 'today',
      mine: true,
      createdByMe: false,
      responsableId: 'u1',
      responsableNombre: 'Ana',
    },
  ],
  created: [
    {
      id: 'a1',
      titulo: 'Cerrar POD',
      estado: 'Retraso',
      prioridad: 'P1',
      color: 'rojo',
      fecha: '2026-11-01',
      hora: '12:00',
      esOkr: false,
      okrImpactado: '',
      area: 'Ops',
      daysSinceUpdate: 2,
      dueBucket: 'overdue',
      mine: true,
      createdByMe: true,
      responsableId: 'u1',
      responsableNombre: 'Ana',
    },
    {
      id: 'a3',
      titulo: 'Seguimiento Jorge',
      estado: 'Pendiente',
      prioridad: 'P2',
      color: 'amarillo',
      fecha: '2026-11-10',
      hora: '10:00',
      esOkr: false,
      okrImpactado: '',
      area: 'Ops',
      daysSinceUpdate: 1,
      dueBucket: 'week',
      mine: false,
      createdByMe: true,
      responsableId: 'u2',
      responsableNombre: 'Jorge Perez',
    },
  ],
  boardOpenItems: [
    {
      id: 'a1',
      titulo: 'Cerrar POD',
      estado: 'Retraso',
      prioridad: 'P1',
      color: 'rojo',
      fecha: '2026-11-01',
      hora: '12:00',
      esOkr: false,
      okrImpactado: '',
      area: 'Ops',
      daysSinceUpdate: 2,
      dueBucket: 'overdue',
      mine: true,
      createdByMe: true,
      responsableId: 'u1',
      responsableNombre: 'Ana',
    },
    {
      id: 'a3',
      titulo: 'Seguimiento Jorge',
      estado: 'Pendiente',
      prioridad: 'P2',
      color: 'amarillo',
      fecha: '2026-11-10',
      hora: '10:00',
      esOkr: false,
      okrImpactado: '',
      area: 'Ops',
      daysSinceUpdate: 1,
      dueBucket: 'week',
      mine: false,
      createdByMe: true,
      responsableId: 'u2',
      responsableNombre: 'Jorge Perez',
    },
  ],
  pendingVerification: [],
  teamHot: [],
  board: {
    today: '2026-11-17',
    actions: {
      totalOpen: 2,
      delayed: 1,
      blocked: 0,
      red: 1,
      taggedOkr: 0,
      byEstado: [],
      items: [],
    },
    okrs: {
      visible: true,
      objectives: 2,
      keyResults: 3,
      initiatives: 0,
      items: [
        {
          id: 'o1',
          nombre: 'Disponibilidad',
          scope: 'company',
          periodStatus: 'Activo',
          krCount: 2,
          initiativeCount: 0,
          progress: null,
          krsWithoutBaseline: 1,
        },
        {
          id: 'o2',
          nombre: 'Cultura Scrumban',
          scope: 'team',
          periodStatus: 'Activo',
          krCount: 1,
          initiativeCount: 0,
          progress: 13,
          krsWithoutBaseline: 0,
        },
      ],
    },
  },
}

describe('buildViewsFromSnapshot', () => {
  it('detects list vs brief intents', () => {
    expect(isListRequest('Muestra todas')).toBe(true)
    expect(isListRequest('Cuales estan vencidas?')).toBe(true)
    expect(isBriefCountRequest('Cuantas acciones tengo vencidas?')).toBe(true)
  })

  it('builds brief metrics for count questions', () => {
    const ui = buildAssistantUiFromSnapshot({
      message: 'Cuantas acciones tengo vencidas?',
      snapshot,
      intent: 'pending',
      finding: 'Tienes 1 accion(es) vencida(s) o en retraso.',
    })
    expect(ui.views[0]?.type).toBe('brief')
  })

  it('builds action lists for show-all requests', () => {
    const ui = buildAssistantUiFromSnapshot({
      message: 'Muestra todas',
      snapshot,
      intent: 'general',
      finding: 'Tienes 2 acciones abiertas en tu alcance.',
    })
    const list = ui.views.find((view) => view.type === 'action_list')
    expect(list?.type).toBe('action_list')
    if (list?.type !== 'action_list') throw new Error('expected action_list')
    expect(list.actions.map((row) => row.title)).toEqual(['Cerrar POD', 'Preparar daily'])
    expect(list.total).toBe(2)
  })

  it('lists created-by-me separately from assigned', () => {
    const ui = buildAssistantUiFromSnapshot({
      message: 'las que yo he creado',
      snapshot,
      intent: 'pending',
      finding: 'Tienes 2 accion(es) abiertas que tu creaste.',
    })
    const list = ui.views.find((view) => view.type === 'action_list')
    expect(list?.type).toBe('action_list')
    if (list?.type !== 'action_list') throw new Error('expected action_list')
    expect(list.scope).toMatch(/asignaste|creaste/)
    expect(list.actions.map((row) => row.title)).toEqual(['Cerrar POD', 'Seguimiento Jorge'])
    expect(list.total).toBe(2)
  })

  it('treats he asignado as created_by, not assigned-to-me', () => {
    const ui = buildAssistantUiFromSnapshot({
      message: 'cuales he asignado yo',
      snapshot,
      intent: 'pending',
      finding: 'Tienes 2 accion(es) abiertas que tu asignaste o creaste.',
    })
    const list = ui.views.find((view) => view.type === 'action_list')
    expect(list?.type).toBe('action_list')
    if (list?.type !== 'action_list') throw new Error('expected action_list')
    expect(list.scope).toMatch(/asignaste|creaste/)
    expect(list.actions.some((row) => row.title === 'Seguimiento Jorge')).toBe(true)
  })

  it('lists board open actions and person filters', () => {
    const boardUi = buildAssistantUiFromSnapshot({
      message: 'cuantas acciones en total hay en el tablero',
      snapshot,
      intent: 'general',
      finding: 'En el tablero hay 2 acciones abiertas.',
    })
    expect(boardUi.views[0]?.type).toBe('brief')

    const personUi = buildAssistantUiFromSnapshot({
      message: 'cuales tiene jorge',
      snapshot,
      intent: 'general',
      finding: 'Jorge tiene 1',
    })
    const list = personUi.views.find((view) => view.type === 'action_list')
    expect(list?.type).toBe('action_list')
    if (list?.type !== 'action_list') throw new Error('expected action_list')
    expect(list.actions.map((row) => row.title)).toEqual(['Seguimiento Jorge'])
  })

  it('resolves bare enlistalas after a board question', () => {
    const ui = buildAssistantUiFromSnapshot({
      message: 'enlistalas',
      snapshot,
      intent: 'general',
      finding: 'En el tablero hay 2 acciones abiertas.',
      priorUserMessages: ['cuantas acciones en total hay en el tablero'],
    })
    const list = ui.views.find((view) => view.type === 'action_list')
    expect(list?.type).toBe('action_list')
    if (list?.type !== 'action_list') throw new Error('expected action_list')
    expect(list.scope).toContain('tablero')
    expect(list.total).toBe(2)
  })

  it('keeps null OKR progress instead of 0%', () => {
    const ui = buildAssistantUiFromSnapshot({
      message: 'Como van mis OKRs?',
      snapshot,
      intent: 'okrs',
      finding: 'Tienes acceso a 2 objetivos',
    })
    const list = ui.views.find((view) => view.type === 'okr_list')
    expect(list?.type).toBe('okr_list')
    if (list?.type !== 'okr_list') throw new Error('expected okr_list')
    expect(list.okrs[0]?.progress).toBeNull()
    expect(list.okrs[0]?.href).toContain('objective=o1')
  })

  it('filters team OKRs when the user asks for equipo', () => {
    const ui = buildAssistantUiFromSnapshot({
      message: 'que OKRs de equipo tengo abiertos',
      snapshot,
      intent: 'okrs',
      finding: 'Tienes 1 OKR(s) de equipo.',
    })
    const list = ui.views.find((view) => view.type === 'okr_list')
    expect(list?.type).toBe('okr_list')
    if (list?.type !== 'okr_list') throw new Error('expected okr_list')
    expect(list.okrs.map((row) => row.id)).toEqual(['o2'])
    expect(list.okrs[0]?.scope).toBe('team')
    expect(list.scope).toContain('equipo')
  })
})
