import { describe, expect, it } from 'vitest'
import { formatGuideBoardContext } from './guideBoardContext'

describe('formatGuideBoardContext', () => {
  it('prioriza retrasos y no inventa OKRs', () => {
    const text = formatGuideBoardContext({
      today: '2026-11-02',
      actions: [
        {
          titulo_accion: 'Cerrar reporte',
          estado: 'Hoy',
          prioridad: 'P2',
          fecha: '2026-11-02',
          hora_limite: '18:00',
        },
        {
          titulo_accion: 'Entrega atrasada',
          estado: 'Retraso',
          prioridad: 'P1',
          fecha: '2026-11-01',
          hora_limite: '12:00',
          es_okr: true,
          okr_impactado: 'OTIF',
        },
      ],
      team: [{ titulo: 'Daily equipo', bloqueada: true, prioridad: 'alta', fecha_limite: '2026-11-02' }],
      okrs: null,
    })

    expect(text).toContain('Hoy: 2026-11-02')
    expect(text).toContain('Retraso: 1')
    expect(text.indexOf('Entrega atrasada')).toBeLessThan(text.indexOf('Cerrar reporte'))
    expect(text).toContain('Kanban de equipos abierto: 1')
    expect(text).toContain('OKRs: no visibles')
    expect(text).toContain('No inventes')
    expect(text).toContain('propone drafts')
  })

  it('lista KRs con id para ligar iniciativas', () => {
    const text = formatGuideBoardContext({
      today: '2026-11-03',
      actions: [],
      team: [],
      okrs: {
        objectives: [{ id: 'okr-1', nombre_okr: 'OTIF nacional', scope: 'company' }],
        keyResults: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            okr_id: 'okr-1',
            title: 'OTIF semanal',
            baseline_value: 80,
            current_value: 82,
          },
        ],
        initiatives: [],
      },
    })
    expect(text).toContain('KRs para ligar iniciativas')
    expect(text).toContain('KR id=11111111-1111-4111-8111-111111111111')
    expect(text).toContain('OTIF semanal')
  })
})
