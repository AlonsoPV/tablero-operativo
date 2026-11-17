import { describe, expect, it } from 'vitest'
import {
  humanizeVerifiedLine,
  looksTechnicalText,
  partitionTechnicalFromList,
  sanitizeFindings,
  stripToolNamePrefix,
} from './guideReportSanitize'

describe('guideReportSanitize', () => {
  it('strips tool prefixes from executive titles', () => {
    expect(stripToolNamePrefix('get_okr_progress: Capacidad Flexible 81%')).toBe('Capacidad Flexible 81%')
    expect(humanizeVerifiedLine('get_okr_progress', 'Capacidad Flexible 81%')).toBe('Capacidad Flexible 81%')
  })

  it('detects technical narratives', () => {
    expect(looksTechnicalText('PERMISSION_DENIED al confirmar')).toBe(true)
    expect(looksTechnicalText('Capacidad Flexible registra avance')).toBe(false)
  })

  it('partitions recommendations vs technical attention', () => {
    const { business, technical } = partitionTechnicalFromList([
      'Revisar OTIF con el equipo',
      'get_okr_progress: timeout',
      'PERMISSION_DENIED en envio',
    ])
    expect(business).toEqual(['Revisar OTIF con el equipo'])
    expect(technical.length).toBe(2)
  })

  it('sanitizes findings list', () => {
    const { findings, technical } = sanitizeFindings([
      { title: 'get_okr_progress: CAJA SIN FRICCION', detail: 'timeout', evidence: 'said' },
      { title: 'Avance', detail: 'Capacidad Flexible 81%', evidence: 'verified' },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toMatch(/Capacidad Flexible/)
    expect(technical.length).toBe(1)
  })
})
