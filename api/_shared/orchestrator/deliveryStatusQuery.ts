/**
 * Consultas bajo demanda sobre el estado real de envíos de WhatsApp y correo.
 * Lee únicamente registros del actor autenticado (assistant_pending_ops,
 * whatsapp_messages y notification_email_logs) y nunca inventa estados de entrega.
 */
import type { AgentActor } from '../query/resolveActor.js'
import {
  formatOnDemandDeliveryStatus,
  normalizeInternalDeliveryState,
  type CommunicationChannel,
  type InternalDeliveryState,
} from './deliveryReplyPolicy.js'

export type DeliveryStatusQueryParams = {
  channel?: CommunicationChannel
  recipientHint?: string
  todayOnly?: boolean
  problemsOnly?: boolean
}

function fold(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function matchDeliveryStatusQuery(utterance: string): DeliveryStatusQueryParams | null {
  const t = fold(utterance)
  if (!t || t.length > 220) return null

  // Exclude explicit send/draft commands ("envíame un correo", "manda un whatsapp")
  if (/^(envia|enviame|enviale|manda|mandame|mandale|prepara|redacta|crea|cambia|actualiza|agrega|registra|marca)\b/.test(t)) {
    return null
  }

  const isStatusQuestion =
    /\b(ya se envio|ya se mando|se envio|se mando|le llego|llego el|llego mi|fue enviado|fue entregado|que mensajes envie|que correos envie|que whatsapp envie|mensajes envie hoy|correos envie hoy|envios de hoy|estado del envio|estado de envio|hubo algun problema|fallo algun envio|fallo el envio|hubo error al enviar)\b/.test(
      t
    )

  if (!isStatusQuestion) return null

  const channel: CommunicationChannel | undefined = /\b(correo|mail|email)\b/.test(t)
    ? 'email'
    : /\b(whatsapp|wa|mensaje|mensajes)\b/.test(t)
      ? 'whatsapp'
      : undefined

  const todayOnly = /\b(hoy|de hoy)\b/.test(t)
  const problemsOnly = /\b(problema|fallo|error|incierto)\b/.test(t)

  const recipientMatch = t.match(/\b(?:a|para)\s+([a-zñ]+(?:\s+[a-zñ]+)?)\b/)
  const rawRecipient = recipientMatch?.[1]?.trim()
  const ignoredWords = new Set(['hoy', 'ayer', 'alguien', 'todos', 'mi', 'el', 'la', 'un', 'una', 'enviar', 'mandar'])
  const recipientHint =
    rawRecipient && !ignoredWords.has(rawRecipient) ? rawRecipient : undefined

  return {
    ...(channel ? { channel } : {}),
    ...(recipientHint ? { recipientHint } : {}),
    ...(todayOnly ? { todayOnly: true } : {}),
    ...(problemsOnly ? { problemsOnly: true } : {}),
  }
}

export type DeliveryStatusRecord = {
  opId: string
  channel: CommunicationChannel
  recipientName: string
  state: InternalDeliveryState
  createdAt: string
  summaryLine: string
}

type PendingOpRow = {
  id: string
  tool: string
  status: string
  created_at: string
  decided_at?: string | null
  error_message?: string | null
  payload?: Record<string, unknown> | null
  preview?: { workspace?: { recipientName?: string; toUserId?: string } } | null
  result?: { email_id?: string; meta_message_id?: string; delivery_status?: string } | null
}

type WaMessageRow = {
  meta_message_id?: string | null
  client_request_id?: string | null
  delivery_status?: string | null
  sent_at?: string | null
  delivered_at?: string | null
  read_at?: string | null
  failed_at?: string | null
  error_message?: string | null
}

type EmailLogRow = {
  id?: string | null
  email_id?: string | null
  status?: string | null
  error_message?: string | null
  created_at?: string | null
}

function shortTime(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(11, 16) + ' UTC'
}

export async function queryDeliveryStatusForActor(
  actor: AgentActor,
  params: DeliveryStatusQueryParams,
  now = new Date()
): Promise<{ records: DeliveryStatusRecord[]; answer: string }> {
  const supabase = actor.copilot.supabase
  const tools =
    params.channel === 'email'
      ? ['notify_user_email']
      : params.channel === 'whatsapp'
        ? ['whatsapp_prepare_send']
        : ['whatsapp_prepare_send', 'notify_user_email']

  const startOfDayIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  ).toISOString()

  let query = supabase
    .from('assistant_pending_ops')
    .select('id,tool,status,created_at,decided_at,error_message,payload,preview,result')
    .eq('usuario_id', actor.usuarioId)
    .in('tool', tools)
    .order('created_at', { ascending: false })
    .limit(15)

  if (params.todayOnly) {
    query = query.gte('created_at', startOfDayIso)
  }

  const { data: opsData, error: opsError } = await query
  if (opsError) {
    return {
      records: [],
      answer: 'No pude consultar el historial de envíos en este momento. Intenta de nuevo en unos segundos.',
    }
  }

  const ops = (opsData ?? []) as PendingOpRow[]
  if (ops.length === 0) {
    const scope = params.todayOnly ? ' hoy' : ''
    const kind =
      params.channel === 'email' ? 'correos' : params.channel === 'whatsapp' ? 'mensajes de WhatsApp' : 'envíos'
    return {
      records: [],
      answer: `No encontré ${kind} registrados${scope}.`,
    }
  }

  const waIds = ops
    .map((op) => op.result?.meta_message_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  const emailIds = ops
    .map((op) => op.result?.email_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const waByMetaId = new Map<string, WaMessageRow>()
  if (waIds.length > 0) {
    const { data: waRows } = await supabase
      .from('whatsapp_messages')
      .select('meta_message_id,client_request_id,delivery_status,sent_at,delivered_at,read_at,failed_at,error_message')
      .in('meta_message_id', waIds)
    for (const row of (waRows ?? []) as WaMessageRow[]) {
      if (row.meta_message_id) waByMetaId.set(row.meta_message_id, row)
    }
  }

  const emailById = new Map<string, EmailLogRow>()
  if (emailIds.length > 0) {
    const { data: emailRows } = await supabase
      .from('notification_email_logs')
      .select('id,email_id,status,error_message,created_at')
      .in('email_id', emailIds)
    for (const row of (emailRows ?? []) as EmailLogRow[]) {
      if (row.email_id) emailById.set(row.email_id, row)
    }
  }

  const records: DeliveryStatusRecord[] = []
  for (const op of ops) {
    const channel: CommunicationChannel = op.tool === 'notify_user_email' ? 'email' : 'whatsapp'
    const recipientName = String(
      op.preview?.workspace?.recipientName ??
        op.payload?.recipient_hint ??
        op.payload?.to_email ??
        'destinatario'
    ).trim()

    if (params.recipientHint) {
      const targetFold = fold(recipientName)
      if (!targetFold.includes(fold(params.recipientHint))) continue
    }

    const waRow = op.result?.meta_message_id ? waByMetaId.get(op.result.meta_message_id) : undefined
    const emailRow = op.result?.email_id ? emailById.get(op.result.email_id) : undefined

    const state = normalizeInternalDeliveryState({
      deliveryStatus: waRow?.delivery_status ?? emailRow?.status ?? op.result?.delivery_status ?? null,
      operationStatus: op.status,
      hasProviderId: Boolean(op.result?.meta_message_id || op.result?.email_id),
      errorMessage: waRow?.error_message ?? emailRow?.error_message ?? op.error_message ?? null,
    })

    if (params.problemsOnly && state !== 'failed' && state !== 'unknown') {
      continue
    }

    const ts =
      waRow?.read_at ??
      waRow?.delivered_at ??
      waRow?.failed_at ??
      waRow?.sent_at ??
      emailRow?.created_at ??
      op.decided_at ??
      op.created_at

    records.push({
      opId: op.id,
      channel,
      recipientName,
      state,
      createdAt: op.created_at,
      summaryLine: formatOnDemandDeliveryStatus({
        channel,
        state,
        recipientName,
        timestampLabel: shortTime(ts),
      }),
    })
  }

  if (records.length === 0) {
    if (params.problemsOnly) {
      return {
        records: [],
        answer: 'No encontré fallos ni envíos con resultado incierto en tus registros recientes.',
      }
    }
    const target = params.recipientHint ? ` para ${params.recipientHint}` : ''
    const scope = params.todayOnly ? ' hoy' : ''
    return {
      records: [],
      answer: `No encontré envíos registrados${target}${scope}.`,
    }
  }

  if (records.length === 1 || (!params.todayOnly && !params.problemsOnly)) {
    return {
      records: [records[0]!],
      answer: records[0]!.summaryLine,
    }
  }

  const lines = records.slice(0, 5).map((r) => `- ${r.summaryLine}`)
  return {
    records: records.slice(0, 5),
    answer: `Esto es lo que encontré en tus registros (${records.length}):\n${lines.join('\n')}`,
  }
}
