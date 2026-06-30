export type DailySummarySendDays = 'weekdays' | 'mon_sat' | 'every_day'
export type DailySummaryRecipientMode = 'all_active' | 'leaders' | 'selected'
export type DailySummaryLastStatus =
  | 'ok'
  | 'sent'
  | 'partial_error'
  | 'skipped_disabled'
  | 'skipped_schedule'
  | 'config_error'
  | 'error'

export type DailySummarySchedulerStatus =
  | 'ok'
  | 'skipped_disabled'
  | 'skipped_schedule'
  | 'config_error'
  | 'error'

export interface DailyActionSummarySettings {
  id: 'default'
  enabled: boolean
  send_time: string
  timezone: string
  send_days: DailySummarySendDays
  recipient_mode: DailySummaryRecipientMode
  selected_usuario_ids: string[]
  send_if_no_pending: boolean
  last_run_at: string | null
  last_status: DailySummaryLastStatus | null
  last_message: string | null
  last_counts: Record<string, unknown>
  scheduler_last_checked_at: string | null
  scheduler_last_status: DailySummarySchedulerStatus | null
  scheduler_last_message: string | null
  updated_at: string
  updated_by: string | null
}

export interface DailyActionSummaryLog {
  id: string
  run_id: string
  execution_started_at: string
  target_date: string
  usuario_id: string | null
  email: string | null
  status: string
  error_message: string | null
  counts: Record<string, unknown>
  provider: string | null
  email_id: string | null
  is_test: boolean
  created_at: string
}

export type UpdateDailyActionSummarySettingsInput = Pick<
  DailyActionSummarySettings,
  | 'enabled'
  | 'send_time'
  | 'timezone'
  | 'send_days'
  | 'recipient_mode'
  | 'selected_usuario_ids'
  | 'send_if_no_pending'
>
