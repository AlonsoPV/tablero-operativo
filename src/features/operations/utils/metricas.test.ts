import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { kanbanHealthFromAcciones } from './metricas'

function action(partial: Partial<AccionDiaria> & Pick<AccionDiaria, 'id'>): AccionDiaria {
  return {
    fecha: '2099-01-01',
    titulo_accion: 'Accion',
    descripcion_accion: 'Descripcion',
    responsable: 'u1',
    created_by: 'u1',
    updated_by: null,
    hora_limite: '17:00',
    evidencia_esperada: 'Evidencia',
    evidencia_cargada: false,
    evidencia_adjunta: null,
    estado: 'Pendiente',
    kpi_afectado: null,
    gap_id: null,
    tipo_accion: 'operativa',
    story_points: 0,
    catalog_kpi_id: null,
    okr_impactado: null,
    proceso: null,
    area: null,
    cliente_id: null,
    prioridad: 'P2_Media',
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
    created_at: '2026-07-15T10:00:00Z',
    updated_at: '2026-07-15T10:00:00Z',
    sprint_id: null,
    ...partial,
  }
}

const priorities: Priority[] = [
  {
    id: 'p1',
    nombre: 'P1_Critica',
    descripcion: null,
    color: 'rojo',
    activo: true,
    orden: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
]

describe('kanbanHealthFromAcciones', () => {
  it('cuenta abiertas, rojas, vencidas y bloqueadas', () => {
    const metrics = kanbanHealthFromAcciones(
      [
        action({ id: '1', prioridad: 'P1_Critica', prioridad_id: 'p1' }),
        action({ id: '2', estado: 'Bloqueado', fecha: '2020-01-01' }),
        action({ id: '3', estado: 'Hecho' }),
        action({ id: '4', fecha: '2020-01-01', hora_limite: '00:00' }),
      ],
      priorities
    )

    expect(metrics.abiertas).toBe(3)
    expect(metrics.rojos).toBe(1)
    expect(metrics.bloqueadas).toBe(1)
    expect(metrics.vencidas).toBeGreaterThanOrEqual(2)
  })
})
