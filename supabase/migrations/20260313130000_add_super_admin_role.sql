-- =============================================================================
-- Rol Super Admin
-- Añade app_role 'super_admin' con privilegios máximos y función para asignarlo.
-- =============================================================================

-- Añadir valor al enum (PostgreSQL 10+)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- -----------------------------------------------------------------------------
-- Helper: es admin (admin o super_admin)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.app_role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- Helper: es super_admin (solo super_admin)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.app_role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- Políticas user_roles: solo super_admin puede insertar/actualizar/eliminar
-- (asignar o revocar roles). Cualquier usuario puede leer su propio rol.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS user_roles_select_own_or_admin ON user_roles;

CREATE POLICY user_roles_select_own_or_admin ON user_roles
  FOR SELECT USING (user_id = auth.uid() OR is_app_admin());

-- Solo super_admin puede gestionar roles (crear, actualizar, borrar)
CREATE POLICY user_roles_insert_super_admin ON user_roles
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY user_roles_update_super_admin ON user_roles
  FOR UPDATE USING (is_super_admin());

CREATE POLICY user_roles_delete_super_admin ON user_roles
  FOR DELETE USING (is_super_admin());

-- -----------------------------------------------------------------------------
-- Función: asignar primer super_admin (solo ejecución con service_role / SQL)
-- Uso desde Dashboard SQL o Edge Function con service_role:
--   SELECT set_first_super_admin('uuid-del-auth-user');
--   SELECT set_first_super_admin_by_email('admin@empresa.com');
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_first_super_admin(p_user_id uuid)
RETURNS void AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id no puede ser null';
  END IF;
  INSERT INTO user_roles (user_id, app_role)
  VALUES (p_user_id, 'super_admin')
  ON CONFLICT (user_id) DO UPDATE SET app_role = 'super_admin', updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_first_super_admin(uuid) IS
  'Asigna rol super_admin a un usuario. Ejecutar con service_role o desde SQL Editor.';

-- Por email (busca auth.users vía tabla usuarios)
CREATE OR REPLACE FUNCTION set_first_super_admin_by_email(p_email text)
RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'email no puede ser vacío';
  END IF;
  SELECT u.user_id INTO v_user_id
  FROM usuarios u
  JOIN auth.users au ON au.id = u.user_id
  WHERE au.email = trim(lower(p_email))
  LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró usuario con email %', p_email;
  END IF;
  PERFORM set_first_super_admin(v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_first_super_admin_by_email(text) IS
  'Asigna rol super_admin al usuario con el email dado. Ejecutar con service_role o desde SQL Editor.';
