import { describe, expect, it } from 'vitest'
import {
  formatCreatedWorkReply,
  formatExecutiveReport,
  guideOpening,
  guideWorkInstructions,
  inferGuideWorkIntent,
  parseExecutiveReport,
  parseGuideWorkDrafts,
  withWorkInInterpretation,
} from './guideWork'

describe('guideWork', () => {
  it('parsea drafts de accion e iniciativa y descarta titulos vacios', () => {
    const drafts = parseGuideWorkDrafts([
      { title: 'ab' },
      {
        title: 'Cerrar OTIF de la ruta norte',
        description: 'Alinear evidencias de entrega',
        objective: 'Subir OTIF',
        evidenceExpected: 'Corte semanal',
        priority: 'P1_Alta',
        activities: ['Revisar incidencias', 'x'],
        kind: 'initiative',
        keyResultId: '11111111-1111-4111-8111-111111111111',
        keyResultTitle: 'OTIF semanal',
      },
    ])
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.kind).toBe('initiative')
    expect(drafts[0]?.priority).toBe('P1_Alta')
    expect(drafts[0]?.activities).toEqual(['Revisar incidencias'])
    expect(drafts[0]?.dueDateHint).toBeNull()
  })

  it('arma reporte ejecutivo y menciona el trabajo creado', () => {
    const report = parseExecutiveReport({
      situation: 'Hay retraso en evidencias.',
      diagnosis: 'Falta un dueño unico.',
      priorities: ['Cerrar evidencias de OTIF'],
      decisions: ['Crear iniciativa de corte semanal'],
      nextSteps: ['Publicar el corte el viernes'],
    })
    const text = formatExecutiveReport(report, {}, [
      {
        kind: 'initiative',
        id: 'a1',
        title: 'Corte OTIF semanal',
        keyResultTitle: 'OTIF semanal',
      },
    ])
    expect(text).toContain('REPORTE EJECUTIVO')
    expect(text).toContain('SITUACION')
    expect(text).toContain('TRABAJO CREADO')
    expect(text).toContain('Corte OTIF semanal')
  })

  it('pone los borradores para aprobar en el reporte', () => {
    const text = formatExecutiveReport(
      { situation: 'Hay retraso.', diagnosis: '', priorities: [], decisions: [], nextSteps: [] },
      {},
      [],
      [
        {
          title: 'Cerrar evidencias OTIF',
          description: 'Cerrar evidencias',
          objective: '',
          evidenceExpected: '',
          priority: 'P2_Media',
          activities: [],
          kind: 'action',
          keyResultId: null,
          keyResultTitle: null,
          dueDateHint: '2026-11-07',
          ownerHint: null,
        },
      ]
    )
    expect(text).toContain('PARA APROBAR')
    expect(text).toContain('Cerrar evidencias OTIF')
    expect(text).not.toContain('TRABAJO CREADO')
  })

  it('confirma el resultado en la interpretacion', () => {
    const created = [
      { kind: 'action' as const, id: '1', title: 'Llamar al cliente' },
    ]
    expect(formatCreatedWorkReply(created)).toContain('Llamar al cliente')
    expect(withWorkInInterpretation('Hablo de foco.', created)).toContain('Quedo en el tablero')
  })

  it('usa una sola instruccion que detecta crear en la conversacion', () => {
    expect(guideOpening('create')).toMatch(/tablero/i)
    expect(guideWorkInstructions('create')).toMatch(/No pidas que elijan/i)
    expect(guideWorkInstructions('consult')).toMatch(/arma UNA accion/i)
    expect(guideWorkInstructions()).toMatch(/queue_workspace_draft/)
    expect(guideWorkInstructions()).toMatch(/No envies el correo/)
  })

  it('infiere crear desde habla natural y deja consultar las preguntas del tablero', () => {
    expect(inferGuideWorkIntent('Anota que hay que llamar a Juan el viernes')).toBe('create')
    expect(inferGuideWorkIntent('Hay que cerrar las evidencias OTIF el viernes')).toBe('create')
    expect(inferGuideWorkIntent('Crea una accion para revisar el corte')).toBe('create')
    expect(inferGuideWorkIntent('Que conviene priorizar hoy?')).toBe('consult')
    expect(inferGuideWorkIntent('Como va el tablero')).toBe('consult')
  })
})
