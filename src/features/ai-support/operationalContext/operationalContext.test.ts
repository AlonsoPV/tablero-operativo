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
    expect(snapshot.counts.open).toBe(4)
    expect(snapshot.counts.overdue).toBeGreaterThan(0)
    expect(snapshot.counts.blocked).toBe(1)
    expect(snapshot.counts.pendingVerification).toBe(1)
    expect(snapshot.counts.teamOverdue).toBe(1)
    expect(snapshot.mine.some((item) => item.titulo === 'Cerrar POD')).toBe(true)
    expect(snapshot.pendingVerification[0]?.titulo).toBe('Checklist calidad')
  })

  it('answers pending questions factually without Gemini', () => {
    const reply = tryFactualAssistantReply('Que tengo pendiente?', snapshot, 'pending')
    expect(reply).toBeTruthy()
    expect(reply?.structured.finding).toContain('abiertas')
    expect(reply?.content).toContain('Hallazgo:')
    expect(reply?.content).toContain('Cerrar POD')
    expect(reply?.structured.record?.title).toBe('Cerrar POD')
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
    const reply = tryFactualAssistantReply(
      'Que esta retrasando al equipo?',
      limited,
      'team_delay'
    )
    expect(reply?.structured.finding).toContain('no tiene vista de tablero completo')
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
