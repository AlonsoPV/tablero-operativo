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
  })
})
