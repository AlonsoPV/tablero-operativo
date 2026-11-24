-- Reversa de 20261120120000. Lo seguro en cualquier entorno es desactivar flags
-- (R2_EXECUTION_MODE / COPILOT_R2_GATE ausentes = OFF). Este script DROP sólo si la
-- migración llegó a QA local o QA dedicado: los cambios ya aplicados en acciones_diarias y
-- comentarios se conservan; se retiran las RPC, la puerta, el guard, claimed_at y los recibos,
-- y se restaura assistant_pending_ops_guard_update al estado de 20261117132000.
drop function if exists public.agent_action_block_history(uuid);
drop function if exists public.agent_apply_action_status(uuid, uuid, text, text, timestamptz);
drop function if exists public.agent_edit_pending_op(uuid, jsonb, jsonb, timestamptz, text);
drop function if exists public.agent_claim_pending_op(uuid, jsonb);
drop trigger if exists assistant_pending_ops_guard_agent_claim on public.assistant_pending_ops;
drop function if exists public.assistant_pending_ops_guard_agent_claim();
alter table if exists public.assistant_pending_ops drop column if exists claimed_at;
drop function if exists public.agent_execution_environment();
drop function if exists public.agent_execution_allowed();
drop table if exists public.agent_execution_gate;
drop table if exists public.agent_action_receipts;

create or replace function public.assistant_pending_ops_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allow_edit boolean := false;
  v_workspace boolean := false;
begin
  if new.usuario_id is distinct from old.usuario_id
     or new.tool is distinct from old.tool
     or new.created_at is distinct from old.created_at
  then
    raise exception 'No se pueden modificar usuario/tool de una operacion pendiente.'
      using errcode = '42501';
  end if;

  v_workspace := old.tool in (
    'gmail_prepare_send',
    'gmail_prepare_reply',
    'calendar_prepare_event',
    'calendar_prepare_update',
    'calendar_prepare_cancel',
    'whatsapp_prepare_send'
  );

  begin
    v_allow_edit := current_setting('app.allow_pending_payload_edit', true) = 'on';
  exception when others then
    v_allow_edit := false;
  end;

  if current_user in ('service_role', 'postgres', 'supabase_admin')
     and old.status = 'pending'
     and (v_workspace or (old.tool = 'notify_action_email' and new.status = 'pending'))
  then
    return new;
  end if;

  if v_allow_edit
     and v_workspace
     and old.status = 'pending'
     and new.status = 'pending'
  then
    if new.resource_id is distinct from old.resource_id
       or new.expected_updated_at is distinct from old.expected_updated_at
       or new.expires_at is distinct from old.expires_at
    then
      raise exception 'No se pueden modificar resource/expiry al editar el borrador.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.resource_id is distinct from old.resource_id
     or new.expected_updated_at is distinct from old.expected_updated_at
     or new.payload is distinct from old.payload
     or new.preview is distinct from old.preview
     or new.expires_at is distinct from old.expires_at
  then
    raise exception 'No se pueden modificar payload/tool/preview de una operacion pendiente.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
