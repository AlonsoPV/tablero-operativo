import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/client'

export type WhatsAppConversation = {
  wa_id: string
  usuario_id: string | null
  contact_name: string
  phone: string
  last_message_text: string | null
  last_message_at: string
  last_direction: 'inbound' | 'outbound' | string
  last_delivery_status: string | null
  open_session: boolean
}

export type WhatsAppThreadMessage = {
  id: string
  wa_id: string
  usuario_id: string | null
  direction: 'inbound' | 'outbound' | string
  source: 'contact' | 'operator' | 'automation' | string
  message_kind: string
  body_text: string | null
  meta_message_id: string | null
  delivery_status: string
  operator_usuario_id: string | null
  error_message: string | null
  payload: Record<string, unknown>
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
}

export type WhatsAppInboxContact = {
  usuario_id: string
  nombre: string
  phone: string
  display_name: string | null
  last_seen_at: string | null
}

export type WhatsAppTemplateOption = {
  id: string
  name: string
  language: string
  label: string
  description: string
  bodyParams: Array<{ key: string; label: string; required: boolean }>
}

export type WhatsAppComposeOptions = {
  ok: boolean
  waId: string
  usuarioId: string
  openSession: boolean
  canSendFreeText: boolean
  templates: WhatsAppTemplateOption[]
  templateUnavailableReason: string | null
}

async function invokeInbox<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sesión no disponible.')
  if (!SUPABASE_URL) throw new Error('Supabase URL no configurada.')

  const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-inbox`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = (await response.json().catch(() => ({}))) as T & {
    ok?: boolean
    error?: string
    detail?: unknown
  }
  if (!response.ok || json.ok === false) {
    const code = json.error || `http_${response.status}`
    const map: Record<string, string> = {
      forbidden: 'No tienes permiso para la bandeja WhatsApp.',
      whatsapp_identity_missing: 'El contacto no tiene WhatsApp vinculado.',
      session_closed: 'La ventana de 24 h está cerrada. Usa una plantilla aprobada.',
      text_required: 'Escribe un mensaje.',
      template_params_required: 'Completa los campos de la plantilla.',
      graph_send_failed: 'Meta rechazó el envío de WhatsApp.',
      missing_whatsapp_secrets: 'Faltan secrets de WhatsApp en el servidor.',
    }
    const detail =
      typeof json.detail === 'string'
        ? json.detail
        : code === 'session_closed'
          ? map.session_closed
          : undefined
    throw new Error(detail || map[code] || `No se pudo completar la acción (${code}).`)
  }
  return json
}

export const whatsappInboxService = {
  async listConversations(input?: {
    search?: string
    limit?: number
    offset?: number
  }): Promise<WhatsAppConversation[]> {
    const { data, error } = await supabase.rpc('whatsapp_inbox_list_conversations', {
      p_search: input?.search?.trim() || null,
      p_limit: input?.limit ?? 50,
      p_offset: input?.offset ?? 0,
    })
    if (error) throw new Error(error.message || 'No se pudieron cargar las conversaciones.')
    return (data ?? []) as WhatsAppConversation[]
  },

  async listMessages(input: {
    waId: string
    limit?: number
    before?: string | null
  }): Promise<WhatsAppThreadMessage[]> {
    const { data, error } = await supabase.rpc('whatsapp_inbox_list_messages', {
      p_wa_id: input.waId,
      p_limit: input.limit ?? 50,
      p_before: input.before ?? null,
    })
    if (error) throw new Error(error.message || 'No se pudo cargar el hilo.')
    return (data ?? []) as WhatsAppThreadMessage[]
  },

  async listContacts(input?: { search?: string; limit?: number }): Promise<WhatsAppInboxContact[]> {
    const { data, error } = await supabase.rpc('whatsapp_inbox_list_contacts', {
      p_search: input?.search?.trim() || null,
      p_limit: input?.limit ?? 30,
    })
    if (error) throw new Error(error.message || 'No se pudieron cargar los contactos.')
    return (data ?? []) as WhatsAppInboxContact[]
  },

  async isSessionOpen(waId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('whatsapp_inbox_session_open', {
      p_wa_id: waId,
    })
    if (error) throw new Error(error.message || 'No se pudo verificar la ventana de 24 h.')
    return Boolean(data)
  },

  async getComposeOptions(input: {
    usuarioId?: string
    waId?: string
  }): Promise<WhatsAppComposeOptions> {
    return invokeInbox<WhatsAppComposeOptions>({
      action: 'compose_options',
      usuarioId: input.usuarioId,
      waId: input.waId,
    })
  },

  async sendMessage(input: {
    usuarioId?: string
    waId?: string
    mode: 'text' | 'template'
    text?: string
    templateParams?: string[]
    clientRequestId: string
  }) {
    return invokeInbox<{
      ok: boolean
      waId: string
      usuarioId: string
      messageId?: string
      externalMessageId?: string | null
      deduped?: boolean
      uncertain?: boolean
    }>({
      action: 'send',
      usuarioId: input.usuarioId,
      waId: input.waId,
      mode: input.mode,
      text: input.text,
      templateParams: input.templateParams,
      clientRequestId: input.clientRequestId,
    })
  },

  subscribeThread(waId: string, onChange: () => void): RealtimeChannel {
    const channel = supabase
      .channel(`whatsapp-inbox-${waId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `wa_id=eq.${waId}`,
        },
        () => onChange()
      )
      .subscribe()
    return channel
  },

  subscribeInbox(onChange: () => void): RealtimeChannel {
    const channel = supabase
      .channel('whatsapp-inbox-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
        },
        () => onChange()
      )
      .subscribe()
    return channel
  },

  async unsubscribe(channel: RealtimeChannel) {
    await supabase.removeChannel(channel)
  },
}
