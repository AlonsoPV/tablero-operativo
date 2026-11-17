ALTER TABLE public.daily_action_summary_logs
  DROP CONSTRAINT daily_action_summary_logs_status,
  ADD CONSTRAINT daily_action_summary_logs_status CHECK (status IN (
    'sending', 'unconfirmed', 'sent', 'omitted_no_pending', 'skipped_no_email',
    'skipped_inactive', 'skipped_not_recipient', 'skipped_duplicate', 'config_error', 'error'
  ));

DROP INDEX public.idx_daily_action_summary_logs_no_duplicate_daily;
CREATE UNIQUE INDEX idx_daily_action_summary_logs_no_duplicate_daily
  ON public.daily_action_summary_logs (settings_id, usuario_id, target_date)
  WHERE is_test = false
    AND usuario_id IS NOT NULL
    AND status IN ('sending', 'unconfirmed', 'sent', 'omitted_no_pending', 'skipped_no_email', 'skipped_inactive');
