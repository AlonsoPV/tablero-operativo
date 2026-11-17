import { describe, expect, it } from 'vitest'
import {
  buildEnviardianReportDocument,
  buildSessionActions,
  sessionActionHref,
} from './enviardianReportDocument'
import { toneForSessionAction } from './reportVisualTheme'

describe('report session Acciones', () => {
  it('builds only created_work actions and ignores recommendations', () => {
    const actions = buildSessionActions({
      createdWork: [
        { title: 'Corte OTIF', id: 'a1', pending: false },
        { title: 'Avisar lider', pending: true },
        { title: 'Fallida', error: 'boom', pending: true },
      ],
      recommendations: ['Revisar el corte el lunes', 'Corte OTIF'],
    })
    expect(actions).toEqual([
      expect.objectContaining({
        title: 'Corte OTIF',
        status: 'executed',
        href: sessionActionHref('a1'),
      }),
      expect.objectContaining({ title: 'Avisar lider', status: 'pending_confirmation' }),
    ])
    expect(actions.some((a) => a.title === 'Fallida')).toBe(false)
    expect(actions.some((a) => a.status === 'recommendation')).toBe(false)
    expect(toneForSessionAction('executed')).toBe('green')
    expect(toneForSessionAction('pending_confirmation')).toBe('amber')
    expect(toneForSessionAction('recommendation')).toBe('violet')
  })

  it('embeds session_actions in the v3 document from createdWork without recommendations', () => {
    const doc = buildEnviardianReportDocument({
      summary: 'Sesion breve',
      recommendations: ['Hacer seguimiento'],
      createdWork: [{ title: 'Crear checklist', id: 'x1', pending: false }],
    })
    expect(doc.session_actions.map((a) => a.status)).toEqual(['executed'])
    expect(doc.recommendations).toEqual(['Hacer seguimiento'])
    expect(doc.session_actions[0]?.href).toBe('/kanban?accion=x1')
  })
})
