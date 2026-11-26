-- Reuse the existing notification audit table; no new grants, policies or SECURITY DEFINER functions.
-- queued is an attempt reservation; unknown explicitly does not mean delivered or rejected.
begin;
set local lock_timeout = '5s';
alter table public.notification_email_logs drop constraint if exists notification_email_logs_status_check;
alter table public.notification_email_logs add constraint notification_email_logs_status_check check (
  status in ('sent','skipped_inactive','skipped_no_email','recipient_lookup_error','provider_error',
    'invalid_request','server_config_error','queued','unknown')
);
commit;
-- Rollback: disable WHATSAPP_COMMUNICATIONS_ENABLED first and restore the previous functions/code.
-- Retain these additive audit statuses and all attempt rows: dropping them could erase deduplication evidence.
