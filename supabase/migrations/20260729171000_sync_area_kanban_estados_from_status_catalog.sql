-- Al desactivar un estatus en catálogo (statuses), reflejarlo en columnas del Kanban por Equipos
-- (area_kanban_estados) cuando el nombre/alias coincide.

CREATE OR REPLACE FUNCTION public.area_kanban_state_alias(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT regexp_replace(lower(trim(coalesce(p_name, ''))), '[^a-z0-9]+', '', 'g') AS v
  )
  SELECT CASE (SELECT v FROM normalized)
    WHEN 'enejecucion' THEN 'enproceso'
    WHEN 'enproceso' THEN 'enproceso'
    WHEN 'hecho' THEN 'terminado'
    WHEN 'realizadas' THEN 'terminado'
    WHEN 'verificado' THEN 'validacion'
    WHEN 'validacion' THEN 'validacion'
    WHEN 'terminado' THEN 'terminado'
    ELSE (SELECT v FROM normalized)
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_area_kanban_estados_from_status_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alias text;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.activo IS NOT DISTINCT FROM OLD.activo THEN
    RETURN NEW;
  END IF;

  v_alias := public.area_kanban_state_alias(NEW.nombre);

  UPDATE public.area_kanban_estados s
  SET activo = NEW.activo
  WHERE public.area_kanban_state_alias(s.nombre) = v_alias;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_area_kanban_estados_from_status ON public.statuses;

CREATE TRIGGER trg_sync_area_kanban_estados_from_status
  AFTER UPDATE OF activo ON public.statuses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_area_kanban_estados_from_status_catalog();

-- Alinear estados ya desactivados en catálogo con columnas de equipos.
UPDATE public.area_kanban_estados s
SET activo = st.activo
FROM public.statuses st
WHERE public.area_kanban_state_alias(s.nombre) = public.area_kanban_state_alias(st.nombre)
  AND s.activo IS DISTINCT FROM st.activo;
