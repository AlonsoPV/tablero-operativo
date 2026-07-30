ALTER TABLE public.acciones_equipo
  DROP CONSTRAINT IF EXISTS acciones_equipo_prioridad_check;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'acciones_equipo_prioridad_not_empty'
  ) THEN
    ALTER TABLE public.acciones_equipo
      ADD CONSTRAINT acciones_equipo_prioridad_not_empty
      CHECK (char_length(trim(prioridad)) > 0);
  END IF;
END
$do$;

CREATE TABLE IF NOT EXISTS public.equipo_accion_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accion_id uuid NOT NULL REFERENCES public.acciones_equipo(id) ON DELETE CASCADE,
  contenido text NOT NULL CHECK (char_length(trim(contenido)) > 0),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_by_nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipo_accion_comentarios_accion_id
  ON public.equipo_accion_comentarios(accion_id);

CREATE INDEX IF NOT EXISTS idx_equipo_accion_comentarios_created_at
  ON public.equipo_accion_comentarios(created_at);

ALTER TABLE public.equipo_accion_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipo_accion_comentarios_select_authenticated
  ON public.equipo_accion_comentarios;
CREATE POLICY equipo_accion_comentarios_select_authenticated
ON public.equipo_accion_comentarios
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.acciones_equipo a
    WHERE a.id = equipo_accion_comentarios.accion_id
      AND public.team_kanban_current_user_can_use_area(a.area_id)
  )
);

DROP POLICY IF EXISTS equipo_accion_comentarios_insert_authenticated
  ON public.equipo_accion_comentarios;
CREATE POLICY equipo_accion_comentarios_insert_authenticated
ON public.equipo_accion_comentarios
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.acciones_equipo a
    WHERE a.id = equipo_accion_comentarios.accion_id
      AND public.team_kanban_current_user_can_use_area(a.area_id)
  )
  AND (
    created_by IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = created_by
        AND u.user_id = (SELECT auth.uid())
    )
  )
);

REVOKE ALL ON TABLE public.equipo_accion_comentarios FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.equipo_accion_comentarios TO authenticated;

NOTIFY pgrst, 'reload schema';
