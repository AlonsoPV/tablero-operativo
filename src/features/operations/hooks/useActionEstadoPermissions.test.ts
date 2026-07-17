import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import { getActionEstadoPermission } from './useActionEstadoPermissions'

const RESPONSABLE_ID = '11111111-1111-4111-8111-111111111111'
const CREATOR_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ID = '33333333-3333-4333-8333-333333333333'

function accion(overrides: Partial<AccionDiaria> = {}): AccionDiaria {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    fecha: '2026-07-17',
    titulo_accion: 'Accion de prueba',
    descripcion_accion: 'Validar permisos de cierre',
    responsable: RESPONSABLE_ID,
    created_by: CREATOR_ID,
    updated_by: null,
    hora_limite: '18:00',
    evidencia_esperada: 'N/A',
    evidencia_cargada: false,
    evidencia_adjunta: null,
    estado: 'En_Ejecucion',
    kpi_afectado: null,
    gap_id: null,
    tipo_accion: 'operativa',
    story_points: 1,
    catalog_kpi_id: null,
    okr_impactado: null,
    proceso: null,
    area: null,
    cliente_id: null,
    prioridad: 'P2_Media',
    prioridad_id: null,
    causa_raiz: null,
    responsable_bloqueo: null,
    escalado: false,
    fecha_escalamiento: null,
    notas_escalamiento: null,
    repeticion: false,
    verificador_dato: null,
    verificador_gobierno: null,
    completed_at: null,
    completed_by: null,
    verified_at: null,
    verified_by: null,
    created_at: '2026-07-17T12:00:00Z',
    updated_at: '2026-07-17T12:00:00Z',
    sprint_id: null,
    ...overrides,
  }
}

describe('getActionEstadoPermission', () => {
  it('allows an Analista responsible for the action to mark it as Hecho', () => {
    const permission = getActionEstadoPermission(
      { id: RESPONSABLE_ID, rol: 'Analista' },
      accion(),
      'Hecho'
    )

    expect(permission.canChange).toBe(true)
    expect(permission.denialMessage).toBeNull()
  })

  it('does not allow an Analista who is not responsible or creator to mark it as Hecho', () => {
    const permission = getActionEstadoPermission(
      { id: OTHER_ID, rol: 'Analista' },
      accion(),
      'Hecho'
    )

    expect(permission.canChange).toBe(false)
    expect(permission.denialMessage).toContain('Solo el responsable')
  })

  it('keeps an Analista responsible in read-only mode for non-Hecho transitions', () => {
    const permission = getActionEstadoPermission(
      { id: RESPONSABLE_ID, rol: 'Analista' },
      accion(),
      'Verificado'
    )

    expect(permission.canChange).toBe(false)
    expect(permission.denialMessage).toBe('El rol Analista solo puede visualizar sus acciones.')
  })
})
