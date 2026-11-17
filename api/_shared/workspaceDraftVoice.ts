/**
 * Mutaciones de borradores de comunicación durante la llamada Retell:
 * prepare | update | cancel con idempotencia y pending_op_id estable.
 */
import type { CopilotProposal } from '../../src/features/ai-support/copilot/types.js'
import {
  normalizeCommunicationChannel,
  type CommunicationChannel,
} from '../../src/features/ai-support/copilot/communicationTools.js'
import type { CopilotActor } from './assistantPending.js'
import { queueWhatsappDraft } from './assistantCommunicationDrafts.js'
import { queueWorkspaceDraft } from './assistantGoogleTools.js'
import { withContentHash } from './workspaceHash.js'

const COMM_TOOLS = ['gmail_prepare_send', 'whatsapp_prepare_send', 'calendar_prepare_event'] as const

export type VoiceDraftAction = 'prepare' | 'update' | 'cancel'

export function normalizeVoiceDraftAction(raw: unknown): VoiceDraftAction {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'update' || value === 'cambiar' || value === 'modificar') return 'update'
  if (value === 'cancel' || value === 'cancelar' || value === 'descartar') return 'cancel'
  return 'prepare'
}

export function buildVoiceDraftIdempotencyKey(input: {
  idempotencyKey?: string
  utteredAt?: string
  channel: string
  purpose: string
}): string {
  const explicit = (input.idempotencyKey || '').trim().slice(0, 160)
  if (explicit) return explicit
  const uttered = (input.utteredAt || '').trim().slice(0, 40)
  const purpose = input.purpose.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
  return `voice:${input.channel}:${uttered}:${purpose}`.slice(0, 200)
}

function asString(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function toolForChannel(channel: Exclude<CommunicationChannel, 'both' | 'unspecified'>): string {
  if (channel === 'whatsapp') return 'whatsapp_prepare_send'
  if (channel === 'event') return 'calendar_prepare_event'
  return 'gmail_prepare_send'
}

function channelForTool(tool: string): Exclude<CommunicationChannel, 'both' | 'unspecified'> {
  if (tool === 'whatsapp_prepare_send') return 'whatsapp'
  if (tool === 'calendar_prepare_event') return 'event'
  return 'email'
}

type PendingDraftRow = {
  id: string
  tool: string
  payload: Record<string, unknown>
  preview: Record<string, unknown>
  status: string
}

async function findByIdempotencyKey(
  actor: CopilotActor,
  sessionId: string,
  idempotencyKey: string
): Promise<PendingDraftRow[]> {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,tool,payload,preview,status')
    .eq('usuario_id', actor.usuarioId)
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .in('tool', [...COMM_TOOLS])
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data ?? [])
    .map((row) => {
      const payload =
        row.payload && typeof row.payload === 'object'
          ? (row.payload as Record<string, unknown>)
          : {}
      return {
        id: String(row.id),
        tool: String(row.tool),
        payload,
        preview:
          row.preview && typeof row.preview === 'object'
            ? (row.preview as Record<string, unknown>)
            : {},
        status: String(row.status),
      }
    })
    .filter((row) => asString(row.payload.idempotency_key, 200) === idempotencyKey)
}

async function loadPendingDraft(
  actor: CopilotActor,
  sessionId: string,
  pendingOpId: string
): Promise<PendingDraftRow | null> {
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,tool,payload,preview,status,usuario_id,session_id')
    .eq('id', pendingOpId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.usuario_id !== actor.usuarioId) return null
  if (data.session_id && String(data.session_id) !== sessionId) return null
  if (data.status !== 'pending') return null
  if (!COMM_TOOLS.includes(String(data.tool) as (typeof COMM_TOOLS)[number])) return null
  return {
    id: String(data.id),
    tool: String(data.tool),
    payload:
      data.payload && typeof data.payload === 'object'
        ? (data.payload as Record<string, unknown>)
        : {},
    preview:
      data.preview && typeof data.preview === 'object'
        ? (data.preview as Record<string, unknown>)
        : {},
    status: String(data.status),
  }
}

async function findLatestPendingByChannel(
  actor: CopilotActor,
  sessionId: string,
  channel: Exclude<CommunicationChannel, 'both' | 'unspecified'>
): Promise<PendingDraftRow | null> {
  const tool = toolForChannel(channel)
  const { data, error } = await actor.supabase
    .from('assistant_pending_ops')
    .select('id,tool,payload,preview,status')
    .eq('usuario_id', actor.usuarioId)
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .eq('tool', tool)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) return null
  return {
    id: String(data.id),
    tool: String(data.tool),
    payload:
      data.payload && typeof data.payload === 'object'
        ? (data.payload as Record<string, unknown>)
        : {},
    preview:
      data.preview && typeof data.preview === 'object'
        ? (data.preview as Record<string, unknown>)
        : {},
    status: String(data.status),
  }
}

async function cancelDraftRow(actor: CopilotActor, opId: string) {
  const { error } = await actor.supabase
    .from('assistant_pending_ops')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', opId)
    .eq('usuario_id', actor.usuarioId)
    .eq('status', 'pending')
  if (error) throw error
}

async function patchDraftRow(
  actor: CopilotActor,
  row: PendingDraftRow,
  patch: {
    recipient?: string
    purpose?: string
    contentInstructions?: string
    conversationContext?: string
  }
): Promise<CopilotProposal> {
  const purpose = (patch.purpose || asString(row.payload.purpose, 500) || '').trim()
  const recipient =
    patch.recipient !== undefined
      ? patch.recipient.trim()
      : asString(row.payload.recipient_hint, 160)
  const payload = withContentHash({
    ...row.payload,
    incomplete: true,
    purpose,
    recipient_hint: recipient,
    content_instructions:
      patch.contentInstructions !== undefined
        ? patch.contentInstructions
        : asString(row.payload.content_instructions, 500),
    conversation_context:
      patch.conversationContext !== undefined
        ? patch.conversationContext
        : asString(row.payload.conversation_context, 800),
    to: row.tool === 'gmail_prepare_send' ? [] : row.payload.to,
    to_phone: '',
    to_user_id: '',
    body: '',
    subject: row.tool === 'gmail_prepare_send' ? purpose.slice(0, 120) : row.payload.subject,
    needs_info: false,
    needs_info_reason: '',
  })
  const channelLabel =
    row.tool === 'whatsapp_prepare_send'
      ? 'WhatsApp'
      : row.tool === 'calendar_prepare_event'
        ? 'evento'
        : 'correo'
  const workspace =
    row.tool === 'whatsapp_prepare_send'
      ? {
          kind: 'whatsapp' as const,
          recipientName: recipient || undefined,
          body: '',
          incomplete: true,
        }
      : row.tool === 'calendar_prepare_event'
        ? {
            kind: 'event' as const,
            title: purpose.slice(0, 120),
            incomplete: true,
          }
        : {
            kind: 'email' as const,
            to: [] as string[],
            subject: purpose.slice(0, 120),
            body: '',
            incomplete: true,
          }
  const preview = {
    title: `${channelLabel} (borrador de llamada)`,
    summary: `Actualice el borrador de ${channelLabel} sobre "${purpose}". Se rellena al terminar. No se envia solo.`,
    fields: [
      { label: 'Destinatario', to: recipient || 'Por confirmar' },
      { label: 'Proposito', to: purpose },
    ],
    workspace,
  }
  const { error } = await actor.supabase
    .from('assistant_pending_ops')
    .update({ payload, preview })
    .eq('id', row.id)
    .eq('status', 'pending')
  if (error) throw error
  return {
    id: row.id,
    tool: row.tool as CopilotProposal['tool'],
    title: preview.title,
    summary: preview.summary,
    fields: preview.fields,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    workspace,
  }
}

async function prepareOne(
  actor: CopilotActor,
  input: {
    channel: Exclude<CommunicationChannel, 'both' | 'unspecified'>
    purpose: string
    recipient?: string
    utteredAt?: string
    timeAnchor?: string
    attendees?: string[]
    sessionId: string
    idempotencyKey: string
    contentInstructions?: string
    conversationContext?: string
  }
): Promise<CopilotProposal> {
  const existing = await findByIdempotencyKey(actor, input.sessionId, input.idempotencyKey)
  const match = existing.find((row) => channelForTool(row.tool) === input.channel)
  if (match) {
    return {
      id: match.id,
      tool: match.tool as CopilotProposal['tool'],
      title: asString(match.preview.title, 120) || 'Borrador',
      summary: asString(match.preview.summary, 280) || 'Borrador ya anotado.',
      fields: Array.isArray(match.preview.fields)
        ? (match.preview.fields as CopilotProposal['fields'])
        : [],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      workspace:
        match.preview.workspace && typeof match.preview.workspace === 'object'
          ? (match.preview.workspace as CopilotProposal['workspace'])
          : undefined,
    }
  }

  // Deduplicar reformulaciones de voz: mismo canal + propósito + destinatario en la sesión.
  const latestSameChannel = await findLatestPendingByChannel(actor, input.sessionId, input.channel)
  if (latestSameChannel) {
    const prevPurpose = asString(latestSameChannel.payload.purpose, 500).toLowerCase().replace(/\s+/g, ' ')
    const nextPurpose = input.purpose.trim().toLowerCase().replace(/\s+/g, ' ')
    const prevRecipient = asString(latestSameChannel.payload.recipient_hint, 160).toLowerCase()
    const nextRecipient = (input.recipient || '').trim().toLowerCase()
    if (prevPurpose && prevPurpose === nextPurpose && prevRecipient === nextRecipient) {
      return {
        id: latestSameChannel.id,
        tool: latestSameChannel.tool as CopilotProposal['tool'],
        title: asString(latestSameChannel.preview.title, 120) || 'Borrador',
        summary: asString(latestSameChannel.preview.summary, 280) || 'Borrador ya anotado.',
        fields: Array.isArray(latestSameChannel.preview.fields)
          ? (latestSameChannel.preview.fields as CopilotProposal['fields'])
          : [],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        workspace:
          latestSameChannel.preview.workspace && typeof latestSameChannel.preview.workspace === 'object'
            ? (latestSameChannel.preview.workspace as CopilotProposal['workspace'])
            : undefined,
      }
    }
  }

  if (input.channel === 'whatsapp') {
    const proposal = await queueWhatsappDraft(actor, {
      purpose: input.purpose,
      recipient: input.recipient,
      utteredAt: input.utteredAt,
      sessionId: input.sessionId,
      contentInstructions: input.contentInstructions,
      conversationContext: input.conversationContext,
    })
    await stampIdempotencyKey(actor, proposal.id, input.idempotencyKey)
    return proposal
  }
  if (input.channel === 'event') {
    const proposal = await queueWorkspaceDraft(actor, {
      type: 'event',
      recipient: input.recipient,
      attendees: input.attendees,
      purpose: input.purpose,
      utteredAt: input.utteredAt,
      timeAnchor: input.timeAnchor,
      sessionId: input.sessionId,
      contentInstructions: input.contentInstructions,
      conversationContext: input.conversationContext,
    })
    await stampIdempotencyKey(actor, proposal.id, input.idempotencyKey)
    return proposal
  }
  const proposal = await queueWorkspaceDraft(actor, {
    type: 'email',
    recipient: input.recipient,
    purpose: input.purpose,
    utteredAt: input.utteredAt,
    timeAnchor: input.timeAnchor,
    sessionId: input.sessionId,
    contentInstructions: input.contentInstructions,
    conversationContext: input.conversationContext,
  })
  await stampIdempotencyKey(actor, proposal.id, input.idempotencyKey)
  return proposal
}

async function stampIdempotencyKey(actor: CopilotActor, opId: string, key: string) {
  const { data } = await actor.supabase
    .from('assistant_pending_ops')
    .select('payload')
    .eq('id', opId)
    .maybeSingle()
  const payload =
    data?.payload && typeof data.payload === 'object'
      ? (data.payload as Record<string, unknown>)
      : {}
  const next = withContentHash({ ...payload, idempotency_key: key })
  await actor.supabase.from('assistant_pending_ops').update({ payload: next }).eq('id', opId)
}

export type VoiceDraftMutationResult = {
  ok: boolean
  spoken: string
  pending_op_ids: string[]
  pending_op_id: string | null
  action: VoiceDraftAction
}

export async function mutateVoiceWorkspaceDraft(
  actor: CopilotActor,
  input: {
    action: VoiceDraftAction
    channel: CommunicationChannel
    purpose: string
    recipient?: string
    utteredAt?: string
    timeAnchor?: string
    attendees?: string[]
    sessionId: string
    pendingOpId?: string
    idempotencyKey?: string
    contentInstructions?: string
    conversationContext?: string
  }
): Promise<VoiceDraftMutationResult> {
  const purpose = input.purpose.trim()
  const channel = normalizeCommunicationChannel(input.channel)

  if (input.action === 'prepare' && channel === 'unspecified') {
    return {
      ok: false,
      spoken: '¿Lo prefieres por WhatsApp o correo? Dime el canal y lo dejo anotado.',
      pending_op_ids: [],
      pending_op_id: null,
      action: 'prepare',
    }
  }

  if (input.action === 'cancel') {
    let target: PendingDraftRow | null = null
    if (input.pendingOpId) {
      target = await loadPendingDraft(actor, input.sessionId, input.pendingOpId)
    } else if (channel !== 'both' && channel !== 'unspecified') {
      target = await findLatestPendingByChannel(actor, input.sessionId, channel)
    } else {
      const email = await findLatestPendingByChannel(actor, input.sessionId, 'email')
      const wa = await findLatestPendingByChannel(actor, input.sessionId, 'whatsapp')
      const ids: string[] = []
      if (email) {
        await cancelDraftRow(actor, email.id)
        ids.push(email.id)
      }
      if (wa) {
        await cancelDraftRow(actor, wa.id)
        ids.push(wa.id)
      }
      if (!ids.length) {
        return {
          ok: false,
          spoken: 'No encontre un borrador pendiente para cancelar. ¿Lo reintentamos?',
          pending_op_ids: [],
          pending_op_id: null,
          action: 'cancel',
        }
      }
      return {
        ok: true,
        spoken: 'Cancele el borrador. No se enviara.',
        pending_op_ids: ids,
        pending_op_id: ids[0] ?? null,
        action: 'cancel',
      }
    }
    if (!target) {
      return {
        ok: false,
        spoken: 'No encontre ese borrador para cancelar. ¿Lo reintentamos?',
        pending_op_ids: [],
        pending_op_id: null,
        action: 'cancel',
      }
    }
    await cancelDraftRow(actor, target.id)
    return {
      ok: true,
      spoken: 'Cancele el borrador. No se enviara.',
      pending_op_ids: [target.id],
      pending_op_id: target.id,
      action: 'cancel',
    }
  }

  if (input.action === 'update') {
    if (!purpose) {
      return {
        ok: false,
        spoken: 'Necesito el proposito para actualizar el borrador. ¿Lo reintentamos?',
        pending_op_ids: [],
        pending_op_id: null,
        action: 'update',
      }
    }
    let target: PendingDraftRow | null = null
    if (input.pendingOpId) {
      target = await loadPendingDraft(actor, input.sessionId, input.pendingOpId)
    } else if (channel !== 'both' && channel !== 'unspecified') {
      target = await findLatestPendingByChannel(actor, input.sessionId, channel)
    }
    if (!target) {
      return {
        ok: false,
        spoken: 'No encontre el borrador a actualizar. ¿Lo reintentamos?',
        pending_op_ids: [],
        pending_op_id: null,
        action: 'update',
      }
    }

    const currentChannel = channelForTool(target.tool)
    const nextChannel =
      channel === 'both' || channel === 'unspecified' ? currentChannel : channel
    if (nextChannel !== currentChannel) {
      await cancelDraftRow(actor, target.id)
      const key = buildVoiceDraftIdempotencyKey({
        idempotencyKey: input.idempotencyKey || `update:${target.id}:${nextChannel}`,
        utteredAt: input.utteredAt,
        channel: nextChannel,
        purpose,
      })
      const created = await prepareOne(actor, {
        channel: nextChannel,
        purpose,
        recipient: input.recipient,
        utteredAt: input.utteredAt,
        timeAnchor: input.timeAnchor,
        attendees: input.attendees,
        sessionId: input.sessionId,
        idempotencyKey: key,
        contentInstructions: input.contentInstructions,
        conversationContext: input.conversationContext,
      })
      return {
        ok: true,
        spoken: `Cambie el canal y deje el borrador nuevo para revision al terminar. No se envio.`,
        pending_op_ids: [created.id],
        pending_op_id: created.id,
        action: 'update',
      }
    }

    const updated = await patchDraftRow(actor, target, {
      recipient: input.recipient,
      purpose,
      contentInstructions: input.contentInstructions,
      conversationContext: input.conversationContext,
    })
    return {
      ok: true,
      spoken: 'Actualice el borrador. Quedara para revision al terminar. No se envio.',
      pending_op_ids: [updated.id],
      pending_op_id: updated.id,
      action: 'update',
    }
  }

  // prepare
  if (!purpose) {
    return {
      ok: false,
      spoken:
        'Necesito el proposito del mensaje (correo, WhatsApp o evento) para dejar el borrador. No envio nada ahora.',
      pending_op_ids: [],
      pending_op_id: null,
      action: 'prepare',
    }
  }

  if (channel === 'unspecified') {
    return {
      ok: false,
      spoken: '¿Lo prefieres por WhatsApp o correo? Dime el canal y lo dejo anotado.',
      pending_op_ids: [],
      pending_op_id: null,
      action: 'prepare',
    }
  }

  const channels: Array<Exclude<CommunicationChannel, 'both' | 'unspecified'>> =
    channel === 'both' ? ['email', 'whatsapp'] : [channel]
  const ids: string[] = []
  const labels: string[] = []
  for (const ch of channels) {
    const key = buildVoiceDraftIdempotencyKey({
      idempotencyKey:
        channel === 'both' && input.idempotencyKey
          ? `${input.idempotencyKey}:${ch}`
          : input.idempotencyKey,
      utteredAt: input.utteredAt,
      channel: ch,
      purpose,
    })
    const proposal = await prepareOne(actor, {
      channel: ch,
      purpose,
      recipient: input.recipient,
      utteredAt: input.utteredAt,
      timeAnchor: input.timeAnchor,
      attendees: input.attendees,
      sessionId: input.sessionId,
      idempotencyKey: key,
      contentInstructions: input.contentInstructions,
      conversationContext: input.conversationContext,
    })
    ids.push(proposal.id)
    labels.push(ch === 'whatsapp' ? 'WhatsApp' : ch === 'event' ? 'evento' : 'correo')
  }
  const list = labels.join(' y ')
  return {
    ok: true,
    spoken: `Deje borrador${ids.length > 1 ? 'es' : ''} de ${list} para revisar al terminar. No se envio.`,
    pending_op_ids: ids,
    pending_op_id: ids[0] ?? null,
    action: 'prepare',
  }
}

/** Exported for focused unit access. */
export const __test = {
  buildVoiceDraftIdempotencyKey,
  normalizeVoiceDraftAction,
}
