-- Reversa de 20261120120000. Lo seguro en cualquier entorno es desactivar flags
-- (R2_EXECUTION_MODE / COPILOT_R2_GATE ausentes = OFF). Este script DROP sólo si la
-- migración llegó a QA local: los cambios ya aplicados en acciones_diarias y comentarios
-- se conservan; se retiran las RPC, la puerta, el guard, claimed_at y los recibos.
drop function if exists public.agent_action_block_history(uuid);
drop function if exists public.agent_apply_action_status(uuid, uuid, text, text, timestamptz);
drop function if exists public.agent_claim_pending_op(uuid, jsonb);
drop trigger if exists assistant_pending_ops_guard_agent_claim on public.assistant_pending_ops;
drop function if exists public.assistant_pending_ops_guard_agent_claim();
alter table public.assistant_pending_ops drop column if exists claimed_at;
drop function if exists public.agent_execution_environment();
drop function if exists public.agent_execution_allowed();
drop table if exists public.agent_execution_gate;
drop table if exists public.agent_action_receipts;
notify pgrst, 'reload schema';
