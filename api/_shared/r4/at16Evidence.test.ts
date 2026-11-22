import { describe, expect, it } from 'vitest'
import { evaluateAt16Evidence } from './at16Evidence.js'

const REPORT = `REPORTE EJECUTIVO — GUIA

SITUACION
Hay 2 acciones vencidas en el alcance del responsable.

DIAGNOSTICO
El retraso viene de un bloqueo sin motivo.

PRIORIDADES
1. Cerrar POD.

PROXIMOS PASOS
Revisar evidencia antes de verificar.`

describe('AT-16 synthetic evidence (SIMULATED)', () => {
  const findings = [
    {
      title: 'Acciones vencidas',
      detail: '2 IDs del tablero',
      evidence: 'verified' as const,
    },
    {
      title: 'Siguiente paso',
      detail: 'Cerrar POD',
      evidence: 'recommendation' as const,
    },
  ]

  it('genera PDF sintético con trazabilidad e informe idempotente para el dueno', () => {
    const result = evaluateAt16Evidence({
      ownerUsuarioId: 'u-owner',
      readerUsuarioId: 'u-owner',
      sessionId: 'sess-16',
      reportStatus: 'pending',
      hasJournal: false,
      executiveReport: REPORT,
      findings,
    })
    expect(result.readable).toBe(true)
    expect(result.decision).toBe('generate')
    expect(result.pdfOk).toBe(true)
    expect(result.pdfLineCount).toBeGreaterThan(4)
    expect(result.reportDuplicate).toBe(true)
    expect(result.firstReportId).toBe('sess-16')
    expect(result.provenance.map((row) => row.label)).toEqual([
      'Confirmado en Scrumban',
      'Sugerencia de Enviardian',
    ])
  })

  it('niega lectura a un actor distinto del dueno', () => {
    const result = evaluateAt16Evidence({
      ownerUsuarioId: 'u-owner',
      readerUsuarioId: 'u-other',
      sessionId: 'sess-16b',
      reportStatus: 'ready',
      hasJournal: true,
      executiveReport: REPORT,
      findings,
    })
    expect(result.readable).toBe(false)
    expect(result.pdfOk).toBe(false)
    expect(result.pdfErrors[0]).toMatch(/permiso/i)
    expect(result.decision).toBe('return_existing')
  })

  it('no inventa PDF si no hay informe almacenado', () => {
    const result = evaluateAt16Evidence({
      ownerUsuarioId: 'u-owner',
      readerUsuarioId: 'u-owner',
      sessionId: 'sess-empty',
      reportStatus: null,
      hasJournal: false,
      executiveReport: '',
      findings,
    })
    expect(result.pdfOk).toBe(false)
    expect(result.pdfErrors.join(' ')).toMatch(/informe almacenado/i)
  })
})
