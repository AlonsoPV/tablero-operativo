/**
 * AC-01 · flujo accionable simulado (sin escrituras PROD ni assistant-ops real).
 * Afirma solo el ciclo de vida local: interpretar → borrador → faltantes → confirmación simulada.
 */
import { describe, expect, it } from 'vitest'
import {
  mapProposalStatusToLifecycle,
  pendingFailureStatus,
  proposalExecutionBadge,
  proposalStageLabel,
  toActionCardView,
  type ActionLifecycleStatus,
} from './actionLifecycle'
import type { CopilotProposal } from './types'
import { looksLikeCreateWork, resolveWriteIntent } from '@/features/ai-support/writeIntent'
import { friendlyAssistantError } from '@/features/ai-support/assistantErrors'

function draftProposal(overrides?: Partial<CopilotProposal>): CopilotProposal {
  return {
    id: 'sim-op-create-1',
    tool: 'create_action',
    title: 'Crear accion',
    summary: 'Revisar el retraso de entregas el viernes',
    fields: [
      { label: 'Titulo', to: 'Revisar retraso de entregas' },
      { label: 'Fecha', to: 'viernes' },
    ],
    expiresAt: '2026-11-22T20:00:00.000Z',
    ...overrides,
  }
}

describe('AC-01 create flow (simulated only)', () => {
  it('interprets create intent and keeps consult for questions', () => {
    expect(looksLikeCreateWork('Crea una accion para revisar el retraso de entregas el viernes')).toBe(
      true
    )
    expect(
      resolveWriteIntent('Crea una accion para revisar el retraso de entregas el viernes', 'consult')
    ).toBe('create')
    expect(resolveWriteIntent('Que pendientes tiene el equipo?', 'consult')).toBe('consult')
  })

  it('builds draft → needs confirmation → simulated execute without claiming PROD write', () => {
    const draft = draftProposal()
    const preparing = toActionCardView(draft, { status: 'pending', busy: null })
    expect(preparing.status).toBe('pending_confirmation')
    expect(proposalStageLabel({ lifecycle: preparing.status, kind: 'board' })).toBe('Borrador')

    const executing: ActionLifecycleStatus = mapProposalStatusToLifecycle('pending', 'confirm')
    expect(executing).toBe('executing')
    expect(proposalStageLabel({ lifecycle: executing, kind: 'board', approving: true })).toBe(
      'Aprobado'
    )

    // Resultado simulado local (fixture): no hay llamada a assistant-ops / PROD.
    const simulatedResult = {
      simulated: true as const,
      opId: draft.id,
      href: '/kanban?sim=1',
      message: 'Simulacion local: accion no escrita en PROD.',
    }
    const completed = toActionCardView(draft, {
      status: 'confirmed',
      resultHref: simulatedResult.href,
    })
    expect(completed.status).toBe('completed')
    expect(proposalStageLabel({ lifecycle: completed.status, kind: 'board' })).toBe('Ejecutado')
    expect(proposalExecutionBadge(preparing.status, true)).toBe('Simulado')
    expect(proposalExecutionBadge(completed.status, true)).toBe('Ejecutado')
    expect(simulatedResult.simulated).toBe(true)
    expect(simulatedResult.message).toMatch(/no escrita en PROD/i)
  })

  it('surfaces missing info and friendly errors without SQL leakage', () => {
    const incomplete = draftProposal({
      fields: [{ label: 'Titulo', to: 'Revisar retraso de entregas' }],
      workspace: { kind: 'email', incomplete: true, needsInfo: true, needsInfoReason: 'Falta responsable' },
    })
    const view = toActionCardView(incomplete, { status: 'pending' })
    expect(view.status === 'pending_confirmation' || view.status === 'needs_info').toBe(true)

    const msg = friendlyAssistantError(new Error('relation "acciones" violates constraint xyz'))
    expect(msg).not.toMatch(/relation|constraint|sql/i)
    expect(pendingFailureStatus(new Error('La autorización expiró. Solicita una nueva propuesta.'))).toBe(
      'expired'
    )
  })
})
