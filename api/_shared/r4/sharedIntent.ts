/**
 * Capa compartida de intención R4 (simulación).
 * Cierra CHANNEL_GAP entre web, WhatsApp simulado y voz simulada
 * sin modificar el router productivo de WhatsApp.
 */
import { interpretOperationalMessage, type OperationalIntent } from '../operationalInterpret.js'
import { classifyWhatsAppIntent } from '../../../src/lib/whatsappFlowRouting.js'
import type { WhatsAppIntent } from '../../../src/lib/whatsappFlowRouting.js'
export type OmniFamily =
  | 'query_pending'
  | 'query_overdue'
  | 'prepare_followup'
  | 'propose_action'
  | 'approve'

export type SharedChannel = 'web' | 'whatsapp_sim' | 'voice_sim'

export type SharedFamily = OmniFamily | 'clarify' | 'deny'

export type SharedProposal =
  | { kind: 'query'; toolHint?: string }
  | { kind: 'prepare_comms'; toolHint: 'queue_workspace_draft' }
  | { kind: 'propose_create'; entity: 'kanban_action' | 'okr_initiative'; toolHint: string }
  | { kind: 'approve'; requiresAuthenticatedOwner: true }
  | { kind: 'clarify'; question: string }
  | { kind: 'deny'; code: 'unauthenticated' | 'public_confirm_denied' | 'foreign_session' }

export type SharedIntentInput = {
  text: string
  channel: SharedChannel
  authenticated: boolean
  isOwner: boolean
  publicConfirmAttempt?: boolean
  whatsappButtonId?: string | null
}

export type SharedIntentResult = {
  family: SharedFamily
  operational: OperationalIntent | 'approve'
  proposal: SharedProposal
  channel: SharedChannel
  permission: {
    canPropose: boolean
    canApprove: boolean
    reason?: string
  }
}

const AIOP_RE = /^aiop:([0-9a-fA-F-]{36}):(ok|no)$/i

export function familyFromOperational(intent: OperationalIntent, text: string): SharedFamily {
  if (intent === 'clarify') return 'clarify'
  if (intent === 'propose_create_kanban' || intent === 'propose_create_initiative') {
    return 'propose_action'
  }
  if (intent === 'prepare_comms') return 'prepare_followup'
  if (/vencid/.test(text.toLowerCase())) return 'query_overdue'
  return 'query_pending'
}

function proposalFromOperational(
  intent: OperationalIntent,
  toolHint?: string
): SharedProposal {
  if (intent === 'clarify') {
    return { kind: 'clarify', question: 'Necesito precisar el tipo de trabajo.' }
  }
  if (intent === 'prepare_comms') {
    return { kind: 'prepare_comms', toolHint: 'queue_workspace_draft' }
  }
  if (intent === 'propose_create_initiative') {
    return {
      kind: 'propose_create',
      entity: 'okr_initiative',
      toolHint: toolHint ?? 'get_okr_progress',
    }
  }
  if (intent === 'propose_create_kanban') {
    return {
      kind: 'propose_create',
      entity: 'kanban_action',
      toolHint: toolHint ?? 'create_action',
    }
  }
  return { kind: 'query', toolHint }
}

function denyProposal(
  code: Extract<SharedProposal, { kind: 'deny' }>['code'],
  reason: string
): Pick<SharedIntentResult, 'family' | 'operational' | 'proposal' | 'permission'> {
  return {
    family: 'deny',
    operational: 'approve',
    proposal: { kind: 'deny', code },
    permission: { canPropose: false, canApprove: false, reason },
  }
}

export function interpretSharedIntent(input: SharedIntentInput): SharedIntentResult {
  const button = input.whatsappButtonId?.trim() ?? ''
  const aiop = AIOP_RE.exec(button)

  if (aiop || input.publicConfirmAttempt) {
    if (!input.authenticated) {
      return {
        channel: input.channel,
        ...denyProposal('unauthenticated', 'La confirmacion exige usuario autenticado.'),
      }
    }
    if (!input.isOwner) {
      return {
        channel: input.channel,
        ...denyProposal('foreign_session', 'Solo el dueno autorizado puede confirmar.'),
      }
    }
    if (input.publicConfirmAttempt) {
      return {
        channel: input.channel,
        ...denyProposal(
          'public_confirm_denied',
          'La liga publica no confirma acciones protegidas.'
        ),
      }
    }
    if (aiop?.[2]?.toLowerCase() === 'no') {
      return {
        channel: input.channel,
        family: 'deny',
        operational: 'approve',
        proposal: { kind: 'deny', code: 'public_confirm_denied' },
        permission: {
          canPropose: false,
          canApprove: false,
          reason: 'El destinatario rechazo la confirmacion.',
        },
      }
    }
    return {
      channel: input.channel,
      family: 'approve',
      operational: 'approve',
      proposal: { kind: 'approve', requiresAuthenticatedOwner: true },
      permission: { canPropose: false, canApprove: true },
    }
  }

  const operational = interpretOperationalMessage(input.text)
  const family = familyFromOperational(operational.intent, input.text)
  const canPropose = family === 'propose_action' || family === 'prepare_followup'
  return {
    family,
    operational: operational.intent,
    proposal:
      family === 'clarify'
        ? {
            kind: 'clarify',
            question: operational.ambiguity?.question ?? 'Necesito precisar el tipo de trabajo.',
          }
        : proposalFromOperational(operational.intent, operational.toolHint),
    channel: input.channel,
    permission: {
      canPropose,
      canApprove: false,
      reason: family === 'clarify' ? operational.ambiguity?.question : undefined,
    },
  }
}

export function classifySharedAcrossChannels(input: {
  text: string
  authenticated?: boolean
  isOwner?: boolean
  publicConfirmAttempt?: boolean
  whatsappButtonId?: string | null
}) {
  const base = {
    text: input.text,
    authenticated: input.authenticated !== false,
    isOwner: input.isOwner !== false,
    publicConfirmAttempt: input.publicConfirmAttempt,
    whatsappButtonId: input.whatsappButtonId,
  }
  const productionWhatsApp = classifyWhatsAppIntent({
    canUseAi: true,
    textBody: input.whatsappButtonId ? null : input.text,
    buttonId: input.whatsappButtonId ?? null,
    messageType: input.whatsappButtonId ? 'interactive' : 'text',
  })
  return {
    web: interpretSharedIntent({ ...base, channel: 'web' }),
    whatsappSim: interpretSharedIntent({ ...base, channel: 'whatsapp_sim' }),
    voiceSim: interpretSharedIntent({ ...base, channel: 'voice_sim' }),
    whatsappProductionRouter: {
      intent: productionWhatsApp.intent as WhatsAppIntent,
      route: productionWhatsApp.route.kind,
    },
  }
}
