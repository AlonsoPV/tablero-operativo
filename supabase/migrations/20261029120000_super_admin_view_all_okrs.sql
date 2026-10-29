-- Super Admin ve y administra todos los OKRs (empresa y equipos).

CREATE OR REPLACE FUNCTION public.okr_manage_scope(p_area uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND (
    public.is_current_user_super_admin()
    OR public.can_manage_catalogs()
    OR public.user_belongs_to_area_name('OKRS')
    OR (p_area IS NOT NULL AND public.team_kanban_is_leader(p_area))
  );
$$;

COMMENT ON FUNCTION public.okr_manage_scope(uuid) IS
  'Administrar OKRs: Super Admin, catálogos, área OKRS, o líder del equipo del objetivo.';

CREATE OR REPLACE FUNCTION public.okr_can_view(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.okr_active_user() AND (
    public.is_current_user_super_admin()
    OR EXISTS (
      SELECT 1 FROM okrs o WHERE o.id = p_id AND (
        o.scope = 'company' OR public.okr_manage_scope(o.area_id)
        OR o.owner_user_id = public.get_my_usuario_id()
        OR EXISTS (SELECT 1 FROM usuario_areas ua WHERE ua.area_id = o.area_id AND ua.user_id = public.get_my_usuario_id())
        OR EXISTS (SELECT 1 FROM usuarios u JOIN areas a ON a.nombre = u.area WHERE u.user_id = auth.uid() AND a.id = o.area_id)
        OR EXISTS (SELECT 1 FROM okr_key_results k WHERE k.okr_id = o.id AND k.owner_user_id = public.get_my_usuario_id())
      )
    )
  );
$$;

COMMENT ON FUNCTION public.okr_can_view(uuid) IS
  'Ver un OKR: Super Admin ve todos; el resto según ámbito, área, dueño o KR.';

NOTIFY pgrst, 'reload schema';
