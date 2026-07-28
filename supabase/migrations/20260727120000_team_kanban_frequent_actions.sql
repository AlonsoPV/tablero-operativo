-- Asegura columnas de evidencia por si la tabla nació sin ellas (CREATE TABLE IF NOT EXISTS).
ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS evidencia_requerida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidencia_esperada text;

ALTER TABLE public.acciones_equipo
  ADD COLUMN IF NOT EXISTS es_frecuente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frecuencia_tipo text,
  ADD COLUMN IF NOT EXISTS frecuencia_dia_semana smallint,
  ADD COLUMN IF NOT EXISTS frecuencia_dia_mes smallint,
  ADD COLUMN IF NOT EXISTS frecuencia_inicio date,
  ADD COLUMN IF NOT EXISTS frecuencia_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acciones_equipo_frecuencia_tipo_check'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_frecuencia_tipo_check
      CHECK (frecuencia_tipo IS NULL OR frecuencia_tipo IN ('diaria', 'semanal', 'quincenal', 'mensual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acciones_equipo_frecuencia_dia_semana_check'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_frecuencia_dia_semana_check
      CHECK (frecuencia_dia_semana IS NULL OR frecuencia_dia_semana BETWEEN 1 AND 7);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acciones_equipo_frecuencia_dia_mes_check'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_frecuencia_dia_mes_check
      CHECK (frecuencia_dia_mes IS NULL OR frecuencia_dia_mes BETWEEN 1 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acciones_equipo_frecuencia_completa_check'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_frecuencia_completa_check
      CHECK (
        es_frecuente = false
        OR (
          frecuencia_tipo IS NOT NULL
          AND (frecuencia_tipo <> 'semanal' OR frecuencia_dia_semana IS NOT NULL)
          AND (frecuencia_tipo NOT IN ('quincenal', 'mensual') OR frecuencia_dia_mes IS NOT NULL)
        )
      );
  END IF;
END
$do$;

CREATE INDEX IF NOT EXISTS idx_acciones_equipo_frecuencia
  ON public.acciones_equipo(area_id, es_frecuente, frecuencia_tipo)
  WHERE es_frecuente = true;

DROP FUNCTION IF EXISTS public.team_kanban_create_action(
  uuid,
  text,
  text,
  uuid,
  text,
  timestamptz,
  boolean,
  jsonb,
  text,
  integer,
  text,
  uuid[],
  uuid[]
);

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
  p_catalog_kpi_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_es_frecuente boolean DEFAULT false,
  p_frecuencia_tipo text DEFAULT NULL,
  p_frecuencia_dia_semana smallint DEFAULT NULL,
  p_frecuencia_dia_mes smallint DEFAULT NULL,
  p_frecuencia_inicio date DEFAULT NULL
)
RETURNS public.acciones_equipo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
  v_state uuid;
  v_row public.acciones_equipo;
  v_frecuencia_tipo text;
  v_frecuencia_dia_semana smallint;
  v_frecuencia_dia_mes smallint;
BEGIN
  PERFORM public.team_kanban_assert_super_admin();

  SELECT id
  INTO v_me
  FROM public.usuarios
  WHERE user_id = (SELECT auth.uid())
    AND activo = true
  LIMIT 1;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.team_kanban_current_user_can_use_area(p_area_id) THEN
    RAISE EXCEPTION 'Solo puedes crear acciones en areas asignadas a tu perfil'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.team_kanban_assignee_belongs_to_area(p_area_id, p_assignee) THEN
    RAISE EXCEPTION 'El responsable no pertenece al area seleccionada'
      USING ERRCODE = '42501';
  END IF;

  v_frecuencia_tipo := NULLIF(trim(coalesce(p_frecuencia_tipo, '')), '');
  v_frecuencia_dia_semana := p_frecuencia_dia_semana;
  v_frecuencia_dia_mes := p_frecuencia_dia_mes;

  IF coalesce(p_es_frecuente, false) THEN
    IF v_frecuencia_tipo NOT IN ('diaria', 'semanal', 'quincenal', 'mensual') THEN
      RAISE EXCEPTION 'Frecuencia invalida'
        USING ERRCODE = '22023';
    END IF;

    IF v_frecuencia_tipo = 'semanal'
      AND (v_frecuencia_dia_semana IS NULL OR v_frecuencia_dia_semana NOT BETWEEN 1 AND 7) THEN
      RAISE EXCEPTION 'Dia de semana invalido para accion frecuente'
        USING ERRCODE = '22023';
    END IF;

    IF v_frecuencia_tipo IN ('quincenal', 'mensual')
      AND (v_frecuencia_dia_mes IS NULL OR v_frecuencia_dia_mes NOT BETWEEN 1 AND 31) THEN
      RAISE EXCEPTION 'Dia de referencia invalido para accion frecuente'
        USING ERRCODE = '22023';
    END IF;

    IF v_frecuencia_tipo <> 'semanal' THEN
      v_frecuencia_dia_semana := NULL;
    END IF;

    IF v_frecuencia_tipo NOT IN ('quincenal', 'mensual') THEN
      v_frecuencia_dia_mes := NULL;
    END IF;
  ELSE
    v_frecuencia_tipo := NULL;
    v_frecuencia_dia_semana := NULL;
    v_frecuencia_dia_mes := NULL;
  END IF;

  SELECT id
  INTO v_state
  FROM public.area_kanban_estados
  WHERE area_id = p_area_id
    AND activo
  ORDER BY orden
  LIMIT 1;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'El area no tiene estados activos'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.acciones_equipo(
    area_id,
    estado_id,
    titulo,
    descripcion,
    asignado_a,
    lider_id,
    creado_por,
    prioridad,
    fecha_limite,
    evidencia_requerida,
    evidencia_esperada,
    checklist,
    story_points,
    tipo_accion,
    gap_ids,
    catalog_kpi_ids,
    es_frecuente,
    frecuencia_tipo,
    frecuencia_dia_semana,
    frecuencia_dia_mes,
    frecuencia_inicio,
    frecuencia_config
  )
  VALUES (
    p_area_id,
    v_state,
    trim(p_title),
    nullif(trim(p_description), ''),
    p_assignee,
    v_me,
    v_me,
    p_priority,
    p_due_at,
    p_evidence,
    nullif(trim(coalesce(p_evidence_text, '')), ''),
    coalesce(p_checklist, '[]'::jsonb),
    coalesce(p_story_points, 0),
    coalesce(p_tipo_accion, 'operativa'),
    coalesce(p_gap_ids, ARRAY[]::uuid[]),
    coalesce(p_catalog_kpi_ids, ARRAY[]::uuid[]),
    coalesce(p_es_frecuente, false),
    v_frecuencia_tipo,
    v_frecuencia_dia_semana,
    v_frecuencia_dia_mes,
    CASE WHEN coalesce(p_es_frecuente, false) THEN coalesce(p_frecuencia_inicio, p_due_at::date, CURRENT_DATE) ELSE NULL END,
    CASE
      WHEN coalesce(p_es_frecuente, false) THEN jsonb_build_object(
        'captura_recomendada', 'El responsable debe registrar una actualizacion y cerrar los puntos de validacion en cada periodo.',
        'primer_vencimiento', p_due_at,
        'requiere_apoyo_documental', p_evidence
      )
      ELSE '{}'::jsonb
    END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.team_kanban_create_action(
  uuid,
  text,
  text,
  uuid,
  text,
  timestamptz,
  boolean,
  jsonb,
  text,
  integer,
  text,
  uuid[],
  uuid[],
  boolean,
  text,
  smallint,
  smallint,
  date
) TO authenticated;

COMMENT ON COLUMN public.acciones_equipo.es_frecuente IS
  'Marca acciones recurrentes del Kanban por Equipos.';
COMMENT ON COLUMN public.acciones_equipo.frecuencia_tipo IS
  'Frecuencia estable de la accion: diaria, semanal, quincenal o mensual.';
COMMENT ON COLUMN public.acciones_equipo.frecuencia_config IS
  'Metadatos operativos para orientar la captura periodica del responsable.';

NOTIFY pgrst, 'reload schema';
