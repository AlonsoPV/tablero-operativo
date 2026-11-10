import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildWhatsappReportMessage,
  decideReportAction,
  insufficientExecutiveReport,
  transcriptDepth,
  turnsFromRetellCall,
  verifyRetellSignature,
} from './guideInterviewReport.js'

const REPORT = [
  'REPORTE EJECUTIVO — GUIA',
  '',
  'SITUACION',
  'El equipo no da seguimiento consistente a los bloqueos.',
  '',
  'DIAGNOSTICO',
  '- Los bloqueos se enteran tarde.',
  '- Hay actividades sin verificacion.',
  '',
  'PRIORIDADES',
  '1. Definir prioridades semanales.',
  '2. Seguimiento a bloqueos.',
  '',
  'PROXIMOS PASOS',
  '- Revisar compromisos el viernes.',
].join('\n')

describe('retell interview report', () => {
  it('verifies the webhook signature and rejects a tampered body', () => {
    const body = '{"event":"call_analyzed"}'
    const key = 'retell-test-key'
    const signature = createHmac('sha256', key).update(body).digest('hex')
    expect(verifyRetellSignature(body, key, signature)).toBe(true)
    expect(verifyRetellSignature(`${body} `, key, signature)).toBe(false)
    expect(verifyRetellSignature(body, key, '')).toBe(false)
  })

  it('reads agent and user turns without inventing lines', () => {
    const turns = turnsFromRetellCall({
      transcript_object: [
        { role: 'agent', content: 'Hola' },
        { role: 'user', content: 'El seguimiento del equipo se pierde entre reuniones.' },
        { role: 'tool', content: 'ignorado' },
      ],
    })
    expect(turns).toEqual([
      { role: 'assistant', content: 'Hola' },
      { role: 'user', content: 'El seguimiento del equipo se pierde entre reuniones.' },
    ])
    expect(transcriptDepth(turns)).toBe('ready')
    expect(transcriptDepth([])).toBe('empty')
    expect(transcriptDepth([{ role: 'user', content: 'hola' }])).toBe('thin')
  })

  it('does not generate twice for the same finished call', () => {
    expect(
      decideReportAction({ event: 'call_analyzed', current: 'ready', depth: 'ready', hasJournal: true })
    ).toBe('return_existing')
    expect(
      decideReportAction({
        event: 'call_analyzed',
        current: 'processing',
        depth: 'ready',
        hasJournal: false,
        processingAgeMs: 1000,
      })
    ).toBe('busy')
  })

  it('waits when the transcript is late and marks a short call as insufficient only after analysis', () => {
    expect(
      decideReportAction({ event: 'call_ended', current: 'pending', depth: 'empty', hasJournal: false })
    ).toBe('wait')
    expect(
      decideReportAction({ event: 'call_analyzed', current: 'pending', depth: 'thin', hasJournal: false })
    ).toBe('insufficient')
    expect(
      decideReportAction({ event: 'call_analyzed', current: 'pending', depth: 'ready', hasJournal: false })
    ).toBe('generate')
  })

  it('retries a failed report without treating it as a new interview', () => {
    expect(
      decideReportAction({ event: 'retry', current: 'failed', depth: 'ready', hasJournal: false, processingAgeMs: 0 })
    ).toBe('generate')
    expect(
      decideReportAction({ event: 'retry', current: 'processing', depth: 'ready', hasJournal: false, processingAgeMs: 10 })
    ).toBe('generate')
  })

  it('builds the WhatsApp summary only from the saved report', () => {
    const message = buildWhatsappReportMessage({
      topic: 'Seguimiento del equipo',
      executiveReport: REPORT,
    })
    expect(message).toContain('Seguimiento del equipo')
    expect(message).toContain('Los bloqueos se enteran tarde.')
    expect(message).toContain('1. Definir prioridades semanales.')
    expect(message).toContain('historial de Scrumban')
    expect(message).not.toContain('http')
    expect(message).not.toMatch(/responsable:\s*Ana/i)
  })

  it('states insufficient information instead of filling gaps', () => {
    const report = insufficientExecutiveReport('apenas empezamos')
    expect(report).toContain('Informacion insuficiente')
    expect(report).toContain('apenas empezamos')
    expect(report).not.toContain('PRIORIDADES')
  })
})
