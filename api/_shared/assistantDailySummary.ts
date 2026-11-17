import { createPendingOp, type CopilotActor } from './assistantPending.js'

const SETTINGS_TABLE = 'daily_action_summary_settings'
const SETTINGS_ID = 'default'
const CONFIG_FIELDS = 'enabled,send_time,timezone,send_days,recipient_mode,selected_usuario_ids,send_if_no_pending'

async function loadSettings(actor: CopilotActor) {
  if (!actor.accessToken) {
    throw new Error('PERMISSION_DENIED: Consulta el resumen diario desde una sesión web autenticada.')
  }
  const { data: canManage, error: permissionError } = await actor.supabase.rpc('can_manage_catalogs')
  if (permissionError) throw new Error('DATABASE_ERROR: No se pudo verificar el permiso de configuración.')
  if (!canManage) throw new Error('PERMISSION_DENIED: La configuración del resumen diario requiere permisos de administración.')
  const { data, error } = await actor.supabase.from(SETTINGS_TABLE)
    .select(CONFIG_FIELDS)
    .eq('id', SETTINGS_ID)
    .maybeSingle()
  if (error) throw new Error('DATABASE_ERROR: No se pudo consultar el resumen diario.')
  if (!data) throw new Error('CONFIGURATION_ERROR: Falta la configuración del resumen diario.')
  return data
}

export async function readDailySummary(actor: CopilotActor, includeHistory: boolean) {
  const settings = await loadSettings(actor)
  if (!includeHistory) return { settings }
  const { data, error } = await actor.supabase.from('daily_action_summary_logs')
    .select('usuario_id,target_date,status,created_at')
    .eq('settings_id', SETTINGS_ID)
    .eq('is_test', false)
    .order('created_at', { ascending: false })
    .limit(15)
  if (error) throw new Error('DATABASE_ERROR: No se pudo consultar el historial del resumen diario.')
  return { settings, attempts: data ?? [] }
}

function validatePatch(args: Record<string, unknown>) {
  const patch: { enabled?: boolean; send_time?: string; timezone?: string } = {}
  if (typeof args.enabled === 'boolean') patch.enabled = args.enabled
  if (args.send_time !== undefined) {
    if (typeof args.send_time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(args.send_time)) {
      throw new Error('VALIDATION_FAILED: Indica un horario en formato HH:MM de 24 horas.')
    }
    patch.send_time = args.send_time
  }
  if (args.timezone !== undefined) {
    const zone = typeof args.timezone === 'string' ? args.timezone.trim() : ''
    try {
      if (!zone || /^[+-]/.test(zone)) throw new RangeError()
      new Intl.DateTimeFormat('es-MX', { timeZone: zone })
    } catch {
      throw new Error('VALIDATION_FAILED: Indica una zona horaria IANA, como America/Mexico_City.')
    }
    patch.timezone = zone
  }
  return patch
}

export async function proposeDailySummaryUpdate(actor: CopilotActor, args: Record<string, unknown>) {
  const before = await loadSettings(actor)
  const patch = validatePatch(args)
  if (!Object.keys(patch).length) throw new Error('VALIDATION_FAILED: Indica el cambio al resumen diario global.')
  return createPendingOp(actor, {
    tool: 'update_daily_action_summary',
    channel: 'web',
    payload: { patch, before },
    proposal: {
      title: 'Actualizar el resumen diario global',
      summary: 'Se aplicará al correo diario de acciones configurado en Scrumban.',
      fields: [
        { label: 'Estado', from: before.enabled ? 'Activo' : 'Pausado', to: (patch.enabled ?? before.enabled) ? 'Activo' : 'Pausado' },
        { label: 'Horario', from: before.send_time.slice(0, 5), to: patch.send_time ?? before.send_time.slice(0, 5) },
        { label: 'Zona horaria', from: before.timezone, to: patch.timezone ?? before.timezone },
      ],
    },
  })
}

export async function executeDailySummaryUpdate(actor: CopilotActor, payload: Record<string, unknown>) {
  const current = await loadSettings(actor)
  const before = payload.before as typeof current | undefined
  const patch = validatePatch((payload.patch ?? {}) as Record<string, unknown>)
  if (!before || !Object.keys(patch).length ||
      Object.entries(current).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before]))) {
    throw new Error('VALIDATION_FAILED: La configuración del resumen cambió después de la vista previa.')
  }
  const { data, error } = await actor.supabase.from(SETTINGS_TABLE)
    .update({ ...patch, updated_by: actor.usuarioId })
    .eq('id', SETTINGS_ID)
    .eq('enabled', before.enabled)
    .eq('send_time', before.send_time)
    .eq('timezone', before.timezone)
    .eq('send_days', before.send_days)
    .eq('recipient_mode', before.recipient_mode)
    .eq('selected_usuario_ids', `{${before.selected_usuario_ids.join(',')}}`)
    .eq('send_if_no_pending', before.send_if_no_pending)
    .select('id')
    .maybeSingle()
  if (error) throw new Error('DATABASE_ERROR: No se pudo actualizar el resumen diario.')
  if (!data) throw new Error('VALIDATION_FAILED: La configuración del resumen cambió después de la vista previa.')
  return { id: data.id, title: 'Resumen diario de acciones' }
}
