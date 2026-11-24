/**
 * AC-01/02/03 · gestión simulada (sin PROD / assistant-ops real).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  mapProposalStatusToLifecycle,
  proposalStageLabel,
  toActionCardView,
} from './actionLifecycle'
import type { CopilotProposal } from './types'
import { resolveWriteIntent } from '@/features/ai-support/writeIntent'
import { friendlyAssistantError } from '@/features/ai-support/assistantErrors'

type BoardEstado = 'Pendiente' | 'En proceso' | 'Bloqueado' | 'Hecho' | 'Verificado'

/** Contrato local: Hecho ≠ Verificado; no inventar responsables. */
function applySimulatedStatusTransition(input: {
  from: BoardEstado
  intent: 'mark_done' | 'mark_verified' | 'register_block'
  actorId: string
  ownerId: string
  verifierId?: string
  blockReason?: string
}):
  | { ok: true; to: BoardEstado; simulated: true; message: string }
  | { ok: false; simulated: true; message: string } {
  if (input.intent === 'register_block') {
    if (!input.blockReason?.trim()) {
      return { ok: false, simulated: true, message: 'Falta el motivo del bloqueo.' }
    }
    return {
      ok: true,
      to: 'Bloqueado',
      simulated: true,
      message: 'Simulacion local: bloqueo registrado; no escrito en PROD.',
    }
  }
  if (input.intent === 'mark_done') {
    if (input.actorId !== input.ownerId) {
      return { ok: false, simulated: true, message: 'Solo el responsable puede marcar Hecho.' }
    }
    if (input.from === 'Verificado') {
      return { ok: false, simulated: true, message: 'Ya esta Verificado; no se marca Hecho de nuevo.' }
    }
    return {
      ok: true,
      to: 'Hecho',
      simulated: true,
      message: 'Simulacion local: estado Hecho; no escrito en PROD.',
    }
  }
  // mark_verified
  if (input.from !== 'Hecho') {
    return { ok: false, simulated: true, message: 'Solo se verifica desde Hecho (no desde Pendiente).' }
  }
  if (!input.verifierId || input.actorId !== input.verifierId) {
    return { ok: false, simulated: true, message: 'Solo el verificador puede marcar Verificado.' }
  }
  return {
    ok: true,
    to: 'Verificado',
    simulated: true,
    message: 'Simulacion local: estado Verificado; no escrito en PROD.',
  }
}

async function simulateConfirmOnce(
  proposal: CopilotProposal,
  confirmOp: (id: string) => Promise<{ result?: { href?: string } | null }>,
  seen: Set<string>
) {
  if (seen.has(proposal.id)) {
    return { duplicate: true as const, simulated: true as const, status: 'completed' as const }
  }
  seen.add(proposal.id)
  const result = await confirmOp(proposal.id)
  return {
    duplicate: false as const,
    simulated: true as const,
    status: 'completed' as const,
    href: result.result?.href,
    message: 'Simulacion local: accion no escrita en PROD.',
  }
}

describe('AC-01 create confirm harness (simulated)', () => {
  it('runs intent → draft → confirm mock → completed with idempotent double confirm', async () => {
    expect(resolveWriteIntent('Crea una accion para resolver el retraso de entregas', 'consult')).toBe(
      'create'
    )
    const proposal: CopilotProposal = {
      id: 'sim-confirm-1',
      tool: 'create_action',
      title: 'Crear accion',
      summary: 'Resolver retraso de entregas',
      fields: [
        { label: 'Titulo', to: 'Resolver retraso de entregas' },
        { label: 'Responsable', to: 'Ana Logistica' },
      ],
      expiresAt: '2026-11-22T20:00:00.000Z',
    }
    const draft = toActionCardView(proposal, { status: 'pending' })
    expect(draft.status).toBe('pending_confirmation')

    const confirmOp = vi.fn(async (id: string) => {
      expect(id).toBe(proposal.id)
      return { result: { href: '/kanban?sim=confirm-1' } }
    })
    const seen = new Set<string>()
    const first = await simulateConfirmOnce(proposal, confirmOp, seen)
    const second = await simulateConfirmOnce(proposal, confirmOp, seen)

    expect(first.duplicate).toBe(false)
    expect(first.simulated).toBe(true)
    expect(first.message).toMatch(/no escrita en PROD/i)
    expect(second.duplicate).toBe(true)
    expect(confirmOp).toHaveBeenCalledTimes(1)

    const completed = toActionCardView(proposal, {
      status: 'confirmed',
      resultHref: first.href,
    })
    expect(mapProposalStatusToLifecycle('confirmed')).toBe('completed')
    expect(proposalStageLabel({ lifecycle: completed.status, kind: 'board' })).toBe('Ejecutado')
  })
})

describe('AC-02 Hecho vs Verificado (simulated)', () => {
  it('keeps Hecho distinct from Verificado and enforces actors', () => {
    const done = applySimulatedStatusTransition({
      from: 'En proceso',
      intent: 'mark_done',
      actorId: 'u-owner',
      ownerId: 'u-owner',
    })
    expect(done.ok).toBe(true)
    if (!done.ok) throw new Error('expected ok')
    expect(done.to).toBe('Hecho')
    expect(done.to).not.toBe('Verificado')
    expect(done.simulated).toBe(true)

    const prematureVerify = applySimulatedStatusTransition({
      from: 'En proceso',
      intent: 'mark_verified',
      actorId: 'u-verifier',
      ownerId: 'u-owner',
      verifierId: 'u-verifier',
    })
    expect(prematureVerify.ok).toBe(false)

    const verified = applySimulatedStatusTransition({
      from: 'Hecho',
      intent: 'mark_verified',
      actorId: 'u-verifier',
      ownerId: 'u-owner',
      verifierId: 'u-verifier',
    })
    expect(verified.ok).toBe(true)
    if (!verified.ok) throw new Error('expected ok')
    expect(verified.to).toBe('Verificado')
  })
})

describe('AC-03 bloqueos (simulated)', () => {
  it('requires reason and never claims PROD write', () => {
    const missing = applySimulatedStatusTransition({
      from: 'En proceso',
      intent: 'register_block',
      actorId: 'u-owner',
      ownerId: 'u-owner',
    })
    expect(missing.ok).toBe(false)

    const blocked = applySimulatedStatusTransition({
      from: 'En proceso',
      intent: 'register_block',
      actorId: 'u-owner',
      ownerId: 'u-owner',
      blockReason: 'Falta evidencia del proveedor',
    })
    expect(blocked.ok).toBe(true)
    if (!blocked.ok) throw new Error('expected ok')
    expect(blocked.to).toBe('Bloqueado')
    expect(blocked.message).toMatch(/no escrito en PROD/i)
    expect(friendlyAssistantError(new Error('update acciones set estado'))).not.toMatch(/update|sql/i)
  })
})
