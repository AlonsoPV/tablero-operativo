-- =============================================================================
-- Usuarios: listado especifico para /settings/users.
--
-- Contexto:
-- - invite-user permite invitar a app admins, Direccion y admins de negocio.
-- - El listado /settings/users lee public.usuarios bajo RLS.
-- - Sin un acceso especifico, algunos roles que pueden crear usuarios no
--   necesariamente ven todos los perfiles creados/invitados en esa tabla.
-- =============================================================================

DROP FUNCTION IF EXISTS public.settings_users_list();

CREATE OR REPLACE FUNCTION public.settings_users_list()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  nombre text,
  rol text,
  area text,
  activo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_catalogs() THEN
    RAISE EXCEPTION 'No autorizado'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.user_id,
    au.email::text,
    u.nombre,
    u.rol::text,
    u.area,
    u.activo,
    u.created_at,
    u.updated_at
  FROM public.usuarios u
  LEFT JOIN auth.users au ON au.id = u.user_id
  ORDER BY u.nombre ASC;
END;
$$;

COMMENT ON FUNCTION public.settings_users_list() IS
  'Listado de usuarios para /settings/users. Usa SECURITY DEFINER y valida can_manage_catalogs().';

GRANT EXECUTE ON FUNCTION public.settings_users_list() TO authenticated;

-- Backfill no destructivo: si una invitacion anterior creo auth.users pero el
-- trigger/perfil no quedo en public.usuarios, crear la ficha para que aparezca
-- en /settings/users.
INSERT INTO public.usuarios (user_id, nombre, rol, area, activo)
SELECT
  au.id,
  CASE
    WHEN char_length(COALESCE(NULLIF(trim(au.raw_user_meta_data->>'nombre'), ''), '')) >= 2
      THEN trim(au.raw_user_meta_data->>'nombre')
    WHEN char_length(split_part(COALESCE(au.email, ''), '@', 1)) >= 2
      THEN split_part(COALESCE(au.email, ''), '@', 1)
    ELSE 'Usuario'
  END AS nombre,
  COALESCE(NULLIF(trim(au.raw_user_meta_data->>'rol'), ''), 'Operaciones') AS rol,
  NULLIF(trim(au.raw_user_meta_data->>'area'), '') AS area,
  COALESCE((NULLIF(trim(au.raw_user_meta_data->>'activo'), ''))::boolean, true) AS activo
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1
  FROM public.usuarios u
  WHERE u.user_id = au.id
);
