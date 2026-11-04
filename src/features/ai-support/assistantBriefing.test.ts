import { describe, expect, it } from 'vitest'
import {
  buildAssistantBriefing,
  buildAssistantQuickActions,
  formatStructuredReplyContent,
} from './assistantBriefing'
import { buildOperationalSnapshot } from './operationalContext/buildOperationalSnapshot'
import type { AccionDiaria } from '@/types'

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

describe('assistantBriefing', () => {
  const snapshot = buildOperationalSnapshot({
    usuarioId: 'u1',
    rol: 'Operativo',
    areas: ['Operaciones'],
    seesAllBoard: false,
    canSeeOkrs: true,
    openActions: [
      action({
        id: 'a1',
        titulo_accion: 'Cerrar POD',
        responsable: 'u1',
        estado: 'Retraso',
        fecha: '2026-11-01',
      }),
      action({
        id: 'a2',
        titulo_accion: 'Inventario',
        responsable: 'u1',
        estado: 'Bloqueado',
        fecha: '2026-11-04',
      }),
    ],
    pendingVerificationActions: [
      action({
        id: 'a3',
        titulo_accion: 'Checklist',
        responsable: 'u1',
        estado: 'Hecho',
        verificador_dato: 'u1',
      }),
    ],
    priorities: [],
    okrData: null,
    today: '2026-11-03',
    fetchedAt: '2026-11-03T18:00:00.000Z',
  })

  it('builds a contextual greeting with real priority', () => {
    const briefing = buildAssistantBriefing({
      userName: 'Ana Perez',
      snapshot,
    })
    expect(briefing.greeting).toBe('Hola, Ana.')
    expect(briefing.summary).toContain('abiertas')
    expect(briefing.priorityTitle).toBe('Cerrar POD')
    expect(briefing.priorityRecord?.href).toContain('accion=a1')
  })

  it('exposes only actionable quick actions', () => {
    const actions = buildAssistantQuickActions({ snapshot, canSeeOkrs: true })
    expect(actions.map((item) => item.id)).toEqual([
      'priorities',
      'blocked',
      'verification',
      'daily',
      'okrs',
      'create',
    ])
    expect(actions.find((item) => item.id === 'blocked')?.disabled).toBe(false)
    expect(actions.find((item) => item.id === 'create')?.mode).toBe('create')
  })

  it('formats structured replies without markdown', () => {
    const text = formatStructuredReplyContent({
      finding: 'Hay 1 bloqueo',
      evidence: 'Inventario',
      recommendation: 'Desbloquear',
      nextAction: 'Abrir Inventario',
    })
    expect(text).toContain('Hallazgo:')
    expect(text).toContain('Evidencia:')
    expect(text).not.toContain('*')
  })
})
