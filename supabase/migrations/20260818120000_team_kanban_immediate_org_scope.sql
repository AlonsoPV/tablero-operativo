-- Kanban por Equipos: alcance inmediato por organigrama y area activa.
-- Una sola regla alimenta los catalogos y protege acciones, checks y menciones.

CREATE OR REPLACE FUNCTION public.team_kanban_user_is_super_admin(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
    WHERE u.id = p_usuario_id
      AND (
        public.normalize_business_role(u.rol::text) = public.normalize_business_role('super_admin')
        OR lower(coalesce(ur.app_role::text, '')) = 'super_admin'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_user_is_in_area_scope(
  p_usuario_id uuid,
  p_area_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_usuario_id
      AND u.activo = true
      AND (
        public.team_kanban_user_belongs_to_area(u.id, p_area_id)
        OR EXISTS (
          SELECT 1
          FROM public.area_lideres al
          WHERE al.area_id = p_area_id
            AND al.user_id = u.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.usuarios report
          WHERE report.manager_user_id = u.id
            AND report.activo = true
            AND public.team_kanban_user_belongs_to_area(report.id, p_area_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_users_share_immediate_scope(
  p_actor_id uuid,
  p_target_id uuid,
  p_area_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor AS (
    SELECT id, manager_user_id
    FROM public.usuarios
    WHERE id = p_actor_id
      AND activo = true
    LIMIT 1
  ),
  target AS (
    SELECT id, manager_user_id
    FROM public.usuarios
    WHERE id = p_target_id
      AND activo = true
    LIMIT 1
  )
  SELECT EXISTS (SELECT 1 FROM actor)
    AND EXISTS (SELECT 1 FROM target)
    AND public.team_kanban_user_is_in_area_scope(p_target_id, p_area_id)
    AND NOT public.team_kanban_user_is_super_admin(p_target_id)
    AND (
      public.team_kanban_user_is_super_admin(p_actor_id)
      OR (
        public.team_kanban_user_is_in_area_scope(p_actor_id, p_area_id)
        AND (
          p_actor_id = p_target_id
          OR (SELECT manager_user_id FROM target) = p_actor_id
          OR (SELECT manager_user_id FROM actor) = p_target_id
          OR (
            (SELECT manager_user_id FROM actor) IS NOT NULL
            AND (SELECT manager_user_id FROM actor) = (SELECT manager_user_id FROM target)
          )
          -- La regla funcional tambien considera pares a quienes comparten el area activa.
          OR (
            public.team_kanban_user_is_in_area_scope(p_actor_id, p_area_id)
            AND public.team_kanban_user_is_in_area_scope(p_target_id, p_area_id)
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_current_user_can_use_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id
    FROM public.usuarios
    WHERE user_id = (SELECT auth.uid())
      AND activo = true
    LIMIT 1
  )
  SELECT public.team_kanban_current_user_is_global_admin()
    OR EXISTS (
      SELECT 1
      FROM me
      WHERE public.team_kanban_user_is_in_area_scope(me.id, p_area_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_user_is_available(
  p_area_id uuid,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id
    FROM public.usuarios
    WHERE user_id = (SELECT auth.uid())
      AND activo = true
    LIMIT 1
  )
  SELECT public.team_kanban_current_user_can_use_area(p_area_id)
    AND EXISTS (
      SELECT 1
      FROM me
      WHERE public.team_kanban_users_share_immediate_scope(me.id, p_target_id, p_area_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_available_users(p_area_id uuid)
RETURNS TABLE (
  id uuid,
  nombre text,
  rol text,
  area text,
  manager_user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  IF NOT public.team_kanban_current_user_can_use_area(p_area_id) THEN
    RAISE EXCEPTION 'No autorizado para esta area'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.nombre,
    u.rol::text,
    a.nombre,
    u.manager_user_id
  FROM public.usuarios u
  JOIN public.areas a ON a.id = p_area_id
  WHERE public.team_kanban_user_is_available(p_area_id, u.id)
  ORDER BY u.nombre;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_my_areas_membership_source()
RETURNS TABLE (id uuid, nombre text, is_leader boolean, member_count bigint, open_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT u.id, u.area
    FROM public.usuarios u
    WHERE u.user_id = (SELECT auth.uid())
      AND u.activo = true
    LIMIT 1
  ),
  membership AS (
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN public.usuario_areas ua ON ua.area_id = a.id
    JOIN me ON me.id = ua.user_id
    UNION
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN me ON me.area IS NOT NULL
      AND lower(btrim(a.nombre)) = lower(btrim(me.area))
    UNION
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN public.area_lideres al ON al.area_id = a.id
    JOIN me ON me.id = al.user_id
    UNION
    SELECT DISTINCT a.id, a.nombre
    FROM public.areas a
    JOIN public.usuarios report ON public.team_kanban_user_belongs_to_area(report.id, a.id)
    JOIN me ON report.manager_user_id = me.id
    WHERE report.activo = true
  ),
  visible AS (
    SELECT a.id, a.nombre
    FROM public.areas a
    WHERE public.team_kanban_current_user_is_global_admin()
    UNION
    SELECT m.id, m.nombre
    FROM membership m
  )
  SELECT
    v.id,
    v.nombre,
    EXISTS (
      SELECT 1
      FROM me
      WHERE EXISTS (
        SELECT 1 FROM public.area_lideres al
        WHERE al.area_id = v.id AND al.user_id = me.id
      )
      OR EXISTS (
        SELECT 1 FROM public.usuarios report
        WHERE report.manager_user_id = me.id
          AND report.activo = true
          AND public.team_kanban_user_belongs_to_area(report.id, v.id)
      )
    ) AS is_leader,
    (SELECT count(*) FROM public.team_kanban_available_users(v.id)) AS member_count,
    (
      SELECT count(*)
      FROM public.acciones_equipo ae
      JOIN public.statuses s ON s.id = ae.estado_id
      WHERE ae.area_id = v.id
        AND ae.es_plantilla = false
        AND NOT s.es_cierre
    ) AS open_count
  FROM visible v
  ORDER BY v.nombre;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_board(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_is_leader boolean;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT id INTO v_me
  FROM public.usuarios
  WHERE user_id = (SELECT auth.uid()) AND activo = true
  LIMIT 1;

  IF v_me IS NULL OR NOT public.team_kanban_current_user_can_use_area(p_area_id) THEN
    RAISE EXCEPTION 'No autorizado para esta area' USING ERRCODE = '42501';
  END IF;

  v_is_leader := EXISTS (
    SELECT 1 FROM public.area_lideres al
    WHERE al.area_id = p_area_id AND al.user_id = v_me
  ) OR EXISTS (
    SELECT 1 FROM public.usuarios report
    WHERE report.manager_user_id = v_me
      AND report.activo = true
      AND public.team_kanban_user_belongs_to_area(report.id, p_area_id)
  );

  RETURN jsonb_build_object(
    'isLeader', v_is_leader,
    'canManage', true,
    'states', public.team_kanban_catalog_states_json(p_area_id),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'nombre', m.nombre,
        'rol', m.rol,
        'area', m.area,
        'manager_user_id', m.manager_user_id
      ) ORDER BY m.nombre)
      FROM public.team_kanban_available_users(p_area_id) m
    ), '[]'::jsonb),
    'actions', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('asignado_nombre', u.nombre) ORDER BY a.created_at DESC)
      FROM public.acciones_equipo a
      JOIN public.usuarios u ON u.id = a.asignado_a
      WHERE a.area_id = p_area_id AND a.es_plantilla = false
    ), '[]'::jsonb),
    'series', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(t) || jsonb_build_object(
          'asignado_nombre', u.nombre,
          'ocurrencias_total', (SELECT count(*) FROM public.acciones_equipo o WHERE o.serie_id = t.id),
          'ocurrencias_abiertas', (
            SELECT count(*)
            FROM public.acciones_equipo o
            JOIN public.statuses s2 ON s2.id = o.estado_id
            WHERE o.serie_id = t.id AND o.completed_at IS NULL AND NOT s2.es_cierre
          ),
          'ultima_ocurrencia', (SELECT max(o.ocurrencia_fecha) FROM public.acciones_equipo o WHERE o.serie_id = t.id)
        )
        ORDER BY t.serie_activa DESC, t.created_at DESC
      )
      FROM public.acciones_equipo t
      JOIN public.usuarios u ON u.id = t.asignado_a
      WHERE t.area_id = p_area_id AND t.es_plantilla = true
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_checklist_users_are_available(
  p_area_id uuid,
  p_checklist jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) item
      WHERE nullif(btrim(item->>'responsable_id'), '') IS NOT NULL
        AND NOT CASE
          WHEN (item->>'responsable_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN public.team_kanban_user_is_available(p_area_id, (item->>'responsable_id')::uuid)
          ELSE false
        END
    );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_guard_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
    OR NEW.area_id IS DISTINCT FROM OLD.area_id
    OR NEW.asignado_a IS DISTINCT FROM OLD.asignado_a
  THEN
    IF NOT public.team_kanban_user_is_available(NEW.area_id, NEW.asignado_a) THEN
      RAISE EXCEPTION 'El responsable no esta disponible dentro de tu equipo y area activa.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT'
    OR NEW.area_id IS DISTINCT FROM OLD.area_id
    OR NEW.checklist IS DISTINCT FROM OLD.checklist
  THEN
    IF NOT public.team_kanban_checklist_users_are_available(NEW.area_id, NEW.checklist) THEN
      RAISE EXCEPTION 'Uno o mas responsables de checks estan fuera de tu equipo y area activa.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_kanban_assignment_scope ON public.acciones_equipo;
CREATE TRIGGER trg_team_kanban_assignment_scope
BEFORE INSERT OR UPDATE OF area_id, asignado_a, checklist
ON public.acciones_equipo
FOR EACH ROW
EXECUTE FUNCTION public.team_kanban_guard_assignment_scope();

CREATE OR REPLACE FUNCTION public.team_kanban_guard_comment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area_id uuid;
  v_tag text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.area_id INTO v_area_id
  FROM public.acciones_equipo a
  WHERE a.id = NEW.accion_id;

  IF v_area_id IS NULL OR NOT public.team_kanban_current_user_can_use_area(v_area_id) THEN
    RAISE EXCEPTION 'No autorizado para comentar en esta accion.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT'
    OR NEW.accion_id IS DISTINCT FROM OLD.accion_id
    OR NEW.asignado IS DISTINCT FROM OLD.asignado
  THEN
    IF NEW.asignado IS NOT NULL
      AND NOT public.team_kanban_user_is_available(v_area_id, NEW.asignado)
    THEN
      RAISE EXCEPTION 'El usuario etiquetado no esta disponible dentro de tu equipo y area activa.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT'
    OR NEW.accion_id IS DISTINCT FROM OLD.accion_id
    OR NEW.etiquetas IS DISTINCT FROM OLD.etiquetas
  THEN
    FOREACH v_tag IN ARRAY coalesce(NEW.etiquetas, ARRAY[]::text[]) LOOP
      IF v_tag ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND NOT public.team_kanban_user_is_available(v_area_id, v_tag::uuid)
      THEN
        RAISE EXCEPTION 'Una o mas menciones estan fuera de tu equipo y area activa.'
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_kanban_comment_scope ON public.equipo_accion_comentarios;
CREATE TRIGGER trg_team_kanban_comment_scope
BEFORE INSERT OR UPDATE OF accion_id, asignado, etiquetas
ON public.equipo_accion_comentarios
FOR EACH ROW
EXECUTE FUNCTION public.team_kanban_guard_comment_scope();

REVOKE ALL ON FUNCTION public.team_kanban_user_is_super_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_user_is_in_area_scope(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_users_share_immediate_scope(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_user_is_available(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_checklist_users_are_available(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_guard_assignment_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_guard_comment_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_available_users(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_kanban_available_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_board(uuid) TO authenticated;

COMMENT ON FUNCTION public.team_kanban_available_users(uuid) IS
  'Catalogo unico de usuarios activos disponibles por organigrama y area activa; excluye Super Admin como candidato.';
COMMENT ON FUNCTION public.team_kanban_user_is_available(uuid, uuid) IS
  'Regla backend reutilizable para responsables de acciones, checks y menciones del Kanban por Equipos.';

NOTIFY pgrst, 'reload schema';
