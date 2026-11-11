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
import { withContentHash } from './workspaceHash.js'

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
    const kind = asString(payload.draft_kind, 12) || (draft.tool.startsWith('calendar_') ? 'event' : 'email')
    const purpose = asString(payload.purpose, 500)
    const utteredAt = asString(payload.uttered_at, 40) || (input.now ?? new Date()).toISOString()
    const anchor = asString(payload.time_anchor, 80)
    const today = cdmxYmdFromInstant(utteredAt)
    const context = sentencesNear(transcript, purpose || asString(payload.recipient_hint, 80))
    const recipientHint = asString(payload.recipient_hint, 160)
    const attendeeHint = Array.isArray(payload.attendees_hint)
      ? payload.attendees_hint.map((item) => String(item))
      : []

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
    const body = clipText(context || purpose, 4000) || purpose
    const workspace: CopilotWorkspacePreview = {
      kind: 'email',
      to,
      subject,
      body,
      incomplete: false,
    }
    const nextPayload = withContentHash({
      ...payload,
      incomplete: false,
      to,
      subject,
      body,
      recipient_hint: recipientHint,
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
    const payload =
      row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {}
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
    const { error: updateError } = await supabase
      .from('assistant_pending_ops')
      .update({ payload: item.payload, preview: item.preview })
      .eq('id', item.id)
      .eq('status', 'pending')
    if (updateError) console.error('workspace draft fill', updateError.message)
  }
  return filled.length
}
