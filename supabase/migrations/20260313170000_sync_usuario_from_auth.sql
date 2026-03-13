-- =============================================================================
-- Sincronizar perfil en usuarios para un user_id creado solo en auth.users
-- Si creas un usuario en Supabase Auth (Authentication) pero no aparece en
-- "Administración de usuarios" del tablero, es porque falta la fila en public.usuarios.
-- Este script inserta el perfil para el user_id indicado (si no existe).
-- =============================================================================

-- Usuario creado directo en Supabase Auth: dd764c9f-8145-45d4-9111-0a8ec7f687e5
-- Inserta perfil en public.usuarios solo si existe en auth.users y aún no está en usuarios.
INSERT INTO public.usuarios (user_id, nombre, rol, activo)
SELECT
  u.id,
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'nombre'), ''),
    split_part(u.email, '@', 1),
    'Usuario añadido'
  ),
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'rol'), ''),
    'Operaciones'
  ),
  true
FROM auth.users u
WHERE u.id = 'dd764c9f-8145-45d4-9111-0a8ec7f687e5'
  AND NOT EXISTS (SELECT 1 FROM public.usuarios WHERE user_id = u.id);
