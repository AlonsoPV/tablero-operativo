import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccionDiaria } from '@/types'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { kanbanHealthFromAcciones } from '@/features/operations/utils/metricas'
import { calculateCoreMetrics } from '@/pages/dashboard/hooks/useOperationalDashboardMetrics'
import { krProgress, objectivePaceStatus, objectiveProgress } from '@/features/okrs/model'
import { summarizeTeamActions } from '@/features/team-kanban/utils/teamDashboardMetrics'
import {
  isCorporateOverdue,
  isPendingVerification,
  readWasTruncated,
  summarizeCorporateActions,
} from './corporateActionMetrics'

const NOW = new Date('2026-06-05T23:34:00-06:00')
const TODAY = '2026-06-05'

function action(partial: Partial<AccionDiaria> & Pick<AccionDiaria, 'id'>): AccionDiaria {
  return {
    fecha: '2026-06-06',
    titulo_accion: 'Accion',
    descripcion_accion: 'Descripcion',
    responsable: 'u1',
    hora_limite: '17:00',
    evidencia_esperada: '',
    evidencia_cargada: false,
    evidencia_adjunta: null,
    estado: 'Pendiente',
    kpi_afectado: null,
    okr_impactado: null,
    tipo_accion: 'operativa',
    story_points: 0,
    prioridad: 'P2_Media',
    causa_raiz: null,
    responsable_bloqueo: null,
    escalado: false,
    fecha_escalamiento: null,
    notas_escalamiento: null,
    repeticion: false,
    verificador_dato: null,
    verificador_gobierno: null,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    proceso: null,
    area: null,
    cliente_id: null,
    ...partial,
  } as AccionDiaria
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

describe('corporate and OKR metric reconciliation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubEnv('VITE_DEV_FIXED_NOW', '')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('matches dashboard, kanban and the shared summary on the same rows', () => {
    const rows = [
      action({ id: 'open', fecha: '2026-06-06' }),
      action({ id: 'blocked', estado: 'Bloqueado', fecha: '2020-01-01' }),
      action({ id: 'done', estado: 'Hecho', fecha: '2020-01-01', prioridad: 'P1_Critica', prioridad_id: 'p1' }),
      action({ id: 'verified', estado: 'Verificado', fecha: '2020-01-01' }),
      action({ id: 'overdue', fecha: '2020-01-01', hora_limite: '00:00' }),
      action({ id: 'overdue-copy', fecha: '2020-01-01', hora_limite: '00:00' }),
    ]
    const summary = summarizeCorporateActions(
      [...rows, action({ id: 'overdue', fecha: '2020-01-01', hora_limite: '00:00' })],
      { scope: 'organizacion', today: TODAY, now: NOW }
    )
    const health = kanbanHealthFromAcciones(rows, priorities)
    const core = calculateCoreMetrics(rows, [], priorities, [], TODAY)

    expect(summary.total).toBe(6)
    expect(summary.overdue).toBe(health.vencidas)
    expect(summary.blocked).toBe(health.bloqueadas)
    expect(summary.open).toBe(health.abiertas)
    expect(summary.pendingVerification).toBe(1)
    expect(core.overdueActions.map((item) => item.id).sort()).toEqual(['overdue', 'overdue-copy'])
    expect(core.blockedActions).toHaveLength(summary.blocked)
    expect(core.openActions).toHaveLength(summary.open)
    expect(core.pendingVerificationActions.map((item) => item.id)).toEqual(['done'])
    expect(health.rojos).toBe(1)
    expect(isPendingVerification(rows[2])).toBe(true)
    expect(isCorporateOverdue(rows[2], NOW)).toBe(false)
  })

  it('uses the CDMX deadline and keeps blocked out of overdue', () => {
    const morning = new Date('2026-06-05T10:00:00-06:00')
    const sameDay = action({ id: 'today', fecha: TODAY, hora_limite: '17:00' })
    const blocked = action({ id: 'blocked', estado: 'Bloqueado', fecha: '2020-01-01' })
    expect(isCorporateOverdue(sameDay, morning)).toBe(false)
    expect(isCorporateOverdue(sameDay, NOW)).toBe(true)
    expect(isCorporateOverdue(blocked, NOW)).toBe(false)
  })

  it('returns null progress when the KR cannot be measured and keeps a real zero', () => {
    expect(krProgress({ baseline_value: null, target_value: 10, current_value: 4 })).toBeNull()
    expect(krProgress({ baseline_value: 10, target_value: 10, current_value: 10 })).toBeNull()
    expect(krProgress({ baseline_value: 0, target_value: 10, current_value: 5 })).toBe(50)
    expect(krProgress({ baseline_value: 20, target_value: 10, current_value: 15 })).toBe(50)
    expect(krProgress({ baseline_value: 80, target_value: 95, current_value: 80 })).toBe(0)
    expect(
      krProgress({
        baseline_value: null,
        target_value: 10,
        current_value: null,
        computed_progress: 40,
      })
    ).toBe(40)
    expect(
      objectiveProgress([
        { baseline_value: null, target_value: 10, current_value: null },
        { baseline_value: 0, target_value: 10, current_value: 5 },
      ])
    ).toBe(50)
    expect(objectiveProgress([])).toBeNull()
  })

  it('labels pace only from measurable progress and elapsed time', () => {
    const objective = { activo: true, start_date: '2026-06-01', end_date: '2026-06-11' }
    expect(objectivePaceStatus(objective, null, '2026-06-06')).toBe('sin_datos')
    expect(objectivePaceStatus(objective, 10, '2026-06-06')).toBe('bajo_ritmo')
    expect(objectivePaceStatus(objective, 80, '2026-06-06')).toBe('en_ritmo')
  })

  it('does not mix team rows into corporate counts or the reverse', () => {
    const corporate = action({ id: 'corp', fecha: '2020-01-01' })
    const team = {
      id: 'team',
      fecha_limite: '2020-01-01T00:00:00.000Z',
      bloqueada: false,
      completed_at: null,
    }
    const summary = summarizeCorporateActions([corporate], {
      scope: 'organizacion',
      today: TODAY,
      now: NOW,
    })
    const teamSummary = summarizeTeamActions([team, corporate], NOW)
    expect(summary.population).toBe('acciones_corporativas')
    expect(summary.overdue).toBe(1)
    expect(teamSummary.population).toBe('acciones_equipo')
    expect(teamSummary.total).toBe(1)
    expect(teamSummary.overdue).toBe(1)
  })

  it('marks a full read as truncated', () => {
    expect(readWasTruncated(400, 400)).toBe(true)
    expect(readWasTruncated(12, 400)).toBe(false)
    expect(
      summarizeCorporateActions([], {
        scope: 'responsable',
        today: TODAY,
        truncated: true,
      }).truncated
    ).toBe(true)
  })
})
