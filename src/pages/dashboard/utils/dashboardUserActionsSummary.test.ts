import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import type { AccionComentario } from '@/types/accionComentario'
import type { UserProfile } from '@/features/users/types/user.types'
import {
  buildAreaActionsSummaryRows,
  buildUserActionsSummaryRows,
  filterUsersWithAssignedArea,
  hasAssignedArea,
  summarizeAreaActionsRows,
  summarizeUserActionsRows,
} from './dashboardUserActionsSummary'

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
    fecha: '2026-07-15',
    titulo_accion: 'Accion',
    descripcion_accion: 'Descripcion',
    responsable: 'otro',
    created_by: 'otro',
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

function comment(partial: Partial<AccionComentario> = {}): AccionComentario {
  return {
    id: partial.id ?? 'c1',
    accion_id: partial.accion_id ?? 'a1',
    contenido: 'Seguimiento',
    created_by: partial.created_by ?? 'otro',
    asignado: partial.asignado ?? null,
    etiquetas: partial.etiquetas ?? [],
    adjuntos: [],
    created_at: partial.created_at ?? '2026-07-15T12:00:00Z',
  }
}

describe('dashboardUserActionsSummary', () => {
  it('hasAssignedArea solo acepta texto no vacio', () => {
    expect(hasAssignedArea({ area: 'Operaciones' })).toBe(true)
    expect(hasAssignedArea({ area: '  RH  ' })).toBe(true)
    expect(hasAssignedArea({ area: null })).toBe(false)
    expect(hasAssignedArea({ area: '' })).toBe(false)
    expect(hasAssignedArea({ area: '   ' })).toBe(false)
  })

  it('filterUsersWithAssignedArea excluye usuarios sin area y respeta filtro de area', () => {
    const users = [
      user({ id: 'u1', nombre: 'Ana', area: 'Operaciones' }),
      user({ id: 'u2', nombre: 'Bob', area: null }),
      user({ id: 'u3', nombre: 'Cara', area: 'RH' }),
    ]

    expect(filterUsersWithAssignedArea(users)).toHaveLength(2)
    expect(filterUsersWithAssignedArea(users, 'rh')).toEqual([
      user({ id: 'u3', nombre: 'Cara', area: 'RH' }),
    ])
  })

  it('buildUserActionsSummaryRows solo incluye usuarios con area asignada', () => {
    const users = [
      user({ id: 'u1', nombre: 'Ana', area: 'Operaciones' }),
      user({ id: 'u2', nombre: 'Bob', area: null }),
    ]

    const rows = buildUserActionsSummaryRows(users, [], [], '2026-06-15')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: 'u1',
      area: 'Operaciones',
      abiertas: 0,
    })
  })

  it('calcula puntos con acciones personales, academia y perfil organizacional', () => {
    const users = [
      user({ id: 'u1', user_id: 'auth-u1', nombre: 'Ana', area: 'Operaciones' }),
    ]
    const acciones = [
      action({
        id: 'own-done',
        responsable: 'u1',
        estado: 'Hecho',
        completed_at: '2026-07-15T16:00:00',
        updated_at: '2026-07-15T16:00:00',
      }),
      action({
        id: 'other-done',
        responsable: 'otro',
        estado: 'Hecho',
        completed_at: '2026-07-15T16:00:00',
        updated_at: '2026-07-15T16:00:00',
      }),
      action({
        id: 'other-overdue',
        responsable: 'otro',
        fecha: '2026-07-01',
      }),
    ]
    const comentarios = [
      comment({ id: 'own-comment', accion_id: 'own-done', created_by: 'u1' }),
      comment({ id: 'other-comment', accion_id: 'other-done', created_by: 'otro' }),
    ]
    const orgScores = new Map([['u1', { profile_complete_points: 15 }]])
    const academyCounts = new Map([['auth-u1', 2]])

    const rows = buildUserActionsSummaryRows(
      users,
      acciones,
      comentarios,
      '2026-07-15',
      undefined,
      orgScores,
      academyCounts
    )

    expect(rows[0].gamificationPoints).toBe(53)
  })

  it('buildAreaActionsSummaryRows agrega metricas por area', () => {
    const rows = buildAreaActionsSummaryRows([
      {
        userId: 'u1',
        nombre: 'Ana',
        area: 'Operaciones',
        abiertas: 3,
        retraso: 1,
        bloqueadas: 0,
        gamificationPoints: 10,
      },
      {
        userId: 'u2',
        nombre: 'Luis',
        area: 'Operaciones',
        abiertas: 2,
        retraso: 0,
        bloqueadas: 1,
        gamificationPoints: 5,
      },
      {
        userId: 'u3',
        nombre: 'Cara',
        area: 'RH',
        abiertas: 1,
        retraso: 0,
        bloqueadas: 0,
        gamificationPoints: 2,
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.area === 'Operaciones')).toMatchObject({
      usuarios: 2,
      abiertas: 5,
      retraso: 1,
      bloqueadas: 1,
      gamificationPoints: 15,
    })
    expect(rows.find((r) => r.area === 'RH')).toMatchObject({
      usuarios: 1,
      abiertas: 1,
      gamificationPoints: 2,
    })
  })

  it('summarizeUserActionsRows agrega totales visibles', () => {
    const totals = summarizeUserActionsRows([
      {
        userId: 'u1',
        nombre: 'Ana',
        area: 'Operaciones',
        abiertas: 3,
        retraso: 1,
        bloqueadas: 0,
        gamificationPoints: 10,
      },
      {
        userId: 'u2',
        nombre: 'Luis',
        area: 'RH',
        abiertas: 2,
        retraso: 0,
        bloqueadas: 1,
        gamificationPoints: 5,
      },
    ])

    expect(totals).toEqual({
      count: 2,
      abiertas: 5,
      retraso: 1,
      bloqueadas: 1,
      gamificationPoints: 15,
    })
  })

  it('summarizeAreaActionsRows agrega totales por area', () => {
    const totals = summarizeAreaActionsRows(buildAreaActionsSummaryRows([
      {
        userId: 'u1',
        nombre: 'Ana',
        area: 'Operaciones',
        abiertas: 2,
        retraso: 1,
        bloqueadas: 0,
        gamificationPoints: 4,
      },
      {
        userId: 'u2',
        nombre: 'Luis',
        area: 'Operaciones',
        abiertas: 1,
        retraso: 0,
        bloqueadas: 1,
        gamificationPoints: 2,
      },
    ]))

    expect(totals).toMatchObject({
      count: 1,
      abiertas: 3,
      retraso: 1,
      bloqueadas: 1,
      gamificationPoints: 6,
    })
  })
})
