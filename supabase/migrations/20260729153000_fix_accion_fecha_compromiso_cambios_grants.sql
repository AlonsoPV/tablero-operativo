CREATE TABLE IF NOT EXISTS public.accion_fecha_compromiso_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen text NOT NULL CHECK (origen IN ('kanban', 'team_kanban')),
  accion_id uuid NOT NULL,
  accion_titulo text NOT NULL,
  motivo_key text NOT NULL CHECK (
    motivo_key IN (
      'planeacion_trabajo',
      'dependencias',
      'recursos_capacidad',
      'cambios_compromiso'
    )
  ),
  motivo_label text NOT NULL,
  fecha_anterior date NOT NULL,
  fecha_nueva date NOT NULL,
  changed_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  changed_by_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_anterior IS DISTINCT FROM fecha_nueva)
);

CREATE INDEX IF NOT EXISTS idx_accion_fecha_compromiso_cambios_created_at
  ON public.accion_fecha_compromiso_cambios(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accion_fecha_compromiso_cambios_accion
  ON public.accion_fecha_compromiso_cambios(origen, accion_id);

ALTER TABLE public.accion_fecha_compromiso_cambios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accion_fecha_compromiso_cambios_select_authenticated
  ON public.accion_fecha_compromiso_cambios;
CREATE POLICY accion_fecha_compromiso_cambios_select_authenticated
ON public.accion_fecha_compromiso_cambios
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS accion_fecha_compromiso_cambios_insert_authenticated
  ON public.accion_fecha_compromiso_cambios;
CREATE POLICY accion_fecha_compromiso_cambios_insert_authenticated
ON public.accion_fecha_compromiso_cambios
FOR INSERT
TO authenticated
WITH CHECK (
  changed_by IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = changed_by
      AND u.user_id = (SELECT auth.uid())
  )
);

REVOKE ALL ON TABLE public.accion_fecha_compromiso_cambios FROM PUBLIC, anon;

GRANT SELECT, INSERT ON TABLE public.accion_fecha_compromiso_cambios TO authenticated;

NOTIFY pgrst, 'reload schema';
