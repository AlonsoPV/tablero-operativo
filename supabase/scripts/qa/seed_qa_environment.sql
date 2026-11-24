-- Seed del entorno QA aislado (R1/R2/R3). SÓLO para el proyecto QA autorizado; nunca DEV ni PROD.
-- Preparado localmente, no ejecutado. Requiere 20261120120000_agent_apply_action_status.sql aplicada.
-- Antes de ejecutarlo, sustituir __QA_PROJECT_REF__ por el ref de 20 caracteres del proyecto QA
-- (idéntico a R2_QA_PROJECT_REFS y SUPABASE_URL del Preview QA). Rechaza DEV, PROD y el marcador sin sustituir.
--
-- Crea:
--   * fila habilitada en public.agent_execution_gate (segundo factor de ejecución en BD);
--   * public.qa_outbox: buzón simulado donde el ejecutor qa registra avisos (cero salidas reales);
--   * public.qa_whatsapp_linked(uuid): valida vínculo WhatsApp sin exponer números ni llamar proveedores.
-- Reversa:
--   delete from public.agent_execution_gate;
--   drop function if exists public.qa_whatsapp_linked(uuid);
--   drop table if exists public.qa_outbox;

do $$
declare
  v_ref text := '__QA_PROJECT_REF__';
begin
  if v_ref like '\_\_%' or v_ref !~ '^[a-z0-9]{20}$' then
    raise exception 'Sustituye __QA_PROJECT_REF__ por la referencia del proyecto QA';
  end if;
  if v_ref in ('tgiuevzlyptzlfgxsfhj', 'xhpasmjzuwifmjhrsumb') then
    raise exception 'El seed QA nunca se ejecuta en DEV ni en PROD';
  end if;
  if to_regprocedure('public.agent_execution_allowed()') is null then
    raise exception 'Aplica 20261120120000_agent_apply_action_status.sql en este proyecto QA antes del seed';
  end if;
  insert into public.agent_execution_gate (id, enabled, project_ref)
  values (true, true, v_ref)
  on conflict (id) do update set enabled = true, project_ref = excluded.project_ref;
end $$;

create table if not exists public.qa_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  canal text not null check (canal in ('email', 'whatsapp')),
  sender_usuario_id uuid not null references public.usuarios(id) on delete cascade,
  to_usuario_id uuid not null references public.usuarios(id) on delete cascade,
  accion_id uuid references public.acciones_diarias(id) on delete set null,
  titulo text,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.qa_outbox enable row level security;
revoke all on public.qa_outbox from public, anon, authenticated;
grant select, insert on public.qa_outbox to authenticated;
drop policy if exists qa_outbox_select_own on public.qa_outbox;
create policy qa_outbox_select_own on public.qa_outbox
  for select to authenticated
  using (sender_usuario_id = public.get_my_usuario_id() or to_usuario_id = public.get_my_usuario_id());
drop policy if exists qa_outbox_insert_own on public.qa_outbox;
create policy qa_outbox_insert_own on public.qa_outbox
  for insert to authenticated
  with check (sender_usuario_id = public.get_my_usuario_id() and public.agent_execution_allowed());

create or replace function public.qa_whatsapp_linked(p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.agent_execution_allowed() and exists (
    select 1 from public.user_channel_identities
    where usuario_id = p_usuario_id and channel = 'whatsapp' and status = 'active'
  );
$$;

revoke all on function public.qa_whatsapp_linked(uuid) from public, anon;
grant execute on function public.qa_whatsapp_linked(uuid) to authenticated;

notify pgrst, 'reload schema';
