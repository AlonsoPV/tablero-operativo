-- Secreto interno para que pg_cron pueda llamar la Edge Function sin exponer
-- un endpoint publico de envio.

DO $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.secrets
    WHERE name = 'daily_action_summary_cron_secret'
  ) THEN
    v_secret := encode(gen_random_bytes(32), 'base64');
    PERFORM vault.create_secret(
      v_secret,
      'daily_action_summary_cron_secret',
      'Header x-cron-secret para daily-action-summary'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_daily_action_summary_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'daily_action_summary_cron_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_daily_action_summary_cron_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_action_summary_cron_secret() TO service_role;

COMMENT ON FUNCTION public.get_daily_action_summary_cron_secret() IS
  'Devuelve el secreto de cron del resumen diario solo para service_role.';
