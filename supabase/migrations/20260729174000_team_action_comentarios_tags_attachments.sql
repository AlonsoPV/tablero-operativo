-- Comentarios de acciones de equipo: tabla base (si falta) + etiquetas y adjuntos.

CREATE TABLE IF NOT EXISTS public.equipo_accion_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accion_id uuid NOT NULL REFERENCES public.acciones_equipo(id) ON DELETE CASCADE,
  contenido text NOT NULL CHECK (char_length(trim(contenido)) > 0),
  created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_by_nombre text,
  asignado uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  etiquetas text[] NOT NULL DEFAULT '{}'::text[],
  adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.equipo_accion_comentarios
  ADD COLUMN IF NOT EXISTS asignado uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS etiquetas text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.equipo_accion_comentarios.asignado IS
  'Primer usuario etiquetado (compatibilidad); preferir etiquetas.';
COMMENT ON COLUMN public.equipo_accion_comentarios.etiquetas IS
  'IDs de usuarios etiquetados en el comentario.';
COMMENT ON COLUMN public.equipo_accion_comentarios.adjuntos IS
  'Array JSON de { storage_path, file_name } para archivos adjuntos.';

CREATE INDEX IF NOT EXISTS idx_equipo_accion_comentarios_accion_id
  ON public.equipo_accion_comentarios(accion_id);

CREATE INDEX IF NOT EXISTS idx_equipo_accion_comentarios_created_at
  ON public.equipo_accion_comentarios(created_at);

CREATE INDEX IF NOT EXISTS idx_equipo_accion_comentarios_asignado
  ON public.equipo_accion_comentarios(asignado)
  WHERE asignado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipo_accion_comentarios_etiquetas_gin
  ON public.equipo_accion_comentarios
  USING gin (etiquetas);

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

DROP POLICY IF EXISTS equipo_accion_comentarios_update_authenticated
  ON public.equipo_accion_comentarios;
CREATE POLICY equipo_accion_comentarios_update_authenticated
ON public.equipo_accion_comentarios
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.acciones_equipo a
    WHERE a.id = equipo_accion_comentarios.accion_id
      AND public.team_kanban_current_user_can_use_area(a.area_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.acciones_equipo a
    WHERE a.id = equipo_accion_comentarios.accion_id
      AND public.team_kanban_current_user_can_use_area(a.area_id)
  )
);

DROP POLICY IF EXISTS equipo_accion_comentarios_delete_authenticated
  ON public.equipo_accion_comentarios;
CREATE POLICY equipo_accion_comentarios_delete_authenticated
ON public.equipo_accion_comentarios
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.acciones_equipo a
    WHERE a.id = equipo_accion_comentarios.accion_id
      AND public.team_kanban_current_user_can_use_area(a.area_id)
  )
);

REVOKE ALL ON TABLE public.equipo_accion_comentarios FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.equipo_accion_comentarios TO authenticated;

NOTIFY pgrst, 'reload schema';
