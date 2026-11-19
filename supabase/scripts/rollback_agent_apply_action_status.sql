-- Reversa de 20261120120000. Los cambios de estado ya aplicados en acciones_diarias
-- y sus comentarios se conservan; sólo se retiran la RPC y los recibos.
drop function if exists public.agent_apply_action_status(uuid, uuid, text, text, timestamptz);
drop table if exists public.agent_action_receipts;
notify pgrst, 'reload schema';
