-- Retira los estados de columna "Bloqueado" y "En Proceso" del Kanban por Equipos.
-- Las acciones abiertas en esos estados pasan a "Pendiente" (o al primer estado activo restante).
-- El flag acciones_equipo.bloqueada se limpia; ya no se usa como estatus operativo.

DO $$
DECLARE
  v_area record;
  v_target uuid;
  v_retired uuid[];
BEGIN
  FOR v_area IN
    SELECT DISTINCT area_id
    FROM public.area_kanban_estados
    WHERE lower(trim(nombre)) IN ('bloqueado', 'en proceso')
  LOOP
    SELECT array_agg(id)
    INTO v_retired
    FROM public.area_kanban_estados
    WHERE area_id = v_area.area_id
      AND lower(trim(nombre)) IN ('bloqueado', 'en proceso');

    SELECT s.id
    INTO v_target
    FROM public.area_kanban_estados s
    WHERE s.area_id = v_area.area_id
      AND s.activo
      AND lower(trim(s.nombre)) = 'pendiente'
    ORDER BY s.orden
    LIMIT 1;

    IF v_target IS NULL THEN
      SELECT s.id
      INTO v_target
      FROM public.area_kanban_estados s
      WHERE s.area_id = v_area.area_id
        AND s.activo
        AND NOT (lower(trim(s.nombre)) IN ('bloqueado', 'en proceso'))
      ORDER BY s.es_final ASC, s.orden ASC
      LIMIT 1;
    END IF;

    IF v_target IS NULL THEN
      RAISE EXCEPTION
        'No hay estado destino para reasignar acciones del area % al retirar Bloqueado/En Proceso',
        v_area.area_id;
    END IF;

    UPDATE public.acciones_equipo ae
    SET
      estado_id = v_target,
      bloqueada = false,
      updated_at = now()
    WHERE ae.area_id = v_area.area_id
      AND ae.estado_id = ANY (v_retired);

    UPDATE public.area_kanban_estados
    SET activo = false
    WHERE area_id = v_area.area_id
      AND id = ANY (v_retired);
  END LOOP;

  -- Por si quedaron flags de bloqueo en otras columnas.
  UPDATE public.acciones_equipo
  SET bloqueada = false, updated_at = now()
  WHERE bloqueada = true;
END $$;

-- Reordena los estados activos restantes a un flujo corto.
UPDATE public.area_kanban_estados
SET orden = CASE lower(trim(nombre))
  WHEN 'pendiente' THEN 10
  WHEN 'validacion' THEN 20
  WHEN 'terminado' THEN 30
  ELSE orden
END
WHERE activo
  AND lower(trim(nombre)) IN ('pendiente', 'validacion', 'terminado');
