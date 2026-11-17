import { describe, expect, it } from 'vitest'
import {
  actionLifecycleTone,
  mapProposalStatusToLifecycle,
  toActionCardView,
} from './actionLifecycle'
import type { CopilotProposal } from './types'

const baseProposal = (overrides?: Partial<CopilotProposal>): CopilotProposal => ({
  id: 'op-1',
  tool: 'create_action',
  title: 'Crear accion',
  summary: 'Registrar corte de inventario',
  fields: [{ label: 'Titulo', to: 'Corte' }],
  expiresAt: '2026-11-16T20:00:00.000Z',
  ...overrides,
})

describe('actionLifecycle / ActionCard view', () => {
  it('maps pending and busy states to semantic lifecycle tones', () => {
    expect(mapProposalStatusToLifecycle('pending')).toBe('pending_confirmation')
    expect(mapProposalStatusToLifecycle('pending', 'confirm')).toBe('executing')
    expect(mapProposalStatusToLifecycle('confirmed')).toBe('completed')
    expect(mapProposalStatusToLifecycle('cancelled')).toBe('cancelled')
    expect(mapProposalStatusToLifecycle('error')).toBe('error')
    expect(actionLifecycleTone('pending_confirmation').rail).toContain('D97706')
    expect(actionLifecycleTone('completed').rail).toContain('16A34A')
    expect(actionLifecycleTone('error').rail).toContain('DC2626')
  })

  it('builds email preview fields for workspace drafts without marking them sent', () => {
    const view = toActionCardView(
      baseProposal({
        tool: 'gmail_prepare_send',
        title: 'Enviar correo',
        workspace: {
          kind: 'email',
          from: 'yo@empresa.com',
          to: ['lider@empresa.com'],
          subject: 'Corte',
          body: 'Resumen del corte',
        },
      }),
      { status: 'pending' }
    )
    expect(view.kind).toBe('email')
    expect(view.status).toBe('pending_confirmation')
    expect(view.emailPreview).toEqual({
      from: 'yo@empresa.com',
      to: ['lider@empresa.com'],
      cc: undefined,
      subject: 'Corte',
      body: 'Resumen del corte',
    })
  })

  it('returns to pending_confirmation after material edits (status reset)', () => {
    const view = toActionCardView(baseProposal(), { status: 'pending', busy: 'edit' })
    expect(view.status).toBe('executing')
    const afterEdit = toActionCardView(baseProposal(), { status: 'pending' })
    expect(afterEdit.status).toBe('pending_confirmation')
  })
})
