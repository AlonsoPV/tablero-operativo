-- R2 (local, sin aplicar en DEV/PROD): estado y bloqueo de una acción confirmada por su autor.
-- Sólo ejecuta una operación de assistant_pending_ops del propio usuario, reservada por
-- agent_claim_pending_op (claimed_at) y con los mismos parámetros confirmados. Reglas de negocio
-- iguales a whatsapp_apply_action, try_set_accion_hecho y al trigger de estados: Verificado nunca
-- se asigna desde el agente y la causa reportada de un bloqueo nunca escribe causa_raiz.
--
-- Segundo factor en BD: agent_execution_allowed() es false mientras no exista una fila habilitada
-- en agent_execution_gate. Esta migración no la crea; sólo el seed QA
-- (supabase/scripts/qa/seed_qa_environment.sql) lo hace. En DEV/PROD la ejecución queda cerrada
-- aunque el servidor se configurara mal.

do $$
begin
  if to_regclass('public.assistant_pending_ops') is null
     or to_regprocedure('public.try_set_accion_hecho(uuid,uuid)') is null
     or to_regprocedure('public.can_edit_accion_general_as(uuid,uuid)') is null
     or to_regprocedure('public.is_explicit_privilege_admin()') is null
     or to_regprocedure('public.is_current_user_direction()') is null
     or to_regprocedure('public.is_business_analyst()') is null
  then
    raise exception 'Apply assistant_pending_ops, R0 (20261118150000) and 20261119135000 before 20261120120000';
  end if;
end $$;

-- Puerta de ejecución (fila única). Sin políticas ni grants: los clientes no la leen ni la escriben.
create table if not exists public.agent_execution_gate (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  project_ref text not null,
  created_at timestamptz not null default now()
);
alter table public.agent_execution_gate enable row level security;
revoke all on public.agent_execution_gate from public, anon, authenticated;

create or replace function public.agent_execution_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.agent_execution_gate where enabled);
$$;

create or replace function public.agent_execution_environment()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select project_ref from public.agent_execution_gate where enabled;
$$;

revoke all on function public.agent_execution_allowed() from public, anon;
grant execute on function public.agent_execution_allowed() to authenticated;
revoke all on function public.agent_execution_environment() from public, anon;
grant execute on function public.agent_execution_environment() to authenticated;

-- Marca de reserva: sólo agent_claim_pending_op (security definer) la escribe. Los roles de cliente
-- (PostgREST) no pueden fijarla ni pasar una operación del agente a executing; al devolver la
-- operación a pending la marca se limpia, de modo que cada reintento exige un claim nuevo.
alter table public.assistant_pending_ops add column if not exists claimed_at timestamptz;

create or replace function public.assistant_pending_ops_guard_agent_claim()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.claimed_at is distinct from old.claimed_at then
      raise exception 'claimed_at solo lo asigna agent_claim_pending_op' using errcode = '42501';
    end if;
    if new.tool like 'agent\_%' and new.status = 'executing' and old.status is distinct from 'executing' then
      raise exception 'las operaciones del agente solo se reservan con agent_claim_pending_op' using errcode = '42501';
    end if;
  end if;
  if new.status = 'pending' and old.status = 'executing' then
    new.claimed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists assistant_pending_ops_guard_agent_claim on public.assistant_pending_ops;
create trigger assistant_pending_ops_guard_agent_claim
  before update on public.assistant_pending_ops
  for each row execute function public.assistant_pending_ops_guard_agent_claim();

-- pending→executing de una operación propia, vigente y con el payload confirmado.
create or replace function public.agent_claim_pending_op(p_op_id uuid, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.get_my_usuario_id();
  v_op public.assistant_pending_ops%rowtype;
begin
  if not public.agent_execution_allowed() then
    raise exception 'execution_disabled: la ejecucion del agente no esta habilitada en este entorno' using errcode = '42501';
  end if;
  if v_me is null or not exists (select 1 from public.usuarios where id = v_me and activo) then
    raise exception 'not_authorized: usuario inactivo o sin sesion' using errcode = '42501';
  end if;
  select * into v_op from public.assistant_pending_ops where id = p_op_id for update;
  if not found or v_op.usuario_id is distinct from v_me then
    raise exception 'not_authorized: la operacion no pertenece al usuario' using errcode = '42501';
  end if;
  if v_op.tool not in ('agent_create_action', 'agent_set_action_status', 'agent_register_blocker',
                       'agent_notify_responsable', 'mark_action_done') then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;
  if v_op.status <> 'pending' or v_op.expires_at <= now() or v_op.payload is distinct from p_payload then
    return false;
  end if;
  update public.assistant_pending_ops set status = 'executing', claimed_at = now() where id = p_op_id;
  return true;
end;
$$;

revoke all on function public.agent_claim_pending_op(uuid, jsonb) from public, anon;
grant execute on function public.agent_claim_pending_op(uuid, jsonb) to authenticated;

create table if not exists public.agent_action_receipts (
  pending_op_id uuid primary key references public.assistant_pending_ops(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  accion_id uuid not null references public.acciones_diarias(id) on delete cascade,
  tool text not null,
  estado_anterior text not null,
  estado_nuevo text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.agent_action_receipts enable row level security;
revoke all on public.agent_action_receipts from public, anon, authenticated;
grant select on public.agent_action_receipts to authenticated;
drop policy if exists agent_action_receipts_select_own on public.agent_action_receipts;
create policy agent_action_receipts_select_own on public.agent_action_receipts
  for select to authenticated
  using (usuario_id = public.get_my_usuario_id());

create or replace function public.agent_apply_action_status(
  p_pending_op_id uuid,
  p_accion_id uuid,
  p_estado text,
  p_motivo text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.get_my_usuario_id();
  v_op public.assistant_pending_ops%rowtype;
  v_action public.acciones_diarias%rowtype;
  v_receipt jsonb;
  v_expected_estado text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_after public.acciones_diarias%rowtype;
  v_result jsonb;
begin
  if not public.agent_execution_allowed() then
    raise exception 'execution_disabled: la ejecucion del agente no esta habilitada en este entorno' using errcode = '42501';
  end if;
  if v_me is null or not exists (select 1 from public.usuarios where id = v_me and activo) then
    raise exception 'not_authorized: usuario inactivo o sin sesion' using errcode = '42501';
  end if;

  select r.result into v_receipt
  from public.agent_action_receipts r
  where r.pending_op_id = p_pending_op_id and r.usuario_id = v_me;
  if found then
    return v_receipt || jsonb_build_object('replayed', true);
  end if;

  select * into v_op from public.assistant_pending_ops where id = p_pending_op_id for update;
  if not found or v_op.usuario_id is distinct from v_me then
    raise exception 'not_authorized: la operacion no pertenece al usuario' using errcode = '42501';
  end if;
  if v_op.status <> 'executing' or v_op.claimed_at is null then
    raise exception 'not_confirmed: la operacion no esta confirmada' using errcode = '55000';
  end if;
  if v_op.tool not in ('agent_set_action_status', 'agent_register_blocker', 'mark_action_done') then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;

  v_expected_estado := case v_op.tool
    when 'agent_register_blocker' then 'Bloqueado'
    when 'mark_action_done' then 'Hecho'
    else v_op.payload->>'estado'
  end;
  if coalesce(v_op.payload->>'accionId', v_op.payload->>'action_id') is distinct from p_accion_id::text
     or v_expected_estado is distinct from p_estado
     or nullif(btrim(coalesce(v_op.payload->>'motivo', '')), '') is distinct from v_motivo
     or v_op.expected_updated_at is distinct from p_expected_updated_at
  then
    raise exception 'payload_mismatch: los parametros no coinciden con la confirmacion' using errcode = '22023';
  end if;

  if p_estado = 'Verificado' then
    raise exception 'verified_requires_human: Verificado no se asigna desde el agente' using errcode = '42501';
  end if;
  if p_estado not in ('Pendiente', 'En_Ejecucion', 'Bloqueado', 'Hecho') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_expected_updated_at is null then
    raise exception 'expected_updated_at_required' using errcode = '22023';
  end if;

  -- Matriz R2: Dirección (sin privilegio explícito) y Analista sólo consultan.
  if public.is_business_analyst()
     or (public.is_current_user_direction() and not public.is_explicit_privilege_admin())
  then
    raise exception 'not_authorized: el rol solo tiene acceso de consulta' using errcode = '42501';
  end if;

  select * into v_action from public.acciones_diarias where id = p_accion_id for update;
  if not found then
    raise exception 'not_found: accion no encontrada' using errcode = 'P0002';
  end if;
  if v_action.estado::text = 'Verificado' then
    raise exception 'already_verified: la accion ya esta verificada' using errcode = '23514';
  end if;
  if v_action.updated_at is distinct from p_expected_updated_at then
    raise exception 'conflict: la accion cambio despues de la confirmacion' using errcode = '40001';
  end if;
  if v_action.responsable is distinct from v_me
     and not public.can_edit_accion_general_as(p_accion_id, v_me)
  then
    raise exception 'not_authorized: sin permiso sobre la accion' using errcode = '42501';
  end if;
  if v_action.estado::text = p_estado then
    raise exception 'no_change: la accion ya tiene ese estado' using errcode = '22023';
  end if;

  if p_estado = 'Hecho' then
    perform public.try_set_accion_hecho(p_accion_id, v_me);
  elsif p_estado = 'Bloqueado' then
    if v_motivo is null or char_length(v_motivo) < 5 then
      raise exception 'block_reason_required: el motivo debe tener al menos 5 caracteres' using errcode = '22023';
    end if;
    -- La causa reportada no es causa raíz validada: queda como comentario tipificado, nunca en causa_raiz.
    update public.acciones_diarias set estado = 'Bloqueado'::action_status where id = p_accion_id;
    insert into public.accion_comentarios (accion_id, contenido, created_by, tipo_comentario)
    values (p_accion_id, 'Causa reportada: ' || left(v_motivo, 2000), v_me, 'bloqueo_reportado');
  else
    update public.acciones_diarias set estado = p_estado::action_status where id = p_accion_id;
  end if;

  select * into v_after from public.acciones_diarias where id = p_accion_id;
  v_result := jsonb_build_object(
    'ok', true,
    'accionId', p_accion_id,
    'estadoAnterior', v_action.estado::text,
    'estado', v_after.estado::text,
    'causaReportada', p_estado = 'Bloqueado',
    'updatedAt', v_after.updated_at
  );
  insert into public.agent_action_receipts (pending_op_id, usuario_id, accion_id, tool, estado_anterior, estado_nuevo, result)
  values (p_pending_op_id, v_me, p_accion_id, v_op.tool, v_action.estado::text, v_after.estado::text, v_result);
  return v_result;
end;
$$;

revoke all on function public.agent_apply_action_status(uuid, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.agent_apply_action_status(uuid, uuid, text, text, timestamptz) to authenticated;

-- Historial de bloqueos reportados: comentarios bloqueo_reportado (y los de WhatsApp previos)
-- más los recibos del agente. Sólo responsable, creador, edición general o Super Admin.
create or replace function public.agent_action_block_history(p_accion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.get_my_usuario_id();
  v_action public.acciones_diarias%rowtype;
begin
  if v_me is null or not exists (select 1 from public.usuarios where id = v_me and activo) then
    raise exception 'not_authorized: usuario inactivo o sin sesion' using errcode = '42501';
  end if;
  select * into v_action from public.acciones_diarias where id = p_accion_id;
  if not found then
    raise exception 'not_found: accion no encontrada' using errcode = 'P0002';
  end if;
  if v_action.responsable is distinct from v_me
     and v_action.created_by is distinct from v_me
     and not public.can_edit_accion_general_as(p_accion_id, v_me)
  then
    raise exception 'not_authorized: sin permiso sobre la accion' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'accionId', p_accion_id,
    'estado', v_action.estado::text,
    'reportes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contenido', c.contenido, 'createdBy', c.created_by, 'createdAt', c.created_at, 'tipo', c.tipo_comentario
      ) order by c.created_at)
      from public.accion_comentarios c
      where c.accion_id = p_accion_id
        and (c.tipo_comentario = 'bloqueo_reportado' or c.contenido like 'Bloqueo reportado por WhatsApp:%')
    ), '[]'::jsonb),
    'recibos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pendingOpId', r.pending_op_id, 'usuarioId', r.usuario_id, 'tool', r.tool,
        'estadoAnterior', r.estado_anterior, 'estadoNuevo', r.estado_nuevo, 'createdAt', r.created_at
      ) order by r.created_at)
      from public.agent_action_receipts r
      where r.accion_id = p_accion_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.agent_action_block_history(uuid) from public, anon;
grant execute on function public.agent_action_block_history(uuid) to authenticated;

notify pgrst, 'reload schema';
