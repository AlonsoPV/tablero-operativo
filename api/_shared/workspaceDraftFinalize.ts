import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDueDateHint } from '../../src/features/ai-support/parseWorkFacts.js'
import {
  addMinutesHm,
  cdmxWallToRfc3339,
  cdmxYmdFromInstant,
  clipText,
  emailsFromUnknown,
  formatAbsoluteCdmx,
  type CopilotWorkspacePreview,
} from '../../src/features/ai-support/copilot/googleWorkspace.js'
import { WHATSAPP_BODY_MAX } from '../../src/features/ai-support/copilot/communicationTools.js'
import { withContentHash } from './workspaceHash.js'
import { resolveCommunicationRecipient } from './resolveCommunicationRecipient.js'
import { maskPhone } from './guideInterviewReport.js'
import { parseExecutiveReport } from './guideWork.js'

export type WorkspaceDraftRow = {
  id: string
  tool: string
  payload: Record<string, unknown>
  preview: Record<string, unknown>
}

export type FilledWorkspaceDraft = {
  id: string
  payload: Record<string, unknown>
  preview: Record<string, unknown>
  workspace: CopilotWorkspacePreview
}

function asString(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function sentencesNear(transcript: string, needle: string, radius = 420) {
  if (!needle) return ''
  const lower = transcript.toLowerCase()
  const at = lower.indexOf(needle.toLowerCase().slice(0, 40))
  if (at < 0) return clipText(transcript, radius)
  const start = Math.max(0, at - 80)
  return clipText(transcript.slice(start, at + radius), 900)
}

function extractEmail(text: string) {
  return emailsFromUnknown(text)[0] || ''
}

/** Acuerdos / pendientes del informe (JSON v3 o texto) sin inventar cifras. */
export function extractAgreementsFromReport(report?: string): string {
  if (!report?.trim()) return ''
  let raw: unknown = report
  if (report.trim().startsWith('{')) {
    try {
      raw = JSON.parse(report) as unknown
    } catch {
      raw = report
    }
  }
  const parsed = parseExecutiveReport(raw)
  if (parsed && (parsed.agreed?.length || parsed.pending?.length || parsed.verified?.length)) {
    const parts = [
      ...(parsed.agreed ?? []).map((line) => `Acuerdo: ${line}`),
      ...(parsed.pending ?? []).map((line) => `Pendiente: ${line}`),
      ...(parsed.verified ?? []).slice(0, 4).map((line) => `Hecho: ${line}`),
    ]
    return clipText(parts.filter(Boolean).join('\n'), 1200)
  }
  if (typeof raw === 'string') return clipText(raw, 800)
  return ''
}

export function buildCommunicationDraftBody(input: {
  purpose: string
  contentInstructions?: string
  conversationContext?: string
  report?: string
  transcriptNear?: string
  maxLen: number
}): string {
  const agreements = extractAgreementsFromReport(input.report)
  const parts = [
    input.contentInstructions,
    input.conversationContext,
    agreements,
    input.transcriptNear,
    input.purpose,
  ].filter((part) => typeof part === 'string' && part.trim())
  return clipText(parts.join('\n\n'), input.maxLen) || input.purpose
}

export function fillWorkspaceDraftsFromTranscript(input: {
  drafts: WorkspaceDraftRow[]
  transcript: string
  report?: string
  now?: Date
}): FilledWorkspaceDraft[] {
  const transcript = [input.transcript, input.report].filter(Boolean).join('\n')
  const filled: FilledWorkspaceDraft[] = []

  for (const draft of input.drafts) {
    const payload = { ...draft.payload }
    if (payload.incomplete !== true) continue
    const kind =
      asString(payload.draft_kind, 12) ||
      (draft.tool === 'whatsapp_prepare_send'
        ? 'whatsapp'
        : draft.tool.startsWith('calendar_')
          ? 'event'
          : 'email')
    const purpose = asString(payload.purpose, 500)
    const contentInstructions = asString(payload.content_instructions, 500)
    const conversationContext = asString(payload.conversation_context, 800)
    const utteredAt = asString(payload.uttered_at, 40) || (input.now ?? new Date()).toISOString()
    const anchor = asString(payload.time_anchor, 80)
    const today = cdmxYmdFromInstant(utteredAt)
    const transcriptNear = sentencesNear(
      transcript,
      purpose || asString(payload.recipient_hint, 80)
    )
    const context = [
      conversationContext,
      contentInstructions,
      extractAgreementsFromReport(input.report),
      transcriptNear,
    ]
      .filter(Boolean)
      .join('\n')
    const recipientHint = asString(payload.recipient_hint, 160)
    const attendeeHint = Array.isArray(payload.attendees_hint)
      ? payload.attendees_hint.map((item) => String(item))
      : []

    if (kind === 'whatsapp') {
      // Recipient resolution is async in persistFilledWorkspaceDrafts; here we only draft body.
      const body = buildCommunicationDraftBody({
        purpose,
        contentInstructions,
        conversationContext,
        report: input.report,
        transcriptNear,
        maxLen: WHATSAPP_BODY_MAX,
      })
      const workspace: CopilotWorkspacePreview = {
        kind: 'whatsapp',
        recipientName: recipientHint || undefined,
        body,
        incomplete: false,
        needsInfo: !recipientHint,
        needsInfoReason: recipientHint ? undefined : 'Falta el destinatario del WhatsApp.',
      }
      const nextPayload = withContentHash({
        ...payload,
        incomplete: false,
        body,
        recipient_hint: recipientHint,
        needs_info: !recipientHint,
        needs_info_reason: recipientHint ? '' : 'Falta el destinatario del WhatsApp.',
      })
      filled.push({
        id: draft.id,
        payload: nextPayload,
        workspace,
        preview: {
          title: 'Enviar WhatsApp',
          summary: `WhatsApp a ${recipientHint || '(destinatario por confirmar)'}. Revisa y confirma; no se envio solo.`,
          fields: [
            { label: 'Para', to: recipientHint || '—' },
            { label: 'Mensaje', to: clipText(body, 280) },
          ],
          workspace,
        },
      })
      continue
    }

    if (kind === 'event') {
      const parsed = parseDueDateHint(anchor || context, today)
      const ymd = parsed.dateYmd || today
      const startHm = parsed.timeHm || '10:00'
      const endHm = addMinutesHm(startHm, 60)
      const attendees = [
        ...emailsFromUnknown(payload.attendees),
        ...attendeeHint.flatMap((item) => emailsFromUnknown(item)),
      ]
      const title = purpose || 'Evento acordado en la llamada'
      const description = clipText(context || purpose, 2000)
      const workspace: CopilotWorkspacePreview = {
        kind: 'event',
        title,
        start: `${ymd}T${startHm}`,
        end: `${ymd}T${endHm}`,
        attendees,
        body: description,
        incomplete: false,
      }
      const nextPayload = withContentHash({
        ...payload,
        incomplete: false,
        title,
        description,
        attendees,
        start: cdmxWallToRfc3339(ymd, startHm),
        end: cdmxWallToRfc3339(ymd, endHm),
        start_local: workspace.start,
        end_local: workspace.end,
      })
      filled.push({
        id: draft.id,
        payload: nextPayload,
        workspace,
        preview: {
          title: 'Crear evento',
          summary: `"${title}" el ${formatAbsoluteCdmx(workspace.start || '')} (CDMX). Revisa y confirma; no se creo solo.`,
          fields: [
            { label: 'Titulo', to: title },
            { label: 'Inicio', to: formatAbsoluteCdmx(workspace.start || '') },
            { label: 'Fin', to: formatAbsoluteCdmx(workspace.end || '') },
          ],
          workspace,
        },
      })
      continue
    }

    const hintedEmail = extractEmail(recipientHint) || extractEmail(context)
    const to = hintedEmail ? [hintedEmail] : emailsFromUnknown(payload.to)
    const subject = purpose || 'Seguimiento acordado en la llamada'
    const body = buildCommunicationDraftBody({
      purpose,
      contentInstructions,
      conversationContext,
      report: input.report,
      transcriptNear,
      maxLen: 4000,
    })
    const needsRecipient = to.length === 0 && !recipientHint
    const workspace: CopilotWorkspacePreview = {
      kind: 'email',
      to,
      subject,
      body,
      incomplete: false,
      needsInfo: needsRecipient,
      needsInfoReason: needsRecipient ? 'Falta el destinatario del correo.' : undefined,
      recipientName: recipientHint || undefined,
    }
    const nextPayload = withContentHash({
      ...payload,
      incomplete: false,
      to,
      subject,
      body,
      recipient_hint: recipientHint,
      needs_info: needsRecipient,
      needs_info_reason: needsRecipient ? 'Falta el destinatario del correo.' : '',
    })
    filled.push({
      id: draft.id,
      payload: nextPayload,
      workspace,
      preview: {
        title: 'Enviar correo',
        summary: `Correo a ${to.join(', ') || '(destinatario por confirmar)'}: ${subject}. Revisa y confirma; no se envio solo.`,
        fields: [
          { label: 'Para', to: to.join(', ') || '—' },
          { label: 'Asunto', to: subject },
          { label: 'Cuerpo', to: clipText(body, 280) },
        ],
        workspace,
      },
    })
  }

  return filled
}

export async function persistFilledWorkspaceDrafts(
  supabase: SupabaseClient,
  sessionId: string,
  transcript: string,
  report?: string
) {
  // Solo pending: canceladas/confirmadas no reaparecen ni se inventan desde transcript.
  const { data, error } = await supabase
    .from('assistant_pending_ops')
    .select('id,tool,payload,preview,status')
    .eq('session_id', sessionId)
    .eq('status', 'pending')
  if (error) {
    console.error('workspace drafts load', error.message)
    return 0
  }
  const drafts = (data ?? []).flatMap((row) => {
    if (String(row.status) !== 'pending') return []
    const payload =
      row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {}
    // Ya rellenados: no-op ante webhook duplicado.
    if (payload.incomplete !== true) return []
    return [
      {
        id: String(row.id),
        tool: String(row.tool),
        payload,
        preview: (row.preview && typeof row.preview === 'object'
          ? row.preview
          : {}) as Record<string, unknown>,
      },
    ]
  })
  const filled = fillWorkspaceDraftsFromTranscript({ drafts, transcript, report })

  for (const item of filled) {
    let payload = item.payload
    let preview = item.preview
    if (item.workspace.kind === 'whatsapp') {
      const resolved = await resolveCommunicationRecipient(
        supabase,
        asString(payload.recipient_hint, 160),
        'whatsapp'
      )
      const needsInfo = Boolean(resolved.needsInfoReason)
      const workspace: CopilotWorkspacePreview = {
        ...item.workspace,
        recipientName: resolved.name || item.workspace.recipientName,
        phone: resolved.phone ? maskPhone(resolved.phone) || undefined : undefined,
        toUserId: resolved.toUserId || undefined,
        needsInfo,
        needsInfoReason: resolved.needsInfoReason || undefined,
      }
      payload = withContentHash({
        ...payload,
        to_user_id: resolved.toUserId || '',
        to_phone: resolved.phone || '',
        recipient_hint: resolved.name || asString(payload.recipient_hint, 160),
        needs_info: needsInfo,
        needs_info_reason: resolved.needsInfoReason || '',
      })
      preview = {
        title: 'Enviar WhatsApp',
        summary: needsInfo
          ? `WhatsApp incompleto: ${resolved.needsInfoReason}`
          : `WhatsApp a ${workspace.recipientName || workspace.phone}. Revisa y confirma; no se envio solo.`,
        fields: [
          { label: 'Para', to: workspace.recipientName || '—' },
          { label: 'Numero', to: workspace.phone || '—' },
          { label: 'Mensaje', to: clipText(asString(payload.body, WHATSAPP_BODY_MAX), 280) },
        ],
        workspace,
      }
    } else if (item.workspace.kind === 'email') {
      const hint = asString(payload.recipient_hint, 160)
      const existingTo = Array.isArray(payload.to)
        ? payload.to.filter((itemTo): itemTo is string => typeof itemTo === 'string' && itemTo.includes('@'))
        : []
      if (existingTo.length === 0 && hint && !extractEmail(hint)) {
        const resolved = await resolveCommunicationRecipient(supabase, hint, 'email')
        const needsInfo = Boolean(resolved.needsInfoReason)
        const to = resolved.email ? [resolved.email] : []
        const workspace: CopilotWorkspacePreview = {
          ...item.workspace,
          to,
          recipientName: resolved.name || item.workspace.recipientName,
          needsInfo,
          needsInfoReason: resolved.needsInfoReason || undefined,
        }
        payload = withContentHash({
          ...payload,
          to,
          to_user_id: resolved.toUserId || '',
          recipient_hint: resolved.name || hint,
          needs_info: needsInfo || to.length === 0,
          needs_info_reason:
            resolved.needsInfoReason || (to.length === 0 ? 'Falta el destinatario del correo.' : ''),
        })
        preview = {
          title: 'Enviar correo',
          summary: needsInfo
            ? `Correo incompleto: ${resolved.needsInfoReason}`
            : `Correo a ${to.join(', ') || resolved.name || '(destinatario por confirmar)'}. Revisa y confirma; no se envio solo.`,
          fields: [
            { label: 'Para', to: to.join(', ') || resolved.name || '—' },
            { label: 'Asunto', to: asString(payload.subject, 120) || '—' },
            { label: 'Cuerpo', to: clipText(asString(payload.body, 4000), 280) },
          ],
          workspace,
        }
      }
    }

    const { error: updateError } = await supabase
      .from('assistant_pending_ops')
      .update({ payload, preview })
      .eq('id', item.id)
      .eq('status', 'pending')
    if (updateError) console.error('workspace draft fill', updateError.message)
  }
  return filled.length
}
