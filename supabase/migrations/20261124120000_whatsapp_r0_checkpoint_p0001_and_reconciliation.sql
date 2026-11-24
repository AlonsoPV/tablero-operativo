-- =============================================================================
-- R0 Local Draft Migration (DO NOT APPLY REMOTELY WITHOUT EXPLICIT AUTHORIZATION)
-- 1) Fix P0001 on accion_checkpoints update from whatsapp_apply_action under service_role
-- 2) Unspoofable transaction-scoped internal actor context (immune to app.whatsapp_actor_id spoofing)
-- 3) Preserve checked_by attribution without granting blind service_role bypass
-- 4) Add CAS-guarded reconciliation RPC for uncertain review jobs (no blind replay)
-- =============================================================================
begin;

-- Internal-only context table: zero grants to any client or service_role.
-- Only SECURITY DEFINER functions owned by the migration owner may read/write it.
create table if not exists public.whatsapp_internal_actor_context (
  txid bigint primary key,
  actor_id uuid not null references public.usuarios(id) on delete cascade,
  accion_id uuid not null references public.acciones_diarias(id) on delete cascade
);
alter table public.whatsapp_internal_actor_context enable row level security;
revoke all on table public.whatsapp_internal_actor_context from public, anon, authenticated, service_role;

create or replace function public.accion_checkpoints_guard_assignee_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  v_service_actor uuid;
  action_creator uuid;
  action_responsable uuid;
  can_admin boolean;
  is_checkpoint_responsable boolean;
  target_accion_id uuid;
begin
  me := public.get_my_usuario_id();
  can_admin := public.is_app_admin() or public.is_business_admin();

  -- Service-role RPCs (whatsapp_apply_action) bind the verified active usuario_id
  -- inside whatsapp_internal_actor_context for the exact transaction + accion_id.
  -- User-writable GUCs such as app.whatsapp_actor_id are intentionally ignored.
  if me is null and auth.role() = 'service_role' and tg_op = 'UPDATE' then
    select ctx.actor_id
    into v_service_actor
    from public.whatsapp_internal_actor_context ctx
    join public.usuarios u on u.id = ctx.actor_id and u.activo
    where ctx.txid = txid_current()
      and ctx.accion_id = old.accion_id;

    if v_service_actor is not null then
      me := v_service_actor;
    end if;
  end if;

  if tg_op = 'INSERT' then
    target_accion_id := new.accion_id;

    if new.created_by is null then
      new.created_by := me;
    end if;

    if new.responsable_id is not null
      and not public.accion_checkpoint_responsable_belongs_to_accion_area(new.accion_id, new.responsable_id)
    then
      raise exception 'El responsable del check no pertenece al area de la accion o esta inactivo.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  target_accion_id := old.accion_id;

  select a.created_by, a.responsable
  into action_creator, action_responsable
  from public.acciones_diarias a
  where a.id = old.accion_id;

  if can_admin or (action_creator is not null and action_creator = me) then
    if tg_op = 'DELETE' then
      return old;
    end if;

    if new.responsable_id is not null
      and not public.accion_checkpoint_responsable_belongs_to_accion_area(target_accion_id, new.responsable_id)
    then
      raise exception 'El responsable del check no pertenece al area de la accion o esta inactivo.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Solo la persona creadora de la accion puede eliminar puntos del checklist.'
      using errcode = '42501';
  end if;

  is_checkpoint_responsable := old.responsable_id is not null and old.responsable_id = me;

  if action_responsable is distinct from me and not is_checkpoint_responsable then
    raise exception 'Solo la persona creadora de la accion, el responsable asignado o el responsable del check pueden actualizar este checklist.'
      using errcode = '42501';
  end if;

  if new.accion_id is distinct from old.accion_id
    or new.texto is distinct from old.texto
    or new.orden is distinct from old.orden
    or new.obligatorio is distinct from old.obligatorio
    or new.activo is distinct from old.activo
    or new.created_by is distinct from old.created_by
    or new.responsable_id is distinct from old.responsable_id
  then
    raise exception 'Solo quien administra la accion puede editar la estructura o responsable del check.'
      using errcode = '42501';
  end if;

  if new.completado is not distinct from old.completado
    and (
      new.checked_at is distinct from old.checked_at
      or new.checked_by is distinct from old.checked_by
    )
  then
    raise exception 'Solo se puede actualizar auditoria al marcar o desmarcar puntos.'
      using errcode = '42501';
  end if;

  if new.completado = true and old.completado is distinct from true then
    new.checked_at := now();
    new.checked_by := me;
  elsif new.completado = false and old.completado is distinct from false then
    new.checked_at := null;
    new.checked_by := null;
  end if;

  return new;
end;
$$;

revoke all on function public.accion_checkpoints_guard_assignee_permissions() from public, anon, authenticated;

create or replace function public.whatsapp_apply_action(
  p_event text,
  p_usuario uuid,
  p_accion uuid,
  p_action text,
  p_wa text,
  p_reason text default null,
  p_checkpoint uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.acciones_diarias%rowtype;
  result jsonb;
  v_txid bigint;
begin
  if not exists (select 1 from public.usuarios where id = p_usuario and activo) then
    raise exception 'not_authorized';
  end if;

  select * into a from public.acciones_diarias where id = p_accion for update;
  if not found or a.responsable is distinct from p_usuario then
    raise exception 'not_authorized';
  end if;

  select r.result into result
  from public.whatsapp_action_receipts r
  where event_key = p_event and usuario_id = p_usuario and accion_id = p_accion;
  if found then
    return result;
  end if;

  if a.estado::text = 'Verificado' then
    raise exception 'already_verified';
  end if;

  if p_checkpoint is not null and not exists (
    select 1 from public.accion_checkpoints
    where id = p_checkpoint and accion_id = p_accion and activo
  ) then
    raise exception 'not_authorized';
  end if;

  if p_action = 'support' then
    if length(trim(coalesce(p_reason, ''))) < 3 then
      raise exception 'block_reason_required';
    end if;
    update public.acciones_diarias
    set estado = 'Bloqueado', causa_raiz = left(p_reason, 2000)
    where id = p_accion;
    insert into public.accion_comentarios(accion_id, contenido, created_by, tipo_comentario)
    values (p_accion, 'Bloqueo reportado por WhatsApp: ' || left(p_reason, 2000), p_usuario, 'comentario');
  elsif p_action = 'progress' then
    update public.acciones_diarias
    set estado = 'En_Ejecucion'
    where id = p_accion;
  elsif p_action = 'done' then
    v_txid := txid_current();
    insert into public.whatsapp_internal_actor_context(txid, actor_id, accion_id)
    values (v_txid, p_usuario, p_accion)
    on conflict (txid) do update
      set actor_id = excluded.actor_id,
          accion_id = excluded.accion_id;

    begin
      update public.accion_checkpoints
      set completado = true, checked_at = now(), checked_by = p_usuario
      where accion_id = p_accion
        and activo
        and not completado
        and (p_checkpoint is null or id = p_checkpoint);
    exception when others then
      delete from public.whatsapp_internal_actor_context where txid = v_txid;
      raise;
    end;

    -- Immediate cleanup even before the surrounding transaction commits.
    delete from public.whatsapp_internal_actor_context where txid = v_txid;

    if not exists (
      select 1 from public.accion_checkpoints
      where accion_id = p_accion and activo and not completado
    ) then
      update public.acciones_diarias
      set estado = 'Hecho', completed_at = now(), completed_by = p_usuario
      where id = p_accion;
    end if;

    update public.whatsapp_followup_jobs
    set status = 'canceled', updated_at = now(), error_message = 'completed_via_whatsapp'
    where accion_id = p_accion
      and usuario_id = p_usuario
      and status = 'pending'
      and (
        p_checkpoint is null
        or checkpoint_id = p_checkpoint
        or exists (select 1 from public.acciones_diarias where id = p_accion and estado = 'Hecho')
      );
  else
    raise exception 'invalid_action';
  end if;

  result := jsonb_build_object(
    'ok', true,
    'accionId', p_accion,
    'titulo', a.titulo_accion,
    'askResult', p_action <> 'support',
    'askSupport', false,
    'resultLabel', case when p_action = 'progress' then 'En proceso' else 'Realizada' end
  );

  if p_action <> 'support' then
    insert into public.whatsapp_result_requests(scope, accion_id, checkpoint_id, usuario_id, wa_id, status, expires_at)
    values ('corporate', p_accion, p_checkpoint, p_usuario, p_wa, 'waiting', now() + interval '30 minutes');
  end if;

  insert into public.whatsapp_action_receipts(event_key, usuario_id, accion_id, result)
  values (p_event, p_usuario, p_accion, result);

  return result;
end;
$$;

revoke all on function public.whatsapp_apply_action(text, uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_apply_action(text, uuid, uuid, text, text, text, uuid) to service_role;

-- Safe CAS reconciliation for jobs held in review. Never auto-replays uncertain effects.
create or replace function public.whatsapp_reconcile_inbound_job(
  p_id uuid,
  p_expected_attempts integer,
  p_decision text,
  p_reason text,
  p_actor uuid default null
) returns public.whatsapp_inbound_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.whatsapp_inbound_jobs%rowtype;
  v_note jsonb;
begin
  if p_decision not in ('reconciled_no_replay', 'requeue') then
    raise exception 'invalid_reconciliation_decision';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'reconciliation_reason_required';
  end if;

  select * into v_job
  from public.whatsapp_inbound_jobs
  where id = p_id
  for update;

  if not found then
    raise exception 'job_not_found';
  end if;
  if v_job.status <> 'review' or v_job.attempts <> p_expected_attempts then
    raise exception 'cas_conflict';
  end if;

  if p_decision = 'requeue' and v_job.effect_started then
    raise exception 'cannot_replay_uncertain_effect';
  end if;

  v_note := jsonb_build_object(
    'decision', p_decision,
    'reason', left(trim(p_reason), 500),
    'actor_usuario_id', p_actor,
    'reconciled_at', now(),
    'previous_stage', v_job.stage,
    'previous_error_code', v_job.error_code
  );

  if p_decision = 'reconciled_no_replay' then
    update public.whatsapp_inbound_jobs
    set
      status = 'failed',
      stage = 'reconciled_no_replay',
      payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{reconciliation}', v_note, true),
      lease_token = null,
      lease_until = null,
      updated_at = now()
    where id = p_id
    returning * into v_job;
  else
    update public.whatsapp_inbound_jobs
    set
      status = 'pending',
      stage = 'reconciled_requeue',
      available_at = now(),
      payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{reconciliation}', v_note, true),
      lease_token = null,
      lease_until = null,
      updated_at = now()
    where id = p_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;

revoke all on function public.whatsapp_reconcile_inbound_job(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_reconcile_inbound_job(uuid, integer, text, text, uuid) to service_role;

commit;
