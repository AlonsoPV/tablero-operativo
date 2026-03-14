-- =============================================================================
-- Permitir a admins INSERT y UPDATE en public.usuarios
-- Sin esto, desde el cliente no se puede añadir perfil (INSERT) ni editar otros (UPDATE).
-- =============================================================================

-- Admins pueden insertar perfiles (vincular auth.users existente a public.usuarios)
CREATE POLICY usuarios_insert_admin ON public.usuarios
  FOR INSERT
  WITH CHECK (is_app_admin());

-- Admins pueden actualizar cualquier perfil; usuario normal solo el propio
DROP POLICY IF EXISTS usuarios_update_own ON public.usuarios;
CREATE POLICY usuarios_update_own_or_admin ON public.usuarios
  FOR UPDATE
  USING (user_id = auth.uid() OR is_app_admin());
