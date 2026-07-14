-- Kanban por Equipos: acceso exclusivo para Super Admin.
-- Se protegen tanto las tablas (RLS) como cada RPC SECURITY DEFINER expuesta.

CREATE OR REPLACE FUNCTION public.team_kanban_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
      WHERE u.user_id = (SELECT auth.uid())
        AND u.activo = true
        AND (
          lower(replace(btrim(u.rol::text), ' ', '_')) = 'super_admin'
          OR lower(ur.app_role::text) = 'super_admin'
        )
    );
$$;

REVOKE ALL ON FUNCTION public.team_kanban_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_kanban_is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.team_kanban_assert_super_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.team_kanban_is_super_admin() THEN
    RAISE EXCEPTION 'Kanban por Equipos es exclusivo para Super Admin'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_assert_super_admin() FROM PUBLIC, anon, authenticated;

-- Las funciones originales conservan la logica del modulo, pero dejan de ser
-- endpoints publicos. Las nuevas funciones homonimas actuan como una barrera.
DO $$
BEGIN
  IF to_regprocedure('public.team_kanban_my_areas_internal()') IS NULL THEN
    ALTER FUNCTION public.team_kanban_my_areas()
      RENAME TO team_kanban_my_areas_internal;
  END IF;
  IF to_regprocedure('public.team_kanban_my_leadership_internal()') IS NULL THEN
    ALTER FUNCTION public.team_kanban_my_leadership()
      RENAME TO team_kanban_my_leadership_internal;
  END IF;
  IF to_regprocedure('public.team_kanban_set_my_leadership_internal(uuid[])') IS NULL THEN
    ALTER FUNCTION public.team_kanban_set_my_leadership(uuid[])
      RENAME TO team_kanban_set_my_leadership_internal;
  END IF;
  IF to_regprocedure('public.team_kanban_board_internal(uuid)') IS NULL THEN
    ALTER FUNCTION public.team_kanban_board(uuid)
      RENAME TO team_kanban_board_internal;
  END IF;
  IF to_regprocedure('public.team_kanban_create_action_internal(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[])') IS NULL THEN
    ALTER FUNCTION public.team_kanban_create_action(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[])
      RENAME TO team_kanban_create_action_internal;
  END IF;
  IF to_regprocedure('public.team_kanban_update_action_internal(uuid,uuid,uuid,text,boolean)') IS NULL THEN
    ALTER FUNCTION public.team_kanban_update_action(uuid,uuid,uuid,text,boolean)
      RENAME TO team_kanban_update_action_internal;
  END IF;
  IF to_regprocedure('public.team_kanban_escalate_internal(uuid,text)') IS NULL THEN
    ALTER FUNCTION public.team_kanban_escalate(uuid,text)
      RENAME TO team_kanban_escalate_internal;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_my_areas_internal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_my_leadership_internal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_set_my_leadership_internal(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_board_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_create_action_internal(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_update_action_internal(uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_escalate_internal(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.team_kanban_my_areas()
RETURNS TABLE (id uuid, nombre text, is_leader boolean, member_count bigint, open_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.team_kanban_assert_super_admin();
  RETURN QUERY SELECT * FROM public.team_kanban_my_areas_internal();
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_my_leadership()
RETURNS TABLE (area_id uuid, nombre text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.team_kanban_assert_super_admin();
  RETURN QUERY SELECT * FROM public.team_kanban_my_leadership_internal();
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_set_my_leadership(p_area_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.team_kanban_assert_super_admin();
  PERFORM public.team_kanban_set_my_leadership_internal(p_area_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_board(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.team_kanban_assert_super_admin();
  RETURN public.team_kanban_board_internal(p_area_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_create_action(
  p_area_id uuid,
  p_title text,
  p_description text,
  p_assignee uuid,
  p_priority text,
  p_due_at timestamptz,
  p_evidence boolean,
  p_checklist jsonb DEFAULT '[]'::jsonb,
  p_evidence_text text DEFAULT NULL,
  p_story_points integer DEFAULT 0,
  p_tipo_accion text DEFAULT 'operativa',
  p_gap_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_catalog_kpi_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS public.acciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.team_kanban_assert_super_admin();
  RETURN public.team_kanban_create_action_internal(
    p_area_id, p_title, p_description, p_assignee, p_priority, p_due_at,
    p_evidence, p_checklist, p_evidence_text, p_story_points, p_tipo_accion,
    p_gap_ids, p_catalog_kpi_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_update_action(
  p_action_id uuid,
  p_state_id uuid DEFAULT NULL,
  p_assignee uuid DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_blocked boolean DEFAULT NULL
)
RETURNS public.acciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.team_kanban_assert_super_admin();
  RETURN public.team_kanban_update_action_internal(
    p_action_id, p_state_id, p_assignee, p_priority, p_blocked
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_escalate(p_action_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.team_kanban_assert_super_admin();
  RETURN public.team_kanban_escalate_internal(p_action_id, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.team_kanban_my_areas() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_my_leadership() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_set_my_leadership(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_board(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_create_action(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_update_action(uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_kanban_escalate(uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.team_kanban_my_areas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_my_leadership() TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_set_my_leadership(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_board(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_create_action(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_update_action(uuid,uuid,uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_kanban_escalate(uuid,text) TO authenticated;

DROP POLICY IF EXISTS area_lideres_select_scoped ON public.area_lideres;
CREATE POLICY area_lideres_select_scoped
ON public.area_lideres FOR SELECT TO authenticated
USING ((SELECT public.team_kanban_is_super_admin()));

DROP POLICY IF EXISTS area_estados_select_scoped ON public.area_kanban_estados;
CREATE POLICY area_estados_select_scoped
ON public.area_kanban_estados FOR SELECT TO authenticated
USING ((SELECT public.team_kanban_is_super_admin()));

DROP POLICY IF EXISTS acciones_equipo_select_scoped ON public.acciones_equipo;
CREATE POLICY acciones_equipo_select_scoped
ON public.acciones_equipo FOR SELECT TO authenticated
USING ((SELECT public.team_kanban_is_super_admin()));

DROP POLICY IF EXISTS escalamiento_select_leaders ON public.escalamiento_historial;
CREATE POLICY escalamiento_select_leaders
ON public.escalamiento_historial FOR SELECT TO authenticated
USING ((SELECT public.team_kanban_is_super_admin()));

COMMENT ON FUNCTION public.team_kanban_is_super_admin() IS
  'Autoriza Kanban por Equipos exclusivamente para rol de negocio o app_role super_admin.';

