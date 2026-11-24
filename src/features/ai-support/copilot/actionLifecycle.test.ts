import { describe, expect, it } from 'vitest'
import {
  actionLifecycleTone,
  communicationStatusLabel,
  mapProposalStatusToLifecycle,
  pendingFailureStatus,
  proposalStageLabel,
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
    expect(actionLifecycleTone('pending_confirmation').tone).toBe('warning')
    expect(actionLifecycleTone('completed').tone).toBe('success')
    expect(actionLifecycleTone('error').rail).toBe('bg-destructive')
    expect(actionLifecycleTone('completed').rail).not.toMatch(/#|slate/)
  })

  it('maps expired and conflict instead of falling back to pending', () => {
    expect(mapProposalStatusToLifecycle('expired')).toBe('expired')
    expect(mapProposalStatusToLifecycle('conflict')).toBe('conflict')
    expect(actionLifecycleTone('conflict').tone).toBe('danger')
    expect(communicationStatusLabel({ lifecycle: 'expired' })).toBe('Vencido')
    expect(pendingFailureStatus(new Error('La autorización expiró. Solicita una nueva propuesta.'))).toBe(
      'expired'
    )
    expect(
      pendingFailureStatus(new Error('El registro cambió después de la vista previa. Pide una nueva confirmación.'))
    ).toBe('conflict')
    expect(pendingFailureStatus(new Error('otro'))).toBe('error')
  })

  it('shows Enviado only after the provider confirmed', () => {
    expect(proposalStageLabel({ lifecycle: 'pending_confirmation', kind: 'whatsapp' })).toBe('Borrador')
    expect(
      proposalStageLabel({ lifecycle: 'executing', kind: 'whatsapp', approving: true })
    ).toBe('Aprobado')
    expect(proposalStageLabel({ lifecycle: 'executing', kind: 'email' })).toBe('En proceso')
    expect(proposalStageLabel({ lifecycle: 'completed', kind: 'whatsapp' })).toBe('Enviado')
    expect(proposalStageLabel({ lifecycle: 'completed', kind: 'board' })).toBe('Ejecutado')
    expect(proposalStageLabel({ lifecycle: 'error', kind: 'email' })).toBe('Error')
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
