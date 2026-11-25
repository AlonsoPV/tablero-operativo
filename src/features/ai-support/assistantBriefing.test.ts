import { describe, expect, it } from 'vitest'
import {
  buildAssistantBriefing,
  buildAssistantQuickActions,
  formatStructuredReplyContent,
  resolveAssistantAudience,
  type AssistantAudience,
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
    expect(briefing.summary).toContain('Mis acciones')
    expect(briefing.scopeKind).toBe('personal')
    expect(briefing.indicators.length).toBeGreaterThan(0)
    expect(briefing.indicators.length).toBeLessThanOrEqual(3)
    expect(briefing.priorityTitle).toBe('Cerrar POD')
    expect(briefing.priorityRecord?.href).toContain('accion=a1')
  })

  it('Dirección uses organizational board counts, not a personal zero', () => {
    const org = buildOperationalSnapshot({
      usuarioId: 'u-dir',
      rol: 'Direccion',
      areas: ['Direccion'],
      seesAllBoard: true,
      canSeeOkrs: true,
      openActions: [
        action({
          id: 'a9',
          titulo_accion: 'Ruta OTIF',
          responsable: 'u1',
          estado: 'Retraso',
          fecha: '2026-11-01',
        }),
      ],
      pendingVerificationActions: [],
      priorities: [],
      okrData: null,
      today: '2026-11-03',
      fetchedAt: '2026-11-03T18:00:00.000Z',
    })
    const briefing = buildAssistantBriefing({
      userName: 'Diego',
      snapshot: org,
      audience: 'direccion',
    })
    expect(briefing.scopeKind).toBe('organization')
    expect(briefing.scopeLabel).toBe('Operación de la empresa')
    expect(briefing.summary).toContain('Operación de la empresa')
    expect(briefing.summary).toMatch(/1 abiertas/)
    expect(briefing.summary).toMatch(/Tus acciones asignadas: 0/)
    expect(briefing.indicators[0]?.value).toBe(1)
    expect(briefing.indicators.length).toBeLessThanOrEqual(3)
  })

  it('picks four quick actions per role', () => {
    const ids = (audience: AssistantAudience, canSeeOkrs = true) =>
      buildAssistantQuickActions({ audience, canSeeOkrs }).map((item) => item.id)
    expect(ids('operativo')).toEqual(['priorities', 'daily', 'blocked', 'verification'])
    expect(ids('lider')).toEqual(['team', 'team_overdue', 'verification', 'okrs'])
    expect(ids('direccion')).toEqual(['executive', 'risks', 'okr_results', 'decisions'])
    expect(ids('lider', false)).not.toContain('okrs')
    expect(ids('direccion', false)).not.toContain('okr_results')
    expect(new Set(ids('lider', false)).size).toBe(4)
  })

  it('never grants team content without board scope', () => {
    expect(resolveAssistantAudience({ isDirection: true, isLeader: false, canSeeTeam: false })).toBe(
      'operativo'
    )
    expect(resolveAssistantAudience({ isDirection: false, isLeader: true, canSeeTeam: true })).toBe(
      'lider'
    )
    expect(resolveAssistantAudience({ isDirection: true, isLeader: false, canSeeTeam: true })).toBe(
      'direccion'
    )
  })

  it('fails loudly when the page omits audience (H-05 AppErrorBoundary .map)', () => {
    expect(() =>
      buildAssistantQuickActions({
        audience: undefined as unknown as AssistantAudience,
        canSeeOkrs: true,
      })
    ).toThrow(/audience de asistente no soportado/)
  })

  it('Dirección with board scope gets executive actions, not a crash', () => {
    const audience = resolveAssistantAudience({
      isDirection: true,
      isLeader: false,
      canSeeTeam: true,
    })
    const actions = buildAssistantQuickActions({ audience, canSeeOkrs: true })
    expect(actions.map((item) => item.id)).toEqual(['executive', 'risks', 'okr_results', 'decisions'])
    expect(actions.every((item) => item.label && item.prompt)).toBe(true)
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
