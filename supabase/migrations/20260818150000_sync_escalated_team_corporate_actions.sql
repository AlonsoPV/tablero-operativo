-- Mantiene alineadas las acciones escaladas entre Kanban por Equipos y Corporativo.
-- La marca transaccional evita recursión entre ambos triggers.

CREATE INDEX IF NOT EXISTS idx_acciones_equipo_accion_corporativa_id
  ON public.acciones_equipo (accion_corporativa_id)
  WHERE accion_corporativa_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.team_kanban_sync_action_to_corporate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_corporate_status public.action_status;
  v_priority_id uuid;
BEGIN
  IF current_setting('scrumban.linked_action_sync', true) = 'on'
    OR NOT NEW.escalada
    OR NEW.accion_corporativa_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT s.estado_key::public.action_status
  INTO v_corporate_status
  FROM public.statuses s
  WHERE s.id = NEW.estado_id
  LIMIT 1;

  IF v_corporate_status IS NULL THEN
    RAISE EXCEPTION 'El estatus de la accion de equipo no tiene equivalencia corporativa.'
      USING ERRCODE = '23514';
  END IF;

  SELECT p.id
  INTO v_priority_id
  FROM public.priorities p
  WHERE lower(btrim(p.nombre)) = lower(btrim(NEW.prioridad))
  ORDER BY p.activo DESC, p.orden
  LIMIT 1;

  SELECT u.id
  INTO v_actor_id
  FROM public.usuarios u
  WHERE u.user_id = (SELECT auth.uid())
    AND u.activo = true
  LIMIT 1;

  PERFORM set_config('scrumban.linked_action_sync', 'on', true);

  UPDATE public.acciones_diarias corporate
  SET titulo_accion = left(NEW.titulo, 70),
      descripcion_accion = coalesce(nullif(btrim(NEW.descripcion), ''), NEW.titulo),
      responsable = NEW.asignado_a,
      prioridad = NEW.prioridad,
      prioridad_id = v_priority_id,
      fecha = coalesce(
        (NEW.fecha_limite AT TIME ZONE 'America/Mexico_City')::date,
        corporate.fecha
      ),
      hora_limite = coalesce(
        (NEW.fecha_limite AT TIME ZONE 'America/Mexico_City')::time,
        corporate.hora_limite
      ),
      estado = v_corporate_status,
      evidencia_esperada = CASE
        WHEN NEW.evidencia_requerida THEN
          coalesce(nullif(btrim(NEW.evidencia_esperada), ''), 'Evidencia requerida')
        ELSE
          coalesce(nullif(btrim(NEW.evidencia_esperada), ''), 'Confirmacion de cierre')
      END,
      story_points = NEW.story_points,
      tipo_accion = NEW.tipo_accion,
      completed_at = CASE
        WHEN v_corporate_status IN ('Hecho'::public.action_status, 'Verificado'::public.action_status)
          THEN coalesce(NEW.completed_at, corporate.completed_at, now())
        ELSE NULL
      END,
      completed_by = CASE
        WHEN v_corporate_status IN ('Hecho'::public.action_status, 'Verificado'::public.action_status)
          THEN coalesce(corporate.completed_by, v_actor_id)
        ELSE NULL
      END,
      verified_at = CASE
        WHEN v_corporate_status = 'Verificado'::public.action_status
          THEN coalesce(corporate.verified_at, now())
        ELSE NULL
      END,
      verified_by = CASE
        WHEN v_corporate_status = 'Verificado'::public.action_status
          THEN coalesce(corporate.verified_by, v_actor_id)
        ELSE NULL
      END,
      updated_by = coalesce(v_actor_id, corporate.updated_by)
  WHERE corporate.id = NEW.accion_corporativa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro la accion corporativa vinculada.'
      USING ERRCODE = '23503';
  END IF;

  PERFORM set_config('scrumban.linked_action_sync', 'off', true);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('scrumban.linked_action_sync', 'off', true);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_kanban_sync_corporate_to_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_id uuid;
  v_is_final boolean;
BEGIN
  IF current_setting('scrumban.linked_action_sync', true) = 'on'
    OR NOT EXISTS (
      SELECT 1
      FROM public.acciones_equipo team_action
      WHERE team_action.accion_corporativa_id = NEW.id
        AND team_action.escalada = true
    )
  THEN
    RETURN NEW;
  END IF;

  SELECT s.id, s.es_cierre
  INTO v_state_id, v_is_final
  FROM public.statuses s
  WHERE s.estado_key = NEW.estado::text
  ORDER BY s.activo DESC, s.orden
  LIMIT 1;

  IF v_state_id IS NULL THEN
    RAISE EXCEPTION 'El estatus corporativo no tiene equivalencia en Kanban por Equipos.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('scrumban.linked_action_sync', 'on', true);

  UPDATE public.acciones_equipo team_action
  SET titulo = NEW.titulo_accion,
      descripcion = NEW.descripcion_accion,
      asignado_a = NEW.responsable,
      prioridad = NEW.prioridad,
      fecha_limite = (NEW.fecha + NEW.hora_limite) AT TIME ZONE 'America/Mexico_City',
      estado_id = v_state_id,
      evidencia_esperada = NEW.evidencia_esperada,
      evidencia_requerida = public.accion_requires_evidencia_text(NEW.evidencia_esperada),
      story_points = round(coalesce(NEW.story_points, 0))::integer,
      tipo_accion = NEW.tipo_accion,
      completed_at = CASE
        WHEN coalesce(v_is_final, false)
          THEN coalesce(NEW.completed_at, team_action.completed_at, now())
        ELSE NULL
      END,
      updated_at = now()
  WHERE team_action.accion_corporativa_id = NEW.id
    AND team_action.escalada = true;

  PERFORM set_config('scrumban.linked_action_sync', 'off', true);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('scrumban.linked_action_sync', 'off', true);
    RAISE;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_kanban_sync_action_to_corporate
  ON public.acciones_equipo;
CREATE TRIGGER trg_team_kanban_sync_action_to_corporate
AFTER UPDATE ON public.acciones_equipo
FOR EACH ROW
EXECUTE FUNCTION public.team_kanban_sync_action_to_corporate();

DROP TRIGGER IF EXISTS trg_team_kanban_sync_corporate_to_action
  ON public.acciones_diarias;
CREATE TRIGGER trg_team_kanban_sync_corporate_to_action
AFTER UPDATE ON public.acciones_diarias
FOR EACH ROW
EXECUTE FUNCTION public.team_kanban_sync_corporate_to_action();

REVOKE ALL ON FUNCTION public.team_kanban_sync_action_to_corporate()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_kanban_sync_corporate_to_action()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.team_kanban_sync_action_to_corporate() IS
  'Sincroniza campos equivalentes de una accion escalada hacia Kanban Corporativo.';
COMMENT ON FUNCTION public.team_kanban_sync_corporate_to_action() IS
  'Sincroniza campos equivalentes de Kanban Corporativo hacia su accion de equipo.';
