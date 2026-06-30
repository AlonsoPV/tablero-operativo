import { supabase } from '@/lib/supabase/client'
import type {
  DailyActionSummaryLog,
  DailyActionSummarySettings,
  UpdateDailyActionSummarySettingsInput,
} from '../types/dailyActionSummary.types'

const SETTINGS_TABLE = 'daily_action_summary_settings'
const LOGS_TABLE = 'daily_action_summary_logs'
const SETTINGS_ID = 'default'

const DEFAULT_SETTINGS: DailyActionSummarySettings = {
  id: SETTINGS_ID,
  enabled: false,
  send_time: '08:00',
  timezone: 'America/Mexico_City',
  send_days: 'weekdays',
  recipient_mode: 'all_active',
  selected_usuario_ids: [],
  send_if_no_pending: false,
  last_run_at: null,
  last_status: null,
  last_message: null,
  last_counts: {},
  scheduler_last_checked_at: null,
  scheduler_last_status: null,
  scheduler_last_message: null,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
}

function normalizeSettings(row: Partial<DailyActionSummarySettings> | null): DailyActionSummarySettings {
  if (!row) return DEFAULT_SETTINGS
  return {
    ...DEFAULT_SETTINGS,
    ...row,
    id: SETTINGS_ID,
    send_time: String(row.send_time ?? DEFAULT_SETTINGS.send_time).slice(0, 5),
    selected_usuario_ids: Array.isArray(row.selected_usuario_ids) ? row.selected_usuario_ids : [],
    last_counts: row.last_counts && typeof row.last_counts === 'object' ? row.last_counts : {},
  }
}

export const dailyActionSummaryService = {
  async getSettings(): Promise<DailyActionSummarySettings> {
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle()

    if (error) throw error
    return normalizeSettings(data as Partial<DailyActionSummarySettings> | null)
  },

  async updateSettings(input: UpdateDailyActionSummarySettingsInput, updatedBy: string | null) {
    const payload = {
      id: SETTINGS_ID,
      enabled: input.enabled,
      send_time: input.send_time,
      timezone: input.timezone.trim(),
      send_days: input.send_days,
      recipient_mode: input.recipient_mode,
      selected_usuario_ids: input.selected_usuario_ids,
      send_if_no_pending: input.send_if_no_pending,
      updated_by: updatedBy,
    }

    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single()

    if (error) throw error
    return normalizeSettings(data as Partial<DailyActionSummarySettings>)
  },

  async listLogs(limit = 10): Promise<DailyActionSummaryLog[]> {
    const { data, error } = await supabase
      .from(LOGS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data ?? []) as DailyActionSummaryLog[]
  },

  async sendTest(testEmail?: string) {
    const { data, error } = await supabase.functions.invoke('daily-action-summary', {
      body: { mode: 'test', test_email: testEmail?.trim() || undefined },
    })
    if (error) throw error
    if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
      const message = 'message' in data && typeof data.message === 'string'
        ? data.message
        : 'No se pudo enviar el correo de prueba.'
      throw new Error(message)
    }
    return data
  },
}
