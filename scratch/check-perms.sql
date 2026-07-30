select
  u.id as usuarios_id,
  u.nombre,
  u.rol,
  u.activo,
  public.normalize_business_role(u.rol::text) as rol_normalizado,
  (select array_agg(ur.app_role::text) from public.user_roles ur where ur.user_id = u.user_id) as app_roles,
  (
    select array_agg(cr.nombre || ' [' || coalesce(cr.system_key, '-') || ', activo=' || cr.activo || ']')
    from public.usuario_catalog_roles ucr
    join public.catalog_roles cr on cr.id = ucr.role_id
    where ucr.user_id = u.id
  ) as roles_catalogo
from public.usuarios u
where u.user_id = :'uid';
