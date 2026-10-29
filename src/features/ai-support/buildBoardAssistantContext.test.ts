import { describe, expect, it } from 'vitest'
import { buildBoardAssistantContext } from './buildBoardAssistantContext'
import type { AccionDiaria } from '@/types'
import type { OkrData } from '@/features/okrs/model'

function action(partial: Partial<AccionDiaria> & Pick<AccionDiaria, 'id' | 'titulo_accion'>): AccionDiaria {
  return {
    fecha: '2026-10-29',
    descripcion_accion: '',
    responsable: 'u1',
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
    area: null,
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
    created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z',
    ...partial,
  }
}

describe('buildBoardAssistantContext', () => {
  it('summarizes open actions without inventing OKR data', () => {
    const payload = buildBoardAssistantContext(
      [
        action({
          id: '1',
          titulo_accion: 'Entregar POD',
          estado: 'Retraso',
          prioridad: 'Critica',
          es_okr: true,
        }),
        action({ id: '2', titulo_accion: 'Revisar inventario', estado: 'Bloqueado' }),
        action({ id: '3', titulo_accion: 'Llamar cliente', estado: 'Hoy' }),
      ],
      [
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
      ],
      null,
      '2026-10-29'
    )

    expect(payload.actions.totalOpen).toBe(3)
    expect(payload.actions.delayed).toBe(1)
    expect(payload.actions.blocked).toBe(1)
    expect(payload.actions.taggedOkr).toBe(1)
    expect(payload.actions.items[0].titulo).toBe('Entregar POD')
    expect(payload.okrs).toBeNull()
  })

  it('summarizes OKRs with missing baselines and without inventing progress', () => {
    const okrData: OkrData = {
      objectives: [
        {
          id: 'o1',
          nombre_okr: 'Mejorar disponibilidad',
          descripcion: null,
          scope: 'team',
          area_id: null,
          owner_user_id: null,
          start_date: '2026-10-01',
          end_date: '2026-12-31',
          activo: true,
          can_manage: true,
        },
      ],
      keyResults: [
        {
          id: 'kr1',
          okr_id: 'o1',
          title: 'Hacer benchmark',
          baseline_value: null,
          target_value: 95,
          current_value: null,
          owner_user_id: null,
          unit: '%',
          metric_type: 'percent',
          can_update: true,
        },
      ],
      initiatives: [
        {
          id: 'i1',
          key_result_id: 'kr1',
          action_id: 'a1',
          team_action_id: null,
        },
      ],
      checkIns: [],
      users: [],
      areas: [],
      can_manage_company: false,
    }

    const payload = buildBoardAssistantContext([], [], okrData, '2026-10-29')
    expect(payload.okrs?.objectives).toBe(1)
    expect(payload.okrs?.items[0].krsWithoutBaseline).toBe(1)
    expect(payload.okrs?.items[0].progress).toBeNull()
    expect(payload.okrs?.items[0].initiativeCount).toBe(1)
  })
})
