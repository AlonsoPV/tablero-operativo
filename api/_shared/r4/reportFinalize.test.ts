import { describe, expect, it } from 'vitest'
import { createOnceReportFinalizer } from './reportFinalize.js'

describe('R4 once report finalizer', () => {
  it('guarda un solo informe ante doble cierre', () => {
    const finalizer = createOnceReportFinalizer(() => '2026-11-22T12:00:00.000Z')
    const first = finalizer.finalize({ sessionId: 's1', source: 'voice' })
    const second = finalizer.finalize({ sessionId: 's1', source: 'link' })

    expect(first).toEqual({
      ok: true,
      duplicate: false,
      report: {
        sessionId: 's1',
        finalizedAt: '2026-11-22T12:00:00.000Z',
        source: 'voice',
      },
    })
    expect(second.duplicate).toBe(true)
    expect(second.report).toEqual(first.report)
    expect(finalizer.get('s1')?.source).toBe('voice')
  })
})
