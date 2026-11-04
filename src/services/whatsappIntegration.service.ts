import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/client'

export type WhatsAppScope = 'corporate' | 'team'
export type WhatsAppMessageType = 'initial' | 'checkpoint_followup' | 'commitment_close'

export type WhatsAppIdentity = {
  id: string
  usuario_id: string
  external_user_id: string
  display_name: string | null
  status: string
  verified_at: string | null
  last_seen_at: string | null
}

export type WhatsAppFollowupSettings = {
  id: string
  followup_delay_minutes: number
  followups_per_day: number
  initial_text_template: string
  checkpoint_followup_template: string
  commitment_close_template: string
  updated_at: string
}

export type UpdateWhatsAppFollowupSettingsInput = {
  followup_delay_minutes: number
  followups_per_day: number
  initial_text_template: string
  checkpoint_followup_template: string
  commitment_close_template: string
}

const SETTINGS_ID = 'default'

const DEFAULT_SETTINGS: WhatsAppFollowupSettings = {
  id: SETTINGS_ID,
  followup_delay_minutes: 5,
  followups_per_day: 1,
  initial_text_template:
    'Hola {{responsable_nombre}}. Nueva actividad: {{titulo_accion}}. Compromiso: {{fecha_compromiso}}.{{checklist_bloque}}',
  checkpoint_followup_template:
    'Seguimiento: {{titulo_accion}}. Checkpoint: {{checkpoint_texto}}. Responde con el boton correspondiente.',
  commitment_close_template:
    'Cierre de compromiso: {{titulo_accion}}. Fecha: {{fecha_compromiso}}. Gracias.',
  updated_at: new Date(0).toISOString(),
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

async function invokeSendAction(body: Record<string, unknown>) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sesión no disponible para enviar WhatsApp.')
  if (!SUPABASE_URL) throw new Error('Supabase URL no configurada.')

  const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send-action`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    detail?: unknown
  }
  if (!response.ok || json.ok === false) {
    const code = json.error || `http_${response.status}`
    const map: Record<string, string> = {
      whatsapp_identity_missing: 'El responsable no tiene WhatsApp vinculado.',
      action_unassigned: 'La acción no tiene responsable asignado.',
      missing_whatsapp_secrets: 'Faltan secrets de WhatsApp en el servidor.',
      graph_send_failed: 'Meta rechazó el envío de WhatsApp.',
      invalid_whatsapp_phone: 'El teléfono de WhatsApp no es válido.',
    }
    const metaMessage = extractMetaGraphError(json.detail)
    throw new Error(
      metaMessage
        ? `${map[code] || `No se pudo enviar por WhatsApp (${code}).`} ${metaMessage}`
        : map[code] || `No se pudo enviar por WhatsApp (${code}).`
    )
  }
  return json
}

function extractMetaGraphError(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object') return null
  const err = (detail as { error?: { message?: unknown; error_user_msg?: unknown; code?: unknown } })
    .error
  if (!err) return null
  const message =
    (typeof err.error_user_msg === 'string' && err.error_user_msg.trim()) ||
    (typeof err.message === 'string' && err.message.trim()) ||
    null
  if (!message) return null
  if (/Object with ID .* does not exist|missing permissions|error_subcode.?33/i.test(message)) {
    return 'Revisa WHATSAPP_PHONE_NUMBER_ID y que el token tenga acceso a ese número Cloud API.'
  }
  if (/template name .* does not exist|code.?132001/i.test(message)) {
    return 'Revisa WHATSAPP_INITIAL_TEMPLATE_NAME / LANGUAGE (debe coincidir con la plantilla aprobada en Meta, p. ej. nueva_actividad_what2do / en).'
  }
  return message
}

export const whatsappIntegrationService = {
  normalizePhone,

  async getIdentity(usuarioId: string): Promise<WhatsAppIdentity | null> {
    const { data, error } = await supabase
      .from('user_channel_identities')
      .select('id,usuario_id,external_user_id,display_name,status,verified_at,last_seen_at')
      .eq('channel', 'whatsapp')
      .eq('usuario_id', usuarioId)
      .eq('status', 'active')
      .maybeSingle()
    if (error) throw error
    return (data as WhatsAppIdentity | null) ?? null
  },

  async upsertIdentity(input: {
    usuarioId: string
    phone: string
    displayName?: string | null
  }): Promise<string> {
    let phone = normalizePhone(input.phone)
    if (phone.length === 10) phone = `52${phone}`
    if (phone.length < 10 || phone.length > 15) {
      throw new Error('El celular debe tener 10 dígitos (MX) o 10–15 con código de país.')
    }
    const { data, error } = await supabase.rpc('admin_upsert_whatsapp_identity', {
      p_usuario_id: input.usuarioId,
      p_phone: phone,
      p_display_name: input.displayName?.trim() || null,
    })
    if (error) throw new Error(error.message || 'No se pudo guardar el WhatsApp')
    return data as string
  },

  async clearIdentity(usuarioId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_clear_whatsapp_identity', {
      p_usuario_id: usuarioId,
    })
    if (error) throw new Error(error.message || 'No se pudo desvincular WhatsApp')
  },

  async sendAction(input: {
    accionId: string
    messageType?: WhatsAppMessageType
    checkpointId?: string
  }) {
    return invokeSendAction({
      scope: 'corporate',
      messageType: input.messageType ?? 'initial',
      accionId: input.accionId,
      checkpointId: input.checkpointId,
    })
  },

  async sendTeamAction(input: {
    teamActionId: string
    messageType?: WhatsAppMessageType
    checklistIndex?: number
  }) {
    return invokeSendAction({
      scope: 'team',
      messageType: input.messageType ?? 'initial',
      teamActionId: input.teamActionId,
      checklistIndex: input.checklistIndex,
    })
  },

  async getSettings(): Promise<WhatsAppFollowupSettings> {
    const { data, error } = await supabase
      .from('whatsapp_followup_settings')
      .select(
        'id,followup_delay_minutes,followups_per_day,initial_text_template,checkpoint_followup_template,commitment_close_template,updated_at'
      )
      .eq('id', SETTINGS_ID)
      .maybeSingle()
    if (error) throw error
    return { ...DEFAULT_SETTINGS, ...(data as Partial<WhatsAppFollowupSettings> | null) }
  },

  async updateSettings(input: UpdateWhatsAppFollowupSettingsInput): Promise<WhatsAppFollowupSettings> {
    const { data, error } = await supabase
      .from('whatsapp_followup_settings')
      .update({
        followup_delay_minutes: input.followup_delay_minutes,
        followups_per_day: input.followups_per_day,
        initial_text_template: input.initial_text_template,
        checkpoint_followup_template: input.checkpoint_followup_template,
        commitment_close_template: input.commitment_close_template,
      })
      .eq('id', SETTINGS_ID)
      .select(
        'id,followup_delay_minutes,followups_per_day,initial_text_template,checkpoint_followup_template,commitment_close_template,updated_at'
      )
      .single()
    if (error) throw error
    return data as WhatsAppFollowupSettings
  },
}
