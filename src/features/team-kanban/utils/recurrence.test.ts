import { describe, expect, it } from 'vitest'
import { formatRecurrenceLabel, nextOccurrenceDate, upcomingOccurrenceDate } from './recurrence'

describe('nextOccurrenceDate', () => {
  it('avanza al siguiente dia en frecuencia diaria', () => {
    expect(nextOccurrenceDate({ frecuencia_tipo: 'diaria' }, '2026-07-28')).toBe('2026-07-29')
  })

  it('cae en el martes siguiente cuando la serie es semanal', () => {
    const next = nextOccurrenceDate(
      { frecuencia_tipo: 'semanal', frecuencia_dia_semana: 2 },
      '2026-07-28'
    )
    expect(next).toBe('2026-08-04')
  })

  it('respeta el dia del mes y lo recorta a fin de mes', () => {
    expect(nextOccurrenceDate({ frecuencia_tipo: 'mensual', frecuencia_dia_mes: 31 }, '2026-01-31')).toBe(
      '2026-02-28'
    )
  })

  it('genera dos fechas por mes en quincenal', () => {
    const first = nextOccurrenceDate({ frecuencia_tipo: 'quincenal', frecuencia_dia_mes: 5 }, '2026-07-01')
    expect(first).toBe('2026-07-05')
    expect(nextOccurrenceDate({ frecuencia_tipo: 'quincenal', frecuencia_dia_mes: 5 }, first!)).toBe(
      '2026-07-20'
    )
  })

  it('devuelve null sin frecuencia', () => {
    expect(nextOccurrenceDate({ frecuencia_tipo: null }, '2026-07-28')).toBeNull()
  })
})

describe('upcomingOccurrenceDate', () => {
  it('parte de la ultima ocurrencia generada', () => {
    const next = upcomingOccurrenceDate(
      { frecuencia_tipo: 'semanal', frecuencia_dia_semana: 2, ultima_ocurrencia: '2026-07-28' },
      '2026-07-30'
    )
    expect(next).toBe('2026-08-04')
  })

  it('usa el inicio programado cuando la serie aun no genera nada', () => {
    const next = upcomingOccurrenceDate(
      { frecuencia_tipo: 'diaria', frecuencia_inicio: '2026-08-10', ultima_ocurrencia: null },
      '2026-07-28'
    )
    expect(next).toBe('2026-08-10')
  })
})

describe('formatRecurrenceLabel', () => {
  it('describe la frecuencia semanal con el dia', () => {
    expect(formatRecurrenceLabel({ frecuencia_tipo: 'semanal', frecuencia_dia_semana: 2 })).toBe('Semanal Mar')
  })

  it('describe la frecuencia mensual con el dia de referencia', () => {
    expect(formatRecurrenceLabel({ frecuencia_tipo: 'mensual', frecuencia_dia_mes: 10 })).toBe('Mensual dia 10')
  })
})
