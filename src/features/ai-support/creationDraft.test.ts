import { describe, expect, it } from 'vitest'
import { classifyCreationIntent, draftFromRequest, evidenceOrPlaceholder, sanitizeCheckpoints } from './creationDraft'

describe('creationDraft', () => {
  it('arma titulo y motivo sin inventar evidencia ni checkpoints', () => {
    const draft = draftFromRequest(
      'Crea una accion para que Carlos revise inventarios el viernes porque hay diferencias'
    )
    expect(draft.intent).toBe('create')
    expect(draft.title.toLowerCase()).toContain('revis')
    expect(draft.title.toLowerCase()).not.toContain('carlos')
    expect(draft.description.toLowerCase()).toContain('diferencias')
    expect(draft.evidence).toBeNull()
    expect(draft.checkpoints).toEqual([])
    expect(draft.asksNotification).toBe(false)
    expect(evidenceOrPlaceholder(draft.evidence)).toBe('Por definir')
  })

  it('no trata una recomendacion como orden de creacion', () => {
    expect(classifyCreationIntent('Qué harias con el retraso del almacen')).toBe('recommend')
  })

  it('detecta varias acciones y un aviso explicito', () => {
    const draft = draftFromRequest('Crea tres tareas para el cierre y avisale por WhatsApp')
    expect(draft.intent).toBe('batch')
    expect(draft.asksNotification).toBe(true)
  })

  it('toma solo los pasos que el usuario enumero', () => {
    const draft = draftFromRequest('Crea la tarea con pasos: comparar existencias, documentar diferencias')
    expect(draft.checkpoints).toEqual(['comparar existencias', 'documentar diferencias'])
    expect(sanitizeCheckpoints(['a', 'Comparar existencias', 'x'.repeat(200), 'Cerrar el reporte'])).toEqual([
      'Comparar existencias',
      'Cerrar el reporte',
    ])
  })
})
