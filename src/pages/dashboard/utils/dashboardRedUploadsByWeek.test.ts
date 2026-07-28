import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import type { UserProfile } from '@/features/users/types/user.types'
import { buildRedUploadsByWeek, buildRedWeekBuckets } from './dashboardRedUploadsByWeek'

function user(partial: Partial<UserProfile> & Pick<UserProfile, 'id' | 'nombre'>): UserProfile {
  return {
    user_id: partial.id,
    rol: 'Operativo',
    area: null,
    activo: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...partial,
  }
}

function action(partial: Partial<AccionDiaria> & Pick<AccionDiaria, 'id'>): AccionDiaria {
  return {
    fecha: '2026-07-20',
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
    prioridad: 'P1_Critica',
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
    created_at: '2026-07-22T16:00:00Z',
    updated_at: '2026-07-22T16:00:00Z',
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
  {
    id: 'p2',
    nombre: 'P2_Media',
    descripcion: null,
    color: 'amarillo',
    activo: true,
    orden: 2,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
]

describe('dashboardRedUploadsByWeek', () => {
  it('genera ocho semanas terminando en la semana actual', () => {
    const weeks = buildRedWeekBuckets('2026-07-22', 8)
    expect(weeks).toHaveLength(8)
    expect(weeks.at(-1)?.weekStart).toBe('2026-07-20')
    expect(weeks[0]?.weekStart).toBe('2026-06-01')
  })

  it('agrupa rojos creados por usuario y semana, ignorando no rojos', () => {
    const result = buildRedUploadsByWeek({
      today: '2026-07-22',
      weekCount: 2,
      users: [
        user({ id: 'u1', nombre: 'Ana', area: 'Operaciones' }),
        user({ id: 'u2', nombre: 'Luis', area: 'RH' }),
      ],
      priorities,
      actions: [
        action({
          id: 'r1',
          created_by: 'u1',
          prioridad: 'P1_Critica',
          prioridad_id: 'p1',
          created_at: '2026-07-21T15:00:00Z',
        }),
        action({
          id: 'r2',
          created_by: 'u1',
          prioridad: 'P1_Critica',
          prioridad_id: 'p1',
          created_at: '2026-07-14T15:00:00Z',
        }),
        action({
          id: 'r3',
          created_by: 'u2',
          prioridad: 'P1_Critica',
          prioridad_id: 'p1',
          created_at: '2026-07-22T12:00:00Z',
        }),
        action({
          id: 'y1',
          created_by: 'u1',
          prioridad: 'P2_Media',
          prioridad_id: 'p2',
          created_at: '2026-07-22T12:00:00Z',
        }),
      ],
    })

    expect(result.grandTotal).toBe(3)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ userId: 'u1', total: 2 })
    expect(result.rows[0].weeks['2026-07-20']?.count).toBe(1)
    expect(result.rows[0].weeks['2026-07-13']?.count).toBe(1)
    expect(result.rows[1]).toMatchObject({ userId: 'u2', total: 1 })
    expect(result.weekTotals['2026-07-20']).toBe(2)
  })
})
