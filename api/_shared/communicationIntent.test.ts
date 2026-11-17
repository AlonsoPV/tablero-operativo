import { describe, expect, it } from 'vitest'
import { classifyCommunicationIntent } from './communicationIntent'

describe('classifyCommunicationIntent — matriz de interpretación', () => {
  it('1. instrucción explícita WhatsApp', () => {
    const r = classifyCommunicationIntent('Prepara un WhatsApp para Carlos con los acuerdos.')
    expect(r.category).toBe('explicit')
    expect(r.shouldQueue).toBe(true)
    expect(r.action).toBe('prepare')
    expect(r.channel).toBe('whatsapp')
    expect(r.softConfirm).toBe(false)
  })

  it('2. instrucción indirecta (déjale / escríbele)', () => {
    const r = classifyCommunicationIntent('Escríbele a Pedro para que revise los pendientes.')
    expect(r.category).toBe('explicit')
    expect(r.action).toBe('prepare')
    expect(r.askChannel || r.channel === 'unspecified' || r.shouldQueue).toBe(true)
  })

  it('3. referencia al contexto con borrador abierto', () => {
    const r = classifyCommunicationIntent('Mándale eso a Carlos.', { hasOpenDraft: true })
    expect(r.category).toMatch(/contextual|cancel_or_modify/)
    expect(r.shouldQueue).toBe(true)
    expect(r.action).toBe('update')
  })

  it('4. mención sin intención — no genera borrador', () => {
    const r = classifyCommunicationIntent('Tenemos que mejorar la comunicación por WhatsApp.')
    expect(r.category).toBe('mention')
    expect(r.shouldQueue).toBe(false)
    expect(r.action).toBe('none')
    expect(r.softConfirm).toBe(false)
  })

  it('5. propuesta hipotética — no encola', () => {
    const r = classifyCommunicationIntent('¿Podríamos enviar un correo al equipo?')
    expect(r.shouldQueue).toBe(false)
    expect(r.action).toBe('none')
    expect(r.category).toBe('mention')
  })

  it('6. cambio de destinatario', () => {
    const r = classifyCommunicationIntent('Cambia a Carlos por Mariana.', { hasOpenDraft: true })
    expect(r.category).toBe('cancel_or_modify')
    expect(r.action).toBe('update')
    expect(r.shouldQueue).toBe(true)
  })

  it('7. cambio de canal', () => {
    const r = classifyCommunicationIntent('Mejor mándalo por WhatsApp.', { hasOpenDraft: true })
    expect(r.category).toBe('cancel_or_modify')
    expect(r.action).toBe('update')
    expect(r.channel).toBe('whatsapp')
  })

  it('8. cancelación', () => {
    const r = classifyCommunicationIntent('Ya no prepares el correo.')
    expect(r.category).toBe('cancel_or_modify')
    expect(r.action).toBe('cancel')
    expect(r.shouldQueue).toBe(true)
  })

  it('9. dos borradores diferentes (segundo prepare)', () => {
    const r = classifyCommunicationIntent('Prepara otro para el director por correo.')
    expect(r.action).toBe('prepare')
    expect(r.shouldQueue).toBe(true)
    expect(r.channel).toBe('email')
  })

  it('10. instrucción con información incompleta (sin canal)', () => {
    const r = classifyCommunicationIntent('Déjale un mensaje a Mariana.')
    expect(r.category).toBe('explicit')
    expect(r.askChannel).toBe(true)
    expect(r.channel).toBe('unspecified')
    expect(r.shouldQueue).toBe(false)
  })

  it('11. contactos ambiguos no inventan envío — solo prepare con recipient hint', () => {
    const r = classifyCommunicationIntent('Prepara un correo para el responsable de operaciones.')
    expect(r.shouldQueue).toBe(true)
    expect(r.action).toBe('prepare')
    expect(r.channel).toBe('email')
  })

  it('12. solicitud de envío inmediato → prepare (aprobación después)', () => {
    const r = classifyCommunicationIntent('Envía este correo a dirección con los acuerdos.')
    expect(r.category).toBe('explicit')
    expect(r.action).toBe('prepare')
    expect(r.shouldQueue).toBe(true)
    expect(r.reason).toMatch(/immediate_send|explicit/)
  })

  it('13. corrección de transcripción / frase ruidosa con verbo claro', () => {
    const r = classifyCommunicationIntent('prepárame un wasap para carlos con lo que acordamos')
    expect(r.shouldQueue).toBe(true)
    expect(r.channel).toBe('whatsapp')
    expect(r.action).toBe('prepare')
  })

  it('14. frases con negaciones — no prepare', () => {
    const r = classifyCommunicationIntent('No sé si conviene mandar un correo.')
    expect(r.shouldQueue).toBe(false)
    expect(r.action).toBe('none')
  })

  it('15. solicitud al finalizar / soft intent → softConfirm sin encolar aún', () => {
    const r = classifyCommunicationIntent('Habrá que avisarle al equipo por WhatsApp.')
    expect(r.shouldQueue).toBe(false)
    expect(r.softConfirm).toBe(true)
  })

  it('distingue voy a enviar vs prepárame vs deberíamos', () => {
    expect(classifyCommunicationIntent('Voy a enviar un correo mañana.').shouldQueue).toBe(false)
    expect(classifyCommunicationIntent('Prepárame un correo para Mariana.').shouldQueue).toBe(true)
    expect(classifyCommunicationIntent('Deberíamos enviar un correo.').shouldQueue).toBe(false)
  })

  it('mención informativa de cliente no pide soft confirm', () => {
    const r = classifyCommunicationIntent('El cliente nos escribió por WhatsApp ayer.')
    expect(r.shouldQueue).toBe(false)
    expect(r.softConfirm).toBe(false)
  })
})
