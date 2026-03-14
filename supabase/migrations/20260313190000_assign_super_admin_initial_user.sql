-- =============================================================================
-- Asignar super_admin al usuario que debe ver Settings → Usuarios.
-- Sin rol en user_roles, is_app_admin() es false y la política solo muestra
-- la fila donde user_id = auth.uid() (un usuario por defecto no ve a los demás).
-- Ejecutar esta migración en el entorno donde ese usuario debe ser admin.
-- En otros entornos, usar: SELECT set_first_super_admin_by_email('admin@...');
-- =============================================================================

INSERT INTO user_roles (user_id, app_role)
VALUES ('83a033bd-e273-4314-8c9a-6a6bd8f4400e'::uuid, 'super_admin')
ON CONFLICT (user_id) DO UPDATE SET app_role = 'super_admin', updated_at = now();
