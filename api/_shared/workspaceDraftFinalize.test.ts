import { describe, expect, it } from 'vitest'
import { fillWorkspaceDraftsFromTranscript } from './workspaceDraftFinalize'

describe('fillWorkspaceDraftsFromTranscript', () => {
  it('resolves manana from a Monday call as Tuesday CDMX', () => {
    const filled = fillWorkspaceDraftsFromTranscript({
      drafts: [
        {
          id: 'op-1',
          tool: 'calendar_prepare_event',
          payload: {
            incomplete: true,
            draft_kind: 'event',
            purpose: 'revision de OTIF',
            uttered_at: '2026-11-09T16:00:00-06:00',
            time_anchor: 'mañana 10:00',
            attendees_hint: ['ops@empresa.com'],
          },
          preview: {},
        },
      ],
      transcript: 'user: agendemos manana la revision de OTIF a las 10\nassistant: lo dejo en borrador',
    })
    expect(filled).toHaveLength(1)
    expect(filled[0].workspace.start).toBe('2026-11-10T10:00')
    expect(filled[0].payload.incomplete).toBe(false)
    expect(filled[0].workspace.attendees).toContain('ops@empresa.com')
  })

  it('fills an email draft without claiming it was sent', () => {
    const filled = fillWorkspaceDraftsFromTranscript({
      drafts: [
        {
          id: 'op-2',
          tool: 'gmail_prepare_send',
          payload: {
            incomplete: true,
            draft_kind: 'email',
            purpose: 'enviar el cierre de la minuta',
            recipient_hint: 'ana@empresa.com',
            uttered_at: '2026-11-10T11:00:00-06:00',
          },
          preview: {},
        },
      ],
      transcript: 'Quedamos en enviar el cierre de la minuta a ana@empresa.com con los acuerdos.',
    })
    expect(filled[0].workspace.to).toEqual(['ana@empresa.com'])
    expect(String(filled[0].preview.summary)).toMatch(/no se envio/i)
    expect(filled[0].payload.body).toMatch(/minuta/i)
  })

  it('ignores drafts already complete', () => {
    const filled = fillWorkspaceDraftsFromTranscript({
      drafts: [
        {
          id: 'op-3',
          tool: 'gmail_prepare_send',
          payload: { incomplete: false, subject: 'ya' },
          preview: {},
        },
      ],
      transcript: 'cualquier cosa',
    })
    expect(filled).toEqual([])
  })
})
