import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CopilotActor } from '../../../src/features/ai-support/copilot/types.js'
import {
  R2_EXECUTION_DISABLED_MESSAGE,
  pilotProjectRef,
  r2PilotUsers,
  resolveR2ExecutionMode,
} from './executionMode.js'
import { actionIdForOp, createPilotActionExecutor } from './r2Runtime.js'
import { r2OptionsFromServerEnv } from '../assistantOpsRuntime.js'
import {
  buildWhatsAppInteractiveProposalButtons,
  formatWhatsAppProposalPrompt,
  parseWhatsAppApprovalIntent,
  resolveWhatsAppProposalApproval,
  type WhatsAppProposalBinding,
} from '../whatsappR2Adapter.js'

const PILOT_ID = 'dd764c9f-8145-45d4-9111-0a8ec7f687e5'
const OTHER_ADMIN_ID = '11111111-2222-4333-8444-555555555555'
const PROD_REF = 'xhpasmjzuwifmjhrsumb'

const PILOT_ENV = {
  R2_EXECUTION_MODE: 'pilot',
  R2_PILOT_USERS: PILOT_ID,
  SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
  VERCEL: '1',
  VERCEL_ENV: 'production',
  NODE_ENV: 'production',
}

function makeActor(id: string, rpcImpl: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>): CopilotActor {
  return {
    supabase: {
      rpc: vi.fn(rpcImpl),
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'a-1', titulo_accion: 'Prueba piloto', responsable: OTHER_ADMIN_ID },
              error: null,
            }),
          }),
        }),
      })),
    } as unknown as SupabaseClient,
    usuarioId: id,
    nombre: id === PILOT_ID ? 'Alonso Perez' : 'Otro Admin',
    email: 'test@empresa.test',
    rol: 'Super Admin',
    areas: ['direccion'],
    modulosPermitidos: ['dashboard', 'kanban', 'okrs'],
  }
}

describe('R2_EXECUTION_MODE=pilot — aislamiento por usuario (API + BD), doble factor y fail-closed', () => {
  it('permanece OFF por defecto cuando faltan flags, allowlist o userId', () => {
    expect(resolveR2ExecutionMode({}, PILOT_ID)).toBe('disabled')
    expect(r2OptionsFromServerEnv({}, PILOT_ID, 'whatsapp')).toBeUndefined()
    expect(resolveR2ExecutionMode({ ...PILOT_ENV, R2_PILOT_USERS: '' }, PILOT_ID)).toBe('disabled')
    expect(resolveR2ExecutionMode(PILOT_ENV, undefined)).toBe('disabled')
    expect(resolveR2ExecutionMode(PILOT_ENV, '')).toBe('disabled')
    expect(pilotProjectRef({ ...PILOT_ENV, R2_PILOT_USERS: '' })).toBeNull()
  })

  it('aislamiento estricto en API: habilita únicamente a R2_PILOT_USERS y bloquea a cualquier otro usuario', () => {
    expect(r2PilotUsers(PILOT_ENV).has(PILOT_ID)).toBe(true)
    expect(pilotProjectRef(PILOT_ENV)).toBe(PROD_REF)

    expect(resolveR2ExecutionMode(PILOT_ENV, PILOT_ID)).toBe('pilot')
    expect(resolveR2ExecutionMode(PILOT_ENV, PILOT_ID.toUpperCase())).toBe('pilot')
    expect(r2OptionsFromServerEnv(PILOT_ENV, PILOT_ID, 'whatsapp')).toMatchObject({
      mode: 'pilot',
      channel: 'whatsapp',
      executor: { kind: 'pilot' },
    })

    // Otro Super Admin fuera de R2_PILOT_USERS recibe 'disabled' y sin ejecutor
    expect(resolveR2ExecutionMode(PILOT_ENV, OTHER_ADMIN_ID)).toBe('disabled')
    expect(r2OptionsFromServerEnv(PILOT_ENV, OTHER_ADMIN_ID, 'whatsapp')).toBeUndefined()
  })

  it('no afecta las protecciones de modo qa ni simulated en producción', () => {
    expect(
      resolveR2ExecutionMode(
        {
          R2_EXECUTION_MODE: 'qa',
          SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
          R2_QA_PROJECT_REFS: PROD_REF,
        },
        PILOT_ID
      )
    ).toBe('disabled')
    expect(
      resolveR2ExecutionMode({ R2_EXECUTION_MODE: 'simulated', VERCEL_ENV: 'production' }, PILOT_ID)
    ).toBe('disabled')
  })

  it('segundo factor en BD: bloquea ejecución si agent_execution_allowed() = false o si project_ref no coincide', async () => {
    const boardWrite = vi.fn(async () => ({ ok: true }))
    const exec = createPilotActionExecutor({ boardWrite, projectRef: PROD_REF })

    // Caso 1: agent_execution_gate sin filas habilitadas -> EXECUTION_DISABLED
    const closedActor = makeActor(PILOT_ID, async (fn) => {
      if (fn === 'agent_execution_allowed') return { data: false, error: null }
      return { data: null, error: null }
    })
    await expect(exec.prepare!(closedActor)).rejects.toThrow(R2_EXECUTION_DISABLED_MESSAGE)

    // Caso 2: allowed = true pero otro proyecto -> CONFIGURATION_ERROR
    const wrongRefActor = makeActor(PILOT_ID, async (fn) => {
      if (fn === 'agent_execution_allowed') return { data: true, error: null }
      if (fn === 'agent_execution_environment') return { data: 'otroproyecto12345678', error: null }
      return { data: null, error: null }
    })
    await expect(exec.prepare!(wrongRefActor)).rejects.toThrow('CONFIGURATION_ERROR')

    // Caso 3: allowed = true + projectRef exacto -> pasa prepare()
    const okActor = makeActor(PILOT_ID, async (fn) => {
      if (fn === 'agent_execution_allowed') return { data: true, error: null }
      if (fn === 'agent_execution_environment') return { data: PROD_REF, error: null }
      return { data: null, error: null }
    })
    await expect(exec.prepare!(okActor)).resolves.toBeUndefined()
  })

  it('concurrencia, idempotencia y bloqueo de notificaciones externas en modo piloto', async () => {
    const boardWrite = vi.fn(async () => ({ id: actionIdForOp('op-1'), title: 'Revisar inventario' }))
    const exec = createPilotActionExecutor({ boardWrite, projectRef: PROD_REF })

    // Idempotencia de actionIdForOp: mismo opId siempre produce mismo UUID determinista
    expect(actionIdForOp('op-1')).toBe(actionIdForOp('op-1'))
    expect(actionIdForOp('op-1')).not.toBe(actionIdForOp('op-2'))

    // Concurrencia: agent_claim_pending_op devuelve false si otro hilo ya reclamó la op
    const racedActor = makeActor(PILOT_ID, async (fn) => {
      if (fn === 'agent_claim_pending_op') return { data: false, error: null }
      return { data: true, error: null }
    })
    expect(await exec.claim(racedActor, { id: 'op-1', payload: {} })).toBe(false)

    // Notificaciones externas bloqueadas en modo piloto (aislamiento)
    await expect(
      exec.execute(
        racedActor,
        'agent_notify_responsable',
        { accionId: 'a-1', canal: 'whatsapp', destinatarioId: OTHER_ADMIN_ID },
        {
          opId: 'op-2',
          expectedUpdatedAt: null,
        }
      )
    ).rejects.toThrow('EXECUTION_DISABLED')
  })

  it('WhatsApp R2 adapter: con modo disabled no presenta confirmación ejecutable; con modo pilot exige código explícito (no "sí" suelto)', () => {
    const binding: WhatsAppProposalBinding = {
      proposalId: 'op-pilot-1',
      version: 'A1B2C3',
      usuarioId: PILOT_ID,
      operation: 'agent_create_action',
      summary: 'Crear acción: Revisar inventario mañana',
      scope: 'Tablero Kanban',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      editable: true,
    }

    // Usuario no piloto (disabled): sin botones ejecutables y sin pedir confirmación
    const disabledPrompt = formatWhatsAppProposalPrompt(binding, { executionMode: 'disabled' })
    expect(disabledPrompt).toContain('no se guardó en Scrumban')
    expect(disabledPrompt).not.toContain('confirmar A1B2C3')
    expect(buildWhatsAppInteractiveProposalButtons(binding, 'disabled')).toEqual([])

    // Usuario piloto (pilot): botones + código explícito; "sí" suelto rechazado; otro usuario rechazado
    const pilotPrompt = formatWhatsAppProposalPrompt(binding, { executionMode: 'pilot' })
    expect(pilotPrompt).toContain('confirmar A1B2C3')
    expect(buildWhatsAppInteractiveProposalButtons(binding, 'pilot').length).toBeGreaterThan(0)

    const looseYes = resolveWhatsAppProposalApproval({
      actorUsuarioId: PILOT_ID,
      actorActive: true,
      pending: [binding],
      decision: parseWhatsAppApprovalIntent({ text: 'sí' }),
      executionMode: 'pilot',
    })
    expect(looseYes.status).not.toBe('ready_to_execute')

    const foreignUser = resolveWhatsAppProposalApproval({
      actorUsuarioId: OTHER_ADMIN_ID,
      actorActive: true,
      pending: [binding],
      decision: parseWhatsAppApprovalIntent({ text: 'confirmar A1B2C3' }),
      executionMode: 'pilot',
    })
    expect(foreignUser.status).not.toBe('ready_to_execute')

    const validConfirm = resolveWhatsAppProposalApproval({
      actorUsuarioId: PILOT_ID,
      actorActive: true,
      pending: [binding],
      decision: parseWhatsAppApprovalIntent({ text: 'confirmar A1B2C3' }),
      executionMode: 'pilot',
    })
    expect(validConfirm.status).toBe('ready_to_execute')

    const validCancel = resolveWhatsAppProposalApproval({
      actorUsuarioId: PILOT_ID,
      actorActive: true,
      pending: [binding],
      decision: parseWhatsAppApprovalIntent({ text: 'cancelar A1B2C3' }),
      executionMode: 'pilot',
    })
    expect(validCancel.status).toBe('ready_to_cancel')

    const validEdit = resolveWhatsAppProposalApproval({
      actorUsuarioId: PILOT_ID,
      actorActive: true,
      pending: [binding],
      decision: parseWhatsAppApprovalIntent({ text: 'editar A1B2C3 fecha=2026-11-28' }),
      executionMode: 'pilot',
    })
    expect(validEdit.status).toBe('ready_to_edit')
  })
})
