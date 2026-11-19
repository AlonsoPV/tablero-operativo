-- R1 complement: users whose access to OKR administration and WhatsApp comes only from the OKRS area.
-- Read-only. Run by an authorized operator before apply_r1_revoke_legacy_okrs_area.sql.
-- Works with or without migration 20261119140000 (falls back to area names).
-- Returns ids, names and booleans/counters only; no phones, emails, messages or secrets.
begin read only;

with okrs_area as (
  select a.id, a.nombre from public.areas a
  where public.normalize_business_role(a.nombre) = 'okrs'
),
members as (
  select u.id as usuario_id, u.nombre, u.rol::text as rol, u.activo, u.user_id,
    exists (select 1 from public.usuario_areas ua join okrs_area oa on oa.id = ua.area_id
            where ua.user_id = u.id) as okrs_by_usuario_areas,
    public.normalize_business_role(u.area) = 'okrs' as okrs_by_usuarios_area
  from public.usuarios u
  where public.normalize_business_role(u.area) = 'okrs'
     or exists (select 1 from public.usuario_areas ua join okrs_area oa on oa.id = ua.area_id
                where ua.user_id = u.id)
),
modules as (
  select m.usuario_id, array_agg(distinct rm.module_key order by rm.module_key) as module_keys
  from members m
  join public.usuario_catalog_roles ucr on ucr.user_id = m.usuario_id
  join public.catalog_roles cr on cr.id = ucr.role_id and cr.activo = true
  join public.catalog_role_modules rm on rm.role_id = cr.id
  group by m.usuario_id
)
select m.usuario_id, m.nombre, m.rol, m.activo,
  m.okrs_by_usuario_areas, m.okrs_by_usuarios_area,
  public.normalize_business_role(m.rol) = 'super_admin'
    or exists (select 1 from public.user_roles ur where ur.user_id = m.user_id
               and lower(ur.app_role::text) in ('super_admin', 'admin')) as super_or_app_admin,
  split_part(public.normalize_business_role(m.rol), '_', 1) = 'direccion' as direction,
  public.normalize_business_role(m.rol) in ('dg', 'sistemas') as catalog_admin_by_rol,
  coalesce(mo.module_keys, array[]::text[]) as current_module_keys,
  (select count(*) from public.okrs o where o.owner_user_id = m.usuario_id) as okrs_owned,
  (select count(*) from public.okr_key_results k where k.owner_user_id = m.usuario_id) as krs_owned,
  (select count(*) from public.acciones_equipo e where e.es_okr and e.creado_por = m.usuario_id) as okr_tagged_team_actions_created,
  exists (select 1 from public.user_channel_identities i
          where i.usuario_id = m.usuario_id and i.channel = 'whatsapp' and i.status = 'active') as has_linked_whatsapp,
  (select count(*) from public.whatsapp_messages w
   where w.operator_usuario_id = m.usuario_id) as inbox_messages_sent_as_operator,
  (select count(*) from public.user_channel_identities i
   where i.channel = 'whatsapp' and i.metadata ->> 'linked_by' = m.usuario_id::text) as phones_linked_by_user
from members m
left join modules mo on mo.usuario_id = m.usuario_id
order by m.activo desc, m.nombre;

-- Area rows that will (or did) receive system_key 'okrs'; more than one row requires a manual decision.
select a.id, a.nombre, a.activo,
  case when exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'areas' and column_name = 'system_key')
       then 'column present' else 'column missing (migration A not applied)' end as system_key_status
from public.areas a
where public.normalize_business_role(a.nombre) = 'okrs'
order by a.id;

-- Catalog roles that already hold the explicit capability modules (after migration A).
select cr.id as role_id, cr.nombre as role_name, cr.activo, rm.module_key,
  (select count(*) from public.usuario_catalog_roles ucr where ucr.role_id = cr.id) as assigned_users
from public.catalog_role_modules rm
join public.catalog_roles cr on cr.id = rm.role_id
where rm.module_key in ('okrs_admin', 'whatsapp_assistant', 'whatsapp_inbox',
                        'whatsapp_settings', 'whatsapp_identity_link')
order by rm.module_key, cr.nombre;

commit;
