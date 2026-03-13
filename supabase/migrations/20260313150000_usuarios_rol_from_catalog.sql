-- =============================================================================
-- Conectar usuarios.rol y usuarios.area con catálogos
-- rol: de enum user_role a text (se guarda nombre de catalog_roles)
-- area: ya es text (se guarda nombre de areas); sin cambio de esquema
-- =============================================================================

-- 1. Cambiar columna rol a text (conservar valores actuales)
ALTER TABLE usuarios
  ALTER COLUMN rol TYPE text USING rol::text;

-- Mantener default para nuevos registros sin rol
ALTER TABLE usuarios
  ALTER COLUMN rol SET DEFAULT 'Operaciones';

-- 2. Trigger handle_new_user: usar text para rol
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_nombre text;
  user_rol text;
BEGIN
  user_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1));
  user_rol := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'rol'), ''),
    'Operaciones'
  );
  INSERT INTO public.usuarios (user_id, nombre, rol)
  VALUES (NEW.id, user_nombre, user_rol);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN usuarios.rol IS 'Nombre del rol; debe coincidir con catalog_roles.nombre (catálogo conectado)';
COMMENT ON COLUMN usuarios.area IS 'Nombre del área; debe coincidir con areas.nombre (catálogo conectado)';
