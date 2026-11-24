import { describe, expect, it } from 'vitest'
import { looksLikeKnowledgeQuestion, tryKnowledgeReply } from './tryKnowledgeReply'

describe('tryKnowledgeReply', () => {
  it('answers verification criterion with explicit source and Hecho≠Verificado', () => {
    const reply = tryKnowledgeReply('Cual es el criterio para verificar una accion?')
    expect(reply).not.toBeNull()
    expect(reply!.content).toMatch(/Hecho y Verificado son estados distintos/i)
    expect(reply!.content).toMatch(/Marcar Hecho no verifica/i)
    expect(reply!.content).toMatch(/Fuente:/i)
    expect(reply!.source).toMatch(/operationalDictionary|assistantPrompts/)
    expect(reply!.content).not.toMatch(/invente|segun mi opinion/i)
  })

  it('does not treat operational queries as knowledge', () => {
    expect(looksLikeKnowledgeQuestion('Que pendientes tiene el equipo?')).toBe(false)
    expect(tryKnowledgeReply('Cuales estan vencidos?')).toBeNull()
  })
})
