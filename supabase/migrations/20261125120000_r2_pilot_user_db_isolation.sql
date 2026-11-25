-- Endurecimiento R2 piloto: aislamiento por usuario en PostgreSQL (fail-closed, gate OFF inicialmente)
-- Rollback rápido: UPDATE public.agent_execution_gate SET enabled = false WHERE id = true;

ALTER TABLE public.agent_execution_gate
  ADD COLUMN IF NOT EXISTS allowed_usuario_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.agent_execution_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_execution_gate FROM PUBLIC, anon, authenticated;

INSERT INTO public.agent_execution_gate (id, enabled, project_ref, allowed_usuario_ids)
VALUES (true, false, 'xhpasmjzuwifmjhrsumb', ARRAY['dd764c9f-8145-45d4-9111-0a8ec7f687e5']::uuid[])
ON CONFLICT (id) DO UPDATE
SET enabled = false,
    project_ref = EXCLUDED.project_ref,
    allowed_usuario_ids = EXCLUDED.allowed_usuario_ids;

CREATE OR REPLACE FUNCTION public.agent_execution_allowed_for_usuario(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT p_usuario_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.agent_execution_gate g
      JOIN public.usuarios u
        ON u.id = p_usuario_id
       AND u.activo = true
      WHERE g.id = true
        AND g.enabled = true
        AND u.id = ANY(g.allowed_usuario_ids)
    );
$function$;

REVOKE ALL ON FUNCTION public.agent_execution_allowed_for_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_execution_allowed_for_usuario(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.agent_execution_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN
      EXISTS (
        SELECT 1
        FROM public.agent_execution_gate g
        WHERE g.id = true
          AND g.enabled = true
          AND coalesce(array_length(g.allowed_usuario_ids, 1), 0) > 0
      )
    ELSE
      public.agent_execution_allowed_for_usuario(public.get_my_usuario_id())
  END;
$function$;

CREATE OR REPLACE FUNCTION public.agent_claim_pending_op(p_op_id uuid, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_is_service boolean := (auth.role() = 'service_role');
  v_me uuid;
  v_op public.assistant_pending_ops%rowtype;
begin
  select * into v_op from public.assistant_pending_ops where id = p_op_id for update;
  if not found then
    raise exception 'not_authorized: la operacion no pertenece al usuario' using errcode = '42501';
  end if;

  if v_is_service then
    v_me := v_op.usuario_id;
  else
    v_me := public.get_my_usuario_id();
    if v_me is null or v_op.usuario_id is distinct from v_me then
      raise exception 'not_authorized: la operacion no pertenece al usuario' using errcode = '42501';
    end if;
  end if;

  if not public.agent_execution_allowed_for_usuario(v_me) then
    raise exception 'execution_disabled: la ejecucion del agente no esta habilitada para este usuario' using errcode = '42501';
  end if;
  if v_me is null or not exists (select 1 from public.usuarios where id = v_me and activo) then
    raise exception 'not_authorized: usuario inactivo o sin sesion' using errcode = '42501';
  end if;
  if v_op.tool not in ('agent_create_action', 'agent_set_action_status', 'agent_register_blocker',
                       'agent_notify_responsable', 'agent_update_fields', 'agent_add_comment',
                       'agent_verify_action', 'mark_action_done') then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;
  if v_op.status <> 'pending' or v_op.expires_at <= now() or v_op.payload is distinct from p_payload then
    return false;
  end if;
  update public.assistant_pending_ops set status = 'executing', claimed_at = now() where id = p_op_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agent_apply_action_status(
  p_pending_op_id uuid,
  p_accion_id uuid,
  p_estado text,
  p_motivo text DEFAULT NULL::text,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_is_service boolean := (auth.role() = 'service_role');
  v_me uuid;
  v_op public.assistant_pending_ops%rowtype;
  v_action public.acciones_diarias%rowtype;
  v_receipt jsonb;
  v_expected_estado text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_after public.acciones_diarias%rowtype;
  v_result jsonb;
begin
  select * into v_op from public.assistant_pending_ops where id = p_pending_op_id for update;
  if not found then
    raise exception 'not_authorized: la operacion no pertenece al usuario' using errcode = '42501';
  end if;

  if v_is_service then
    v_me := v_op.usuario_id;
  else
    v_me := public.get_my_usuario_id();
    if v_me is null or v_op.usuario_id is distinct from v_me then
      raise exception 'not_authorized: la operacion no pertenece al usuario' using errcode = '42501';
    end if;
  end if;

  if not public.agent_execution_allowed_for_usuario(v_me) then
    raise exception 'execution_disabled: la ejecucion del agente no esta habilitada para este usuario' using errcode = '42501';
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

  if not v_is_service and public.is_business_analyst() then
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
$function$;

CREATE OR REPLACE FUNCTION public.agent_edit_pending_op(
  p_op_id uuid,
  p_payload jsonb,
  p_preview jsonb,
  p_expected_updated_at timestamp with time zone,
  p_request_key text
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_is_service boolean := (auth.role() = 'service_role');
  v_me uuid;
  v_op public.assistant_pending_ops%rowtype;
begin
  select * into v_op from public.assistant_pending_ops where id = p_op_id for update;
  if not found then
    raise exception 'not_authorized: la operacion no pertenece al usuario' using errcode = '42501';
  end if;

  if v_is_service then
    v_me := v_op.usuario_id;
  else
    v_me := public.get_my_usuario_id();
    if v_me is null or v_op.usuario_id is distinct from v_me then
      raise exception 'not_authorized: la operacion no pertenece al usuario' using errcode = '42501';
    end if;
  end if;

  if not public.agent_execution_allowed_for_usuario(v_me) then
    raise exception 'execution_disabled: la ejecucion del agente no esta habilitada para este usuario' using errcode = '42501';
  end if;
  if v_me is null or not exists (select 1 from public.usuarios where id = v_me and activo) then
    raise exception 'not_authorized: usuario inactivo o sin sesion' using errcode = '42501';
  end if;
  if v_op.status <> 'pending' then
    raise exception 'invalid_state: la operacion ya no se puede editar' using errcode = '55000';
  end if;
  if v_op.expires_at <= now() then
    raise exception 'expired: la autorizacion expiro' using errcode = '55000';
  end if;
  if v_op.tool not in ('agent_create_action', 'agent_update_fields', 'agent_add_comment') then
    raise exception 'invalid_operation: este tipo de operacion no admite edicion' using errcode = '22023';
  end if;

  perform set_config('app.allow_agent_pending_edit', 'on', true);

  update public.assistant_pending_ops
  set payload = p_payload,
      preview = p_preview,
      expected_updated_at = p_expected_updated_at,
      request_key = p_request_key
  where id = p_op_id and usuario_id = v_me and status = 'pending';

  return v_op.expires_at;
end;
$function$;
