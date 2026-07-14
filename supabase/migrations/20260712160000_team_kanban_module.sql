-- Kanban por Equipos: liderazgo por area, estados configurables, acciones y escalamiento.

CREATE TABLE IF NOT EXISTS public.area_lideres (
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (area_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.area_kanban_estados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 40),
  orden integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#64748b',
  es_final boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.acciones_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  estado_id uuid NOT NULL REFERENCES public.area_kanban_estados(id) ON DELETE RESTRICT,
  titulo text NOT NULL CHECK (char_length(trim(titulo)) BETWEEN 3 AND 120),
  descripcion text,
  prioridad text NOT NULL DEFAULT 'Media' CHECK (prioridad IN ('Baja','Media','Alta','Critica')),
  asignado_a uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  lider_id uuid REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  creado_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  fecha_limite timestamptz,
  evidencia_requerida boolean NOT NULL DEFAULT false,
  evidencia_esperada text,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checklist) = 'array'),
  story_points integer NOT NULL DEFAULT 0,
  tipo_accion text NOT NULL DEFAULT 'operativa',
  gap_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  catalog_kpi_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  bloqueada boolean NOT NULL DEFAULT false,
  escalada boolean NOT NULL DEFAULT false,
  accion_corporativa_id uuid REFERENCES public.acciones_diarias(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Si la tabla ya existía sin lider_id (CREATE TABLE IF NOT EXISTS no añade columnas):
ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS lider_id uuid REFERENCES public.usuarios(id) ON DELETE RESTRICT;

UPDATE public.acciones_equipo
SET lider_id = COALESCE(lider_id, creado_por, asignado_a)
WHERE lider_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.acciones_equipo WHERE lider_id IS NULL) THEN
    RAISE EXCEPTION 'acciones_equipo.lider_id quedó nulo en alguna fila; revisa datos.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'acciones_equipo'
      AND column_name = 'lider_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.acciones_equipo ALTER COLUMN lider_id SET NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.escalamiento_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accion_equipo_id uuid NOT NULL REFERENCES public.acciones_equipo(id) ON DELETE CASCADE,
  accion_corporativa_id uuid REFERENCES public.acciones_diarias(id) ON DELETE SET NULL,
  area_origen_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  area_destino text NOT NULL DEFAULT 'Corporativo',
  escalado_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  motivo text NOT NULL CHECK (char_length(trim(motivo)) BETWEEN 5 AND 500),
  prioridad text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_area_lideres_user ON public.area_lideres(user_id);
CREATE INDEX IF NOT EXISTS idx_area_estados_area_orden ON public.area_kanban_estados(area_id, orden);
CREATE INDEX IF NOT EXISTS idx_acciones_equipo_area_estado ON public.acciones_equipo(area_id, estado_id);
CREATE INDEX IF NOT EXISTS idx_acciones_equipo_asignado ON public.acciones_equipo(asignado_a);
CREATE INDEX IF NOT EXISTS idx_acciones_equipo_lider_area ON public.acciones_equipo(lider_id, area_id);
CREATE INDEX IF NOT EXISTS idx_acciones_equipo_fecha_limite ON public.acciones_equipo(fecha_limite) WHERE completed_at IS NULL;

INSERT INTO public.area_kanban_estados (area_id, nombre, orden, color, es_final)
SELECT a.id, s.nombre, s.orden, s.color, s.es_final
FROM public.areas a
CROSS JOIN (VALUES
  ('Pendiente', 10, '#64748b', false),
  ('En proceso', 20, '#3b82f6', false),
  ('Bloqueado', 30, '#ef4444', false),
  ('Validacion', 40, '#f59e0b', false),
  ('Terminado', 50, '#22c55e', true)
) AS s(nombre, orden, color, es_final)
ON CONFLICT (area_id, nombre) DO NOTHING;

CREATE OR REPLACE FUNCTION public.team_kanban_is_admin(p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
    WHERE u.user_id = p_user
      AND (lower(u.rol::text) IN ('administrador','super admin','super_admin','direccion')
        OR ur.app_role::text IN ('admin','super_admin'))
  );
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_is_leader(p_area_id uuid, p_auth_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.area_lideres al
    JOIN public.usuarios u ON u.id = al.user_id
    WHERE al.area_id = p_area_id AND u.user_id = p_auth_user
  ) OR public.team_kanban_is_admin(p_auth_user);
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_can_view(p_action public.acciones_equipo, p_auth_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT public.team_kanban_is_admin(p_auth_user)
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.user_id=p_auth_user AND u.id=p_action.lider_id)
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.user_id = p_auth_user AND (u.id = p_action.asignado_a OR u.id = p_action.creado_por));
$$;

ALTER TABLE public.area_lideres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_kanban_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acciones_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalamiento_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY area_lideres_select_scoped ON public.area_lideres FOR SELECT TO authenticated
USING (public.team_kanban_is_admin() OR public.team_kanban_is_leader(area_id));
CREATE POLICY area_estados_select_scoped ON public.area_kanban_estados FOR SELECT TO authenticated
USING (public.team_kanban_is_admin() OR public.team_kanban_is_leader(area_id)
  OR EXISTS (SELECT 1 FROM public.usuario_areas ua JOIN public.usuarios u ON u.id=ua.user_id WHERE ua.area_id=area_kanban_estados.area_id AND u.user_id=auth.uid()));
CREATE POLICY acciones_equipo_select_scoped ON public.acciones_equipo FOR SELECT TO authenticated
USING (public.team_kanban_can_view(acciones_equipo));
CREATE POLICY escalamiento_select_leaders ON public.escalamiento_historial FOR SELECT TO authenticated
USING (public.team_kanban_is_leader(area_origen_id));

GRANT SELECT ON public.area_lideres, public.area_kanban_estados, public.acciones_equipo, public.escalamiento_historial TO authenticated;

CREATE OR REPLACE FUNCTION public.team_kanban_my_areas()
RETURNS TABLE (id uuid, nombre text, is_leader boolean, member_count bigint, open_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT id FROM public.usuarios WHERE user_id=auth.uid()), visible AS (
    SELECT a.id, a.nombre,
      public.team_kanban_is_leader(a.id) AS is_leader
    FROM public.areas a
    WHERE public.team_kanban_is_admin()
       OR EXISTS (SELECT 1 FROM public.usuario_areas ua, me WHERE ua.area_id=a.id AND ua.user_id=me.id)
       OR EXISTS (SELECT 1 FROM public.area_lideres al, me WHERE al.area_id=a.id AND al.user_id=me.id)
  )
  SELECT v.id, v.nombre, v.is_leader,
    (SELECT count(*) FROM public.usuario_areas ua JOIN public.usuarios member ON member.id=ua.user_id, me
      WHERE ua.area_id=v.id AND (public.team_kanban_is_admin() OR member.id=me.id OR member.manager_user_id=me.id)),
    (SELECT count(*) FROM public.acciones_equipo ae JOIN public.area_kanban_estados s ON s.id=ae.estado_id, me
      WHERE ae.area_id=v.id AND NOT s.es_final AND (public.team_kanban_is_admin() OR ae.lider_id=me.id OR ae.asignado_a=me.id OR ae.creado_por=me.id))
  FROM visible v ORDER BY v.nombre;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_my_leadership()
RETURNS TABLE (area_id uuid, nombre text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.id, a.nombre
  FROM public.area_lideres al
  JOIN public.usuarios u ON u.id=al.user_id
  JOIN public.areas a ON a.id=al.area_id
  WHERE u.user_id=auth.uid()
  ORDER BY a.nombre;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_set_my_leadership(p_area_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_me uuid; v_area uuid; v_can_lead boolean;
BEGIN
  SELECT id INTO v_me FROM public.usuarios WHERE user_id=auth.uid();
  IF v_me IS NULL THEN RAISE EXCEPTION 'Perfil no encontrado' USING ERRCODE='42501'; END IF;
  v_can_lead := public.team_kanban_is_admin() OR EXISTS (SELECT 1 FROM public.usuarios WHERE manager_user_id=v_me AND activo);
  IF NOT v_can_lead THEN RAISE EXCEPTION 'Solo un lider con reportes directos puede administrar areas' USING ERRCODE='42501'; END IF;
  FOREACH v_area IN ARRAY coalesce(p_area_ids,ARRAY[]::uuid[]) LOOP
    IF NOT public.team_kanban_is_admin() AND NOT EXISTS (SELECT 1 FROM public.usuario_areas WHERE user_id=v_me AND area_id=v_area) THEN
      RAISE EXCEPTION 'Solo puedes liderar areas asignadas a tu perfil' USING ERRCODE='42501';
    END IF;
  END LOOP;
  DELETE FROM public.area_lideres WHERE user_id=v_me;
  INSERT INTO public.area_lideres(area_id,user_id) SELECT DISTINCT unnest(coalesce(p_area_ids,ARRAY[]::uuid[])),v_me;
END; $$;

CREATE OR REPLACE FUNCTION public.team_kanban_board(p_area_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid; v_allowed boolean;
BEGIN
  SELECT id INTO v_me FROM public.usuarios WHERE user_id=auth.uid();
  v_allowed := public.team_kanban_is_admin() OR public.team_kanban_is_leader(p_area_id)
    OR EXISTS (SELECT 1 FROM public.usuario_areas WHERE area_id=p_area_id AND user_id=v_me);
  IF NOT v_allowed THEN RAISE EXCEPTION 'No autorizado para esta area' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'isLeader', public.team_kanban_is_leader(p_area_id),
    'states', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.orden) FROM public.area_kanban_estados s WHERE s.area_id=p_area_id AND s.activo),'[]'::jsonb),
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'nombre',u.nombre) ORDER BY u.nombre)
      FROM public.usuario_areas ua JOIN public.usuarios u ON u.id=ua.user_id
      WHERE ua.area_id=p_area_id AND u.activo AND (
        public.team_kanban_is_admin() OR u.id=v_me OR u.manager_user_id=v_me
        OR (u.id=(SELECT manager_user_id FROM public.usuarios WHERE id=v_me)
            AND EXISTS(SELECT 1 FROM public.area_lideres al WHERE al.area_id=p_area_id AND al.user_id=u.id))
      )),'[]'::jsonb),
    'actions', COALESCE((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('asignado_nombre',u.nombre) ORDER BY a.created_at DESC)
      FROM public.acciones_equipo a JOIN public.usuarios u ON u.id=a.asignado_a
      WHERE a.area_id=p_area_id AND (public.team_kanban_is_admin() OR a.lider_id=v_me OR a.asignado_a=v_me OR a.creado_por=v_me)),'[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.team_kanban_create_action(p_area_id uuid, p_title text, p_description text, p_assignee uuid, p_priority text, p_due_at timestamptz, p_evidence boolean, p_checklist jsonb DEFAULT '[]'::jsonb, p_evidence_text text DEFAULT NULL, p_story_points integer DEFAULT 0, p_tipo_accion text DEFAULT 'operativa', p_gap_ids uuid[] DEFAULT ARRAY[]::uuid[], p_catalog_kpi_ids uuid[] DEFAULT ARRAY[]::uuid[])
RETURNS public.acciones_equipo LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_me uuid; v_state uuid; v_row public.acciones_equipo; v_leader uuid;
BEGIN
  SELECT id INTO v_me FROM public.usuarios WHERE user_id=auth.uid();
  IF v_me IS NULL THEN RAISE EXCEPTION 'Perfil no encontrado' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuario_areas WHERE area_id=p_area_id AND user_id=p_assignee)
    AND NOT EXISTS (SELECT 1 FROM public.area_lideres WHERE area_id=p_area_id AND user_id=p_assignee)
  THEN RAISE EXCEPTION 'El responsable no pertenece al area' USING ERRCODE='22023'; END IF;
  IF public.team_kanban_is_leader(p_area_id) THEN
    v_leader := v_me;
    IF NOT public.team_kanban_is_admin() AND NOT EXISTS (
      SELECT 1 FROM public.usuarios u WHERE u.id=p_assignee AND (u.id=v_me OR u.manager_user_id=v_me)
    ) THEN RAISE EXCEPTION 'Solo puedes asignar a integrantes de tu equipo directo' USING ERRCODE='42501'; END IF;
  ELSE
    SELECT manager_user_id INTO v_leader FROM public.usuarios WHERE id=v_me;
    IF v_leader IS NULL OR NOT EXISTS (SELECT 1 FROM public.area_lideres WHERE area_id=p_area_id AND user_id=v_leader) THEN
      RAISE EXCEPTION 'No tienes un lider asignado para esta area' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NOT public.team_kanban_is_leader(p_area_id) AND NOT public.team_kanban_is_admin()
    AND p_assignee <> v_me
    AND p_assignee IS DISTINCT FROM (SELECT manager_user_id FROM public.usuarios WHERE id=v_me)
  THEN
    RAISE EXCEPTION 'Solo puedes asignar acciones a ti mismo o a tu lider' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_state FROM public.area_kanban_estados WHERE area_id=p_area_id AND activo ORDER BY orden LIMIT 1;
  INSERT INTO public.acciones_equipo(area_id,estado_id,titulo,descripcion,asignado_a,lider_id,creado_por,prioridad,fecha_limite,evidencia_requerida,evidencia_esperada,checklist,story_points,tipo_accion,gap_ids,catalog_kpi_ids)
  VALUES(p_area_id,v_state,trim(p_title),nullif(trim(p_description),''),p_assignee,v_leader,v_me,p_priority,p_due_at,p_evidence,nullif(trim(p_evidence_text),''),coalesce(p_checklist,'[]'),coalesce(p_story_points,0),coalesce(p_tipo_accion,'operativa'),coalesce(p_gap_ids,ARRAY[]::uuid[]),coalesce(p_catalog_kpi_ids,ARRAY[]::uuid[])) RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.team_kanban_update_action(p_action_id uuid, p_state_id uuid DEFAULT NULL, p_assignee uuid DEFAULT NULL, p_priority text DEFAULT NULL, p_blocked boolean DEFAULT NULL)
RETURNS public.acciones_equipo LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.acciones_equipo; v_me uuid; v_final boolean;
BEGIN
  SELECT * INTO v_row FROM public.acciones_equipo WHERE id=p_action_id;
  SELECT id INTO v_me FROM public.usuarios WHERE user_id=auth.uid();
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Accion no encontrada' USING ERRCODE='P0002'; END IF;
  IF NOT public.team_kanban_is_admin() AND v_row.lider_id<>v_me AND v_row.asignado_a<>v_me THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
  IF (p_assignee IS NOT NULL OR p_priority IS NOT NULL) AND NOT public.team_kanban_is_admin() AND v_row.lider_id<>v_me THEN RAISE EXCEPTION 'Solo el lider del equipo puede reasignar o cambiar prioridad' USING ERRCODE='42501'; END IF;
  IF p_assignee IS NOT NULL AND NOT public.team_kanban_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.usuario_areas ua JOIN public.usuarios u ON u.id=ua.user_id
    WHERE ua.area_id=v_row.area_id AND u.id=p_assignee AND (u.manager_user_id=v_me OR u.id=v_me)
  ) THEN RAISE EXCEPTION 'El responsable no pertenece a tu equipo en esta area' USING ERRCODE='42501'; END IF;
  IF p_state_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.area_kanban_estados WHERE id=p_state_id AND area_id=v_row.area_id) THEN RAISE EXCEPTION 'Estado invalido' USING ERRCODE='22023'; END IF;
  SELECT es_final INTO v_final FROM public.area_kanban_estados WHERE id=coalesce(p_state_id,v_row.estado_id);
  UPDATE public.acciones_equipo SET estado_id=coalesce(p_state_id,estado_id), asignado_a=coalesce(p_assignee,asignado_a), prioridad=coalesce(p_priority,prioridad), bloqueada=coalesce(p_blocked,bloqueada), completed_at=CASE WHEN v_final THEN coalesce(completed_at,now()) ELSE NULL END, updated_at=now() WHERE id=p_action_id RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.team_kanban_escalate(p_action_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_action public.acciones_equipo; v_me uuid; v_corp uuid; v_area text; v_priority prioridad_nc;
BEGIN
  SELECT * INTO v_action FROM public.acciones_equipo WHERE id=p_action_id FOR UPDATE;
  SELECT id INTO v_me FROM public.usuarios WHERE user_id=auth.uid();
  IF v_action.id IS NULL OR (v_action.lider_id<>v_me AND NOT public.team_kanban_is_admin()) THEN RAISE EXCEPTION 'Solo el lider propietario de la accion puede escalar' USING ERRCODE='42501'; END IF;
  IF v_action.escalada THEN RETURN v_action.accion_corporativa_id; END IF;
  SELECT nombre INTO v_area FROM public.areas WHERE id=v_action.area_id;
  v_priority := CASE v_action.prioridad WHEN 'Critica' THEN 'P1_Critica'::prioridad_nc WHEN 'Alta' THEN 'P1_Critica'::prioridad_nc WHEN 'Baja' THEN 'P3_Baja'::prioridad_nc ELSE 'P2_Media'::prioridad_nc END;
  INSERT INTO public.acciones_diarias(fecha,titulo_accion,descripcion_accion,responsable,hora_limite,evidencia_esperada,estado,area,prioridad,escalado,fecha_escalamiento,notas_escalamiento,created_by,updated_by)
  VALUES(current_date,left(v_action.titulo,70),coalesce(nullif(v_action.descripcion,''),v_action.titulo),v_action.asignado_a,coalesce(v_action.fecha_limite::time,'18:00'),CASE WHEN v_action.evidencia_requerida THEN 'Evidencia solicitada por el lider' ELSE 'Confirmacion de cierre' END,'Pendiente',v_area,v_priority,true,now(),p_reason,v_me,v_me) RETURNING id INTO v_corp;
  UPDATE public.acciones_equipo SET escalada=true,accion_corporativa_id=v_corp,updated_at=now() WHERE id=p_action_id;
  INSERT INTO public.escalamiento_historial(accion_equipo_id,accion_corporativa_id,area_origen_id,escalado_por,motivo,prioridad) VALUES(p_action_id,v_corp,v_action.area_id,v_me,trim(p_reason),v_action.prioridad);
  RETURN v_corp;
END; $$;

REVOKE ALL ON FUNCTION public.team_kanban_my_areas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_kanban_my_leadership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_kanban_set_my_leadership(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_kanban_is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_kanban_is_leader(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_kanban_board(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_kanban_create_action(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_kanban_update_action(uuid,uuid,uuid,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.team_kanban_escalate(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_kanban_my_areas(), public.team_kanban_my_leadership(), public.team_kanban_set_my_leadership(uuid[]), public.team_kanban_board(uuid), public.team_kanban_create_action(uuid,text,text,uuid,text,timestamptz,boolean,jsonb,text,integer,text,uuid[],uuid[]), public.team_kanban_update_action(uuid,uuid,uuid,text,boolean), public.team_kanban_escalate(uuid,text) TO authenticated;

COMMENT ON TABLE public.acciones_equipo IS 'Acciones privadas por area para Kanban por Equipos.';
COMMENT ON TABLE public.escalamiento_historial IS 'Auditoria inmutable de escalamiento desde equipos al Kanban Corporativo.';
