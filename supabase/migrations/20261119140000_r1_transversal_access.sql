-- R1 complement: explicit capabilities and cross-area read access.
-- Reuses catalog roles + app_modules as the only explicit grant mechanism.
-- Area OKRS keeps its inherited administrative grants while legacy_okrs_area_grants() is true;
-- supabase/scripts/apply_r1_revoke_legacy_okrs_area.sql (manual, never auto-applied) turns them off
-- after the migration matrix is approved.
begin;

do $$
begin
  if has_schema_privilege('authenticated','public','CREATE')
     or has_schema_privilege('anon','public','CREATE') then
    raise exception 'Unsafe public schema CREATE privilege; review before applying R1';
  end if;
  if to_regprocedure('public.guard_usuarios_privileges()') is null then
    raise exception 'Apply 20261119135000_guard_usuarios_privileges.sql first';
  end if;
end $$;

-- Stable relational key for areas whose membership carries a function.
alter table public.areas add column if not exists system_key text;
create unique index if not exists areas_system_key_unique on public.areas (system_key) where system_key is not null;
update public.areas set system_key = 'okrs'
where id = (
  select a.id from public.areas a
  where public.normalize_business_role(a.nombre) = 'okrs'
  order by a.id limit 1
)
and not exists (select 1 from public.areas a where a.system_key = 'okrs');
comment on column public.areas.system_key is
  'Functional key (okrs). Grants derive from this key, not from the editable display name.';

insert into public.app_modules (key, nombre, descripcion, route, section, sort_order) values
  ('okrs_admin', 'OKRs: administración global',
   'Crear, editar y archivar OKRs de cualquier área y marcar acciones como OKR.', '/okrs', 'operacion', 16),
  ('whatsapp_assistant', 'WhatsApp: asistente',
   'Usar el asistente de IA y consultarlo por WhatsApp.', '/asistente-ia', 'conocimiento', 111),
  ('whatsapp_inbox', 'WhatsApp: bandeja',
   'Leer conversaciones de WhatsApp y su seguimiento.', '/asistente-ia/seguimiento-whatsapp', 'conocimiento', 112),
  ('whatsapp_settings', 'WhatsApp: configuración',
   'Configurar recordatorios y seguimiento por WhatsApp.', '/settings/whatsapp', 'conocimiento', 113),
  ('whatsapp_identity_link', 'WhatsApp: vincular teléfonos',
   'Vincular o revocar el teléfono WhatsApp de un usuario.', '/settings/whatsapp', 'conocimiento', 114)
on conflict (key) do update set nombre = excluded.nombre, descripcion = excluded.descripcion,
  route = excluded.route, section = excluded.section, sort_order = excluded.sort_order, activo = true;

-- Transition switch. Created only once so reapplying this migration never undoes the revocation script.
do $$
begin
  if to_regprocedure('public.legacy_okrs_area_grants()') is null then
    create function public.legacy_okrs_area_grants()
    returns boolean language sql stable set search_path = pg_catalog, public, pg_temp as 'select true';
  end if;
end $$;

-- Facts about a given usuario (service_role and definer helpers only).
create or replace function public.usuario_in_area_key(p_usuario_id uuid, p_key text)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_usuario_id and u.activo = true and (
      exists (select 1 from public.usuario_areas ua join public.areas a on a.id = ua.area_id
              where ua.user_id = u.id and a.system_key = p_key)
      or exists (select 1 from public.areas a
                 where a.system_key = p_key and u.area is not null
                   and public.normalize_business_role(a.nombre) = public.normalize_business_role(u.area))
    ));
$$;

create or replace function public.usuario_has_module(p_usuario_id uuid, p_key text)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.usuarios u
    join public.usuario_catalog_roles ur on ur.user_id = u.id
    join public.catalog_roles cr on cr.id = ur.role_id and cr.activo = true
    join public.catalog_role_modules rm on rm.role_id = cr.id and rm.module_key = p_key
    join public.app_modules m on m.key = rm.module_key and m.activo = true
    where u.id = p_usuario_id and u.activo = true);
$$;

create or replace function public.usuario_is_super_admin(p_usuario_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_usuario_id and u.activo = true and (
      public.normalize_business_role(u.rol::text) = 'super_admin'
      or exists (select 1 from public.user_roles ur
                 where ur.user_id = u.user_id and lower(ur.app_role::text) = 'super_admin')
      or exists (select 1 from public.usuario_catalog_roles ucr
                 join public.catalog_roles cr on cr.id = ucr.role_id
                 where ucr.user_id = u.id and cr.activo = true
                   and (cr.system_key = 'super_admin' or public.normalize_business_role(cr.nombre) = 'super_admin'))
    ));
$$;

create or replace function public.usuario_is_direction(p_usuario_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_usuario_id and u.activo = true and (
      split_part(public.normalize_business_role(u.rol::text), '_', 1) = 'direccion'
      or exists (select 1 from public.usuario_catalog_roles ucr
                 join public.catalog_roles cr on cr.id = ucr.role_id
                 where ucr.user_id = u.id and cr.activo = true
                   and (split_part(public.normalize_business_role(cr.nombre), '_', 1) = 'direccion'
                     or split_part(public.normalize_business_role(coalesce(cr.system_key, '')), '_', 1) = 'direccion'))
    ));
$$;

create or replace function public.usuario_is_catalog_admin(p_usuario_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.usuario_is_super_admin(p_usuario_id) or exists (
    select 1 from public.usuarios u
    where u.id = p_usuario_id and u.activo = true and (
      public.normalize_business_role(u.rol::text) in ('dg', 'sistemas')
      or exists (select 1 from public.user_roles ur
                 where ur.user_id = u.user_id and lower(ur.app_role::text) in ('admin', 'super_admin'))
    ));
$$;

-- Single derivation of capabilities. Reads are never derived from write grants.
create or replace function public.access_capabilities_for_usuario(p_usuario_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  with f as (
    select
      coalesce((select u.activo from public.usuarios u where u.id = p_usuario_id), false) as active,
      public.usuario_is_super_admin(p_usuario_id) as super_admin,
      public.usuario_is_direction(p_usuario_id) as direction,
      public.usuario_in_area_key(p_usuario_id, 'okrs') as okrs_area,
      public.usuario_is_catalog_admin(p_usuario_id) as catalog_admin,
      public.legacy_okrs_area_grants() as legacy
  )
  select jsonb_build_object(
    'active', active,
    'super_admin', active and super_admin,
    'direction', active and direction,
    'okrs_area', active and okrs_area,
    'legacy_okrs_area_grants', legacy,
    'read_all_organizational_data', active and super_admin,
    'read_all_okrs', active and (super_admin or direction or okrs_area),
    'read_cross_area_execution', active and (super_admin or direction or okrs_area),
    'manage_all', active and super_admin,
    'admin_all_okrs', active and (super_admin or catalog_admin
      or public.usuario_has_module(p_usuario_id, 'okrs_admin') or (legacy and okrs_area)),
    'whatsapp_assistant', active and (super_admin
      or public.usuario_has_module(p_usuario_id, 'whatsapp_assistant') or (legacy and okrs_area)),
    'whatsapp_inbox', active and (super_admin
      or public.usuario_has_module(p_usuario_id, 'whatsapp_inbox') or (legacy and okrs_area)),
    'whatsapp_settings', active and (super_admin
      or public.usuario_has_module(p_usuario_id, 'whatsapp_settings') or (legacy and okrs_area)),
    'whatsapp_identity_link', active and (super_admin
      or public.usuario_has_module(p_usuario_id, 'whatsapp_identity_link') or (legacy and okrs_area))
  ) from f;
$$;

create or replace function public.my_access_capabilities()
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.access_capabilities_for_usuario(
    (select u.id from public.usuarios u where u.user_id = auth.uid() limit 1));
$$;

create or replace function public.current_user_capability(p_key text)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select auth.uid() is not null
    and coalesce((public.my_access_capabilities() ->> p_key)::boolean, false);
$$;

create or replace function public.is_current_user_okrs_area()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.current_user_capability('okrs_area');
$$;

create or replace function public.can_read_all_okrs()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.current_user_capability('read_all_okrs');
$$;

create or replace function public.can_read_cross_area_execution()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.current_user_capability('read_cross_area_execution');
$$;

-- Existing catalog admins keep OKR administration; can_manage_catalogs is evaluated as the caller.
create or replace function public.can_admin_all_okrs()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.okr_active_user()
    and (public.can_manage_catalogs() or public.current_user_capability('admin_all_okrs'));
$$;

create or replace function public.can_use_whatsapp_inbox()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.current_user_capability('whatsapp_inbox');
$$;

create or replace function public.can_configure_whatsapp()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.current_user_capability('whatsapp_settings');
$$;

create or replace function public.can_link_whatsapp_identities()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.current_user_capability('whatsapp_identity_link');
$$;

-- Assistant usage (AI edge functions). Name kept for existing callers.
create or replace function public.can_use_ai_whatsapp()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.current_user_capability('whatsapp_assistant');
$$;
comment on function public.can_use_ai_whatsapp() is
  'Assistant usage: Super Admin, module whatsapp_assistant, or inherited OKRS area during transition.';

create or replace function public.can_use_ai_whatsapp_for_usuario(p_usuario_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select p_usuario_id is not null
    and exists (select 1 from public.usuarios u where u.id = p_usuario_id and u.user_id is not null)
    and coalesce((public.access_capabilities_for_usuario(p_usuario_id) ->> 'whatsapp_assistant')::boolean, false);
$$;

create or replace function public.whatsapp_inbox_can_access(p_auth_uid uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select p_auth_uid is not null and coalesce((public.access_capabilities_for_usuario(
    (select u.id from public.usuarios u where u.user_id = p_auth_uid limit 1)) ->> 'whatsapp_inbox')::boolean, false);
$$;
comment on function public.whatsapp_inbox_can_access(uuid) is
  'Inbox access: Super Admin, module whatsapp_inbox, or inherited OKRS area during transition.';

-- OKRs: read, edit and global administration are separate.
create or replace function public.okr_manage_scope(p_area uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.okr_active_user() and (
    public.can_admin_all_okrs()
    or (p_area is not null and public.team_kanban_is_leader(p_area))
  );
$$;
comment on function public.okr_manage_scope(uuid) is
  'Manage OKRs: global OKR admins (Super Admin, catalog admins, okrs_admin) or the team leader.';

create or replace function public.okr_can_view(p_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.okr_active_user() and (
    (public.can_read_all_okrs() and exists (select 1 from public.okrs o where o.id = p_id))
    or exists (
      select 1 from public.okrs o where o.id = p_id and (
        o.scope = 'company' or public.okr_manage_scope(o.area_id)
        or o.owner_user_id = public.get_my_usuario_id()
        or exists (select 1 from public.usuario_areas ua
                   where ua.area_id = o.area_id and ua.user_id = public.get_my_usuario_id())
        or exists (select 1 from public.usuarios u join public.areas a on a.nombre = u.area
                   where u.user_id = auth.uid() and a.id = o.area_id)
        or exists (select 1 from public.okr_key_results k
                   where k.okr_id = o.id and k.owner_user_id = public.get_my_usuario_id())
      )
    )
  );
$$;
comment on function public.okr_can_view(uuid) is
  'Read OKRs: Super Admin, Direction and OKRS area read all; others by scope, area, owner or KR.';

create or replace function public.okr_can_tag_actions()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.okr_active_user() and public.can_admin_all_okrs();
$$;

-- Corporate Kanban: OKRS area reads cross-area execution; writes are untouched.
drop policy if exists acciones_select_role_scoped on public.acciones_diarias;
create policy acciones_select_role_scoped on public.acciones_diarias
  for select to authenticated
  using (
    not public.is_business_analyst()
    or (select public.can_read_cross_area_execution())
    or responsable = public.get_my_usuario_id()
    or (created_by is not null and created_by = public.get_my_usuario_id())
    or exists (
      select 1 from public.accion_comentarios c
      where c.accion_id = acciones_diarias.id
        and (c.asignado = public.get_my_usuario_id()
          or public.get_my_usuario_id()::text = any(coalesce(c.etiquetas, array[]::text[])))
    )
  );

-- Team Kanban: OKRS area reads team actions tagged OKR only.
create or replace function public.team_kanban_can_view(
  p_action public.acciones_equipo, p_auth_user uuid default auth.uid())
returns boolean language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select public.team_kanban_is_admin(p_auth_user)
    or exists (select 1 from public.usuarios u where u.user_id = p_auth_user
      and u.activo = true and (
        split_part(public.normalize_business_role(u.rol::text), '_', 1) = 'direccion'
        or u.id = p_action.lider_id or u.id = p_action.asignado_a or u.id = p_action.creado_por))
    or (coalesce(p_action.es_okr, false) and p_auth_user = auth.uid() and public.is_current_user_okrs_area());
$$;

-- WhatsApp: inbox, settings and phone linking use their own capability.
create or replace function public.whatsapp_inbox_list_conversations(
  p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (wa_id text, usuario_id uuid, contact_name text, phone text, last_message_text text,
  last_message_at timestamptz, last_direction text, last_delivery_status text, open_session boolean)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  clean_search text := nullif(btrim(coalesce(p_search, '')), '');
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  off integer := greatest(0, coalesce(p_offset, 0));
begin
  if not public.can_use_whatsapp_inbox() then
    raise exception 'No autorizado para la bandeja WhatsApp.' using errcode = '42501';
  end if;
  return query
  with latest as (
    select distinct on (m.wa_id) m.wa_id, m.usuario_id, m.body_text, m.created_at, m.direction, m.delivery_status
    from public.whatsapp_messages m
    order by m.wa_id, m.created_at desc
  ),
  identities as (
    select i.external_user_id as phone, i.usuario_id,
      coalesce(nullif(btrim(i.display_name), ''), u.nombre, i.external_user_id) as contact_name
    from public.user_channel_identities i
    left join public.usuarios u on u.id = i.usuario_id
    where i.channel = 'whatsapp' and i.status = 'active'
  )
  select l.wa_id, coalesce(l.usuario_id, idn.usuario_id), coalesce(idn.contact_name, l.wa_id), l.wa_id,
    l.body_text, l.created_at, l.direction, l.delivery_status,
    exists (select 1 from public.external_inbound_messages e
      where e.channel = 'whatsapp' and e.external_user_id = l.wa_id
        and e.created_at >= now() - interval '24 hours')
  from latest l
  left join identities idn on idn.phone = l.wa_id
  where clean_search is null
    or l.wa_id ilike '%' || regexp_replace(clean_search, '\D', '', 'g') || '%'
    or coalesce(idn.contact_name, '') ilike '%' || clean_search || '%'
  order by l.created_at desc
  limit lim offset off;
end;
$$;

create or replace function public.whatsapp_inbox_list_messages(
  p_wa_id text, p_limit integer default 50, p_before timestamptz default null)
returns table (id uuid, wa_id text, usuario_id uuid, direction text, source text, message_kind text,
  body_text text, meta_message_id text, delivery_status text, operator_usuario_id uuid, error_message text,
  payload jsonb, created_at timestamptz, sent_at timestamptz, delivered_at timestamptz, read_at timestamptz,
  failed_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  phone text := regexp_replace(coalesce(p_wa_id, ''), '\D', '', 'g');
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if not public.can_use_whatsapp_inbox() then
    raise exception 'No autorizado para la bandeja WhatsApp.' using errcode = '42501';
  end if;
  if phone is null or length(phone) < 10 then
    raise exception 'Telefono WhatsApp invalido.' using errcode = '23514';
  end if;
  return query
  select m.id, m.wa_id, m.usuario_id, m.direction, m.source, m.message_kind, m.body_text, m.meta_message_id,
    m.delivery_status, m.operator_usuario_id, m.error_message, m.payload, m.created_at, m.sent_at,
    m.delivered_at, m.read_at, m.failed_at
  from public.whatsapp_messages m
  where m.wa_id = phone and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit lim;
end;
$$;

create or replace function public.whatsapp_inbox_list_contacts(
  p_search text default null, p_limit integer default 30)
returns table (usuario_id uuid, nombre text, phone text, display_name text, last_seen_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  clean_search text := nullif(btrim(coalesce(p_search, '')), '');
  lim integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if not public.can_use_whatsapp_inbox() then
    raise exception 'No autorizado para la bandeja WhatsApp.' using errcode = '42501';
  end if;
  return query
  select i.usuario_id, coalesce(u.nombre, i.display_name, i.external_user_id), i.external_user_id,
    i.display_name, i.last_seen_at
  from public.user_channel_identities i
  join public.usuarios u on u.id = i.usuario_id
  where i.channel = 'whatsapp' and i.status = 'active' and u.activo = true
    and (clean_search is null
      or i.external_user_id ilike '%' || regexp_replace(clean_search, '\D', '', 'g') || '%'
      or coalesce(u.nombre, '') ilike '%' || clean_search || '%'
      or coalesce(i.display_name, '') ilike '%' || clean_search || '%')
  order by coalesce(u.nombre, i.display_name, i.external_user_id)
  limit lim;
end;
$$;

create or replace function public.whatsapp_inbox_session_open(p_wa_id text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  phone text := regexp_replace(coalesce(p_wa_id, ''), '\D', '', 'g');
begin
  if not public.can_use_whatsapp_inbox() then
    raise exception 'No autorizado para la bandeja WhatsApp.' using errcode = '42501';
  end if;
  if phone is null or length(phone) < 10 then
    return false;
  end if;
  return exists (select 1 from public.external_inbound_messages e
    where e.channel = 'whatsapp' and e.external_user_id = phone
      and e.created_at >= now() - interval '24 hours');
end;
$$;

create or replace function public.admin_upsert_whatsapp_identity(
  p_usuario_id uuid, p_phone text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  new_id uuid;
  clean_phone text;
begin
  if not public.can_link_whatsapp_identities() then
    raise exception 'No autorizado para vincular WhatsApp.' using errcode = '42501';
  end if;
  clean_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(clean_phone) = 10 then
    clean_phone := '52' || clean_phone;
  end if;
  if p_usuario_id is null or clean_phone is null or length(clean_phone) < 10 or length(clean_phone) > 15 then
    raise exception 'Usuario y telefono E.164 (10-15 digitos, sin +) son requeridos.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.usuarios u where u.id = p_usuario_id and u.activo = true) then
    raise exception 'Usuario destino no encontrado o inactivo.' using errcode = '23503';
  end if;
  insert into public.user_channel_identities (usuario_id, channel, external_user_id, external_chat_id,
    display_name, status, verified_at, last_seen_at, metadata)
  values (p_usuario_id, 'whatsapp', clean_phone, clean_phone, nullif(btrim(coalesce(p_display_name, '')), ''),
    'active', now(), now(), jsonb_build_object('linked_by', public.get_my_usuario_id(), 'source', 'admin_manual'))
  on conflict (channel, usuario_id) do update set
    external_user_id = excluded.external_user_id,
    external_chat_id = excluded.external_chat_id,
    display_name = excluded.display_name,
    status = 'active',
    verified_at = coalesce(public.user_channel_identities.verified_at, now()),
    last_seen_at = now(),
    metadata = public.user_channel_identities.metadata || excluded.metadata,
    updated_at = now()
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.admin_clear_whatsapp_identity(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.can_link_whatsapp_identities() then
    raise exception 'No autorizado para desvincular WhatsApp.' using errcode = '42501';
  end if;
  if p_usuario_id is null then
    raise exception 'Usuario requerido.' using errcode = '23514';
  end if;
  update public.user_channel_identities
  set status = 'revoked', updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'revoked_by', public.get_my_usuario_id(), 'revoked_at', now())
  where channel = 'whatsapp' and usuario_id = p_usuario_id and status = 'active';
end;
$$;

drop policy if exists whatsapp_messages_select_inbox on public.whatsapp_messages;
create policy whatsapp_messages_select_inbox on public.whatsapp_messages
  for select to authenticated
  using ((select public.can_use_whatsapp_inbox()) or usuario_id = public.get_my_usuario_id());

drop policy if exists whatsapp_followup_settings_select_managers on public.whatsapp_followup_settings;
create policy whatsapp_followup_settings_select_managers on public.whatsapp_followup_settings
  for select to authenticated using ((select public.can_configure_whatsapp()));

drop policy if exists whatsapp_followup_settings_update_managers on public.whatsapp_followup_settings;
create policy whatsapp_followup_settings_update_managers on public.whatsapp_followup_settings
  for update to authenticated
  using ((select public.can_configure_whatsapp())) with check ((select public.can_configure_whatsapp()));

-- Functional area gained through the free-text profile field.
-- Identity, role and activation are guarded by guard_usuarios_privileges; Direction keeps its R0 trigger.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or public.can_manage_catalogs() or public.can_manage_org_hierarchy() then
    return new;
  end if;
  if new.area is distinct from old.area and exists (
    select 1 from public.areas a
    where a.system_key is not null
      and public.normalize_business_role(a.nombre) = public.normalize_business_role(new.area)
      and not exists (select 1 from public.usuario_areas ua where ua.user_id = new.id and ua.area_id = a.id)
  ) then
    raise exception 'Profile cannot change a functional area' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_privileges on public.usuarios;
create trigger guard_profile_privileges before update on public.usuarios
for each row execute function public.guard_profile_privileges();

create or replace function public.guard_functional_area_membership()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
declare
  touches_key boolean;
begin
  if auth.uid() is null or public.can_manage_catalogs() or public.can_manage_org_hierarchy() then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.area_id = old.area_id and new.user_id = old.user_id then
    return new;
  end if;
  select exists (select 1 from public.areas a where a.system_key is not null
    and a.id in (coalesce(new.area_id, old.area_id), coalesce(old.area_id, new.area_id)))
  into touches_key;
  if touches_key then
    raise exception 'Functional area membership requires an administrator' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guard_functional_area_membership on public.usuario_areas;
create trigger guard_functional_area_membership before insert or update or delete on public.usuario_areas
for each row execute function public.guard_functional_area_membership();

-- Self-service area edits leave functional-area rows untouched for non-administrators.
create or replace function public.settings_users_set_areas(
  p_user_id uuid, p_primary_area_id uuid, p_area_ids uuid[])
returns table (id uuid, user_id uuid, nombre text, rol text, area text, areas text[], activo boolean,
  manager_user_id uuid, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_my_usuarios_id uuid;
  v_all_ids uuid[];
  v_area_id uuid;
  v_admin boolean := public.can_manage_org_hierarchy() or public.can_manage_catalogs();
begin
  if p_user_id is null then
    raise exception 'Usuario invalido' using errcode = '22023';
  end if;
  select u.id into v_my_usuarios_id from public.usuarios u where u.user_id = auth.uid() limit 1;
  if not v_admin and (v_my_usuarios_id is null or v_my_usuarios_id <> p_user_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_primary_area_id is not null
    and not exists (select 1 from public.areas a where a.id = p_primary_area_id) then
    raise exception 'Area principal invalida' using errcode = '22023';
  end if;
  v_all_ids := coalesce(p_area_ids, array[]::uuid[]);
  if p_primary_area_id is not null and not (p_primary_area_id = any (v_all_ids)) then
    v_all_ids := array_append(v_all_ids, p_primary_area_id);
  end if;
  foreach v_area_id in array v_all_ids loop
    if not exists (select 1 from public.areas a where a.id = v_area_id) then
      raise exception 'Area invalida' using errcode = '22023';
    end if;
  end loop;

  if not v_admin then
    if exists (
      select 1 from public.areas a
      where a.system_key is not null and (
        (a.id = any (v_all_ids) and not exists (
          select 1 from public.usuario_areas ua where ua.user_id = p_user_id and ua.area_id = a.id))
        or (a.id <> all (v_all_ids) and exists (
          select 1 from public.usuario_areas ua where ua.user_id = p_user_id and ua.area_id = a.id)))
    ) then
      raise exception 'Functional area membership requires an administrator' using errcode = '42501';
    end if;
    delete from public.usuario_areas ua
    where ua.user_id = p_user_id
      and not exists (select 1 from public.areas a where a.id = ua.area_id and a.system_key is not null);
    update public.usuario_areas ua set is_primary = (ua.area_id = p_primary_area_id)
    where ua.user_id = p_user_id and ua.is_primary is distinct from (ua.area_id = p_primary_area_id);
    insert into public.usuario_areas (user_id, area_id, is_primary)
    select distinct p_user_id, aid, (aid = p_primary_area_id)
    from unnest(v_all_ids) as aid
    where not exists (select 1 from public.areas a where a.id = aid and a.system_key is not null);
  else
    delete from public.usuario_areas ua where ua.user_id = p_user_id;
    if cardinality(v_all_ids) > 0 then
      insert into public.usuario_areas (user_id, area_id, is_primary)
      select distinct p_user_id, aid, (aid = p_primary_area_id) from unnest(v_all_ids) as aid;
    end if;
  end if;
  if cardinality(v_all_ids) = 0 then
    update public.usuarios u set area = null, updated_at = now() where u.id = p_user_id;
  end if;

  return query
  select u.id, u.user_id, u.nombre, u.rol::text, u.area, public.usuario_area_names(u.id), u.activo,
    u.manager_user_id, u.created_at, u.updated_at
  from public.usuarios u where u.id = p_user_id;
end;
$$;

-- Conversation context shared across instances. Owner-only for user clients.
create table if not exists public.agent_session_context (
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  channel text not null check (channel in ('web', 'whatsapp', 'voice')),
  session_hash text not null check (char_length(session_hash) between 16 and 128),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 16384),
  capability_fingerprint text not null check (char_length(capability_fingerprint) <= 128),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, channel, session_hash)
);
create index if not exists agent_session_context_expires_idx on public.agent_session_context (expires_at);
alter table public.agent_session_context enable row level security;
revoke all on public.agent_session_context from anon, authenticated;
grant select, insert, update, delete on public.agent_session_context to authenticated;
drop policy if exists agent_session_context_owner on public.agent_session_context;
create policy agent_session_context_owner on public.agent_session_context
  for all to authenticated
  using (usuario_id = (select public.get_my_usuario_id()) and (select public.okr_active_user()))
  with check (usuario_id = (select public.get_my_usuario_id()) and (select public.okr_active_user())
    and expires_at <= now() + interval '31 minutes');
comment on table public.agent_session_context is
  'R1 conversation context: active query and action IDs only (no text, titles or names). TTL 30 min.';

-- Grants: per-usuario facts are service-only; current-user helpers are callable by policies.
revoke all on function public.legacy_okrs_area_grants(), public.usuario_in_area_key(uuid, text),
  public.usuario_has_module(uuid, text), public.usuario_is_super_admin(uuid), public.usuario_is_direction(uuid),
  public.usuario_is_catalog_admin(uuid), public.access_capabilities_for_usuario(uuid),
  public.my_access_capabilities(), public.current_user_capability(text), public.is_current_user_okrs_area(),
  public.can_read_all_okrs(), public.can_read_cross_area_execution(), public.can_admin_all_okrs(),
  public.can_use_whatsapp_inbox(), public.can_configure_whatsapp(), public.can_link_whatsapp_identities(),
  public.can_use_ai_whatsapp(), public.can_use_ai_whatsapp_for_usuario(uuid),
  public.whatsapp_inbox_can_access(uuid), public.guard_profile_privileges(),
  public.guard_functional_area_membership()
  from public, anon;
revoke all on function public.usuario_in_area_key(uuid, text), public.usuario_has_module(uuid, text),
  public.usuario_is_super_admin(uuid), public.usuario_is_direction(uuid), public.usuario_is_catalog_admin(uuid),
  public.access_capabilities_for_usuario(uuid), public.can_use_ai_whatsapp_for_usuario(uuid)
  from authenticated;
grant execute on function public.usuario_in_area_key(uuid, text), public.usuario_has_module(uuid, text),
  public.usuario_is_super_admin(uuid), public.usuario_is_direction(uuid), public.usuario_is_catalog_admin(uuid),
  public.access_capabilities_for_usuario(uuid), public.can_use_ai_whatsapp_for_usuario(uuid),
  public.whatsapp_inbox_can_access(uuid)
  to service_role;
grant execute on function public.legacy_okrs_area_grants(), public.my_access_capabilities(),
  public.current_user_capability(text), public.is_current_user_okrs_area(), public.can_read_all_okrs(),
  public.can_read_cross_area_execution(), public.can_admin_all_okrs(), public.can_use_whatsapp_inbox(),
  public.can_configure_whatsapp(), public.can_link_whatsapp_identities(), public.can_use_ai_whatsapp(),
  public.whatsapp_inbox_can_access(uuid)
  to authenticated, service_role;

do $$
declare routine record;
begin
  for routine in
    select p.oid::regprocedure as signature, r.rolname as owner_name, p.proowner as owner_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'legacy_okrs_area_grants', 'usuario_in_area_key', 'usuario_has_module', 'usuario_is_super_admin',
      'usuario_is_direction', 'usuario_is_catalog_admin', 'access_capabilities_for_usuario',
      'my_access_capabilities', 'current_user_capability', 'is_current_user_okrs_area', 'can_read_all_okrs',
      'can_read_cross_area_execution', 'can_admin_all_okrs', 'can_use_whatsapp_inbox', 'can_configure_whatsapp',
      'can_link_whatsapp_identities', 'can_use_ai_whatsapp', 'can_use_ai_whatsapp_for_usuario',
      'whatsapp_inbox_can_access', 'okr_manage_scope', 'okr_can_view', 'okr_can_tag_actions',
      'team_kanban_can_view', 'whatsapp_inbox_list_conversations', 'whatsapp_inbox_list_messages',
      'whatsapp_inbox_list_contacts', 'whatsapp_inbox_session_open', 'admin_upsert_whatsapp_identity',
      'admin_clear_whatsapp_identity', 'guard_profile_privileges', 'guard_functional_area_membership',
      'settings_users_set_areas'
    )
  loop
    if routine.owner_name in ('authenticated', 'anon')
       or pg_has_role('authenticated'::regrole, routine.owner_oid, 'MEMBER')
       or pg_has_role('anon'::regrole, routine.owner_oid, 'MEMBER') then
      raise exception 'Untrusted permission function owner; review ownership before applying R1';
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
