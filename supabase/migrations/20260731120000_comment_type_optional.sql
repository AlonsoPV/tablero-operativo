DO $$
BEGIN
  IF to_regclass('public.accion_comentarios') IS NOT NULL THEN
    ALTER TABLE public.accion_comentarios
      ADD COLUMN IF NOT EXISTS tipo_comentario text;

    COMMENT ON COLUMN public.accion_comentarios.tipo_comentario IS
      'Tipo opcional del comentario para clasificar el seguimiento. No condiciona puntos de gamificacion.';

    CREATE INDEX IF NOT EXISTS idx_accion_comentarios_tipo_comentario
      ON public.accion_comentarios(tipo_comentario)
      WHERE tipo_comentario IS NOT NULL;
  END IF;

  IF to_regclass('public.equipo_accion_comentarios') IS NOT NULL THEN
    ALTER TABLE public.equipo_accion_comentarios
      ADD COLUMN IF NOT EXISTS tipo_comentario text;

    COMMENT ON COLUMN public.equipo_accion_comentarios.tipo_comentario IS
      'Tipo opcional del comentario para clasificar el seguimiento. No condiciona puntos de gamificacion.';

    CREATE INDEX IF NOT EXISTS idx_equipo_accion_comentarios_tipo_comentario
      ON public.equipo_accion_comentarios(tipo_comentario)
      WHERE tipo_comentario IS NOT NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
