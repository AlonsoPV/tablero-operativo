-- Solo el dueño del KR o Super Admin pueden actualizar mediciones / iniciativas.

CREATE OR REPLACE FUNCTION public.okr_can_update_kr(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND EXISTS (
    SELECT 1
    FROM okr_key_results k
    JOIN okrs o ON o.id = k.okr_id
    WHERE k.id = p_id
      AND o.activo
      AND (
        public.is_current_user_super_admin()
        OR k.owner_user_id = public.get_my_usuario_id()
      )
  );
$$;

COMMENT ON FUNCTION public.okr_can_update_kr(uuid) IS
  'Actualizar medición/iniciativas del KR: solo dueño del KR o Super Admin.';

NOTIFY pgrst, 'reload schema';
