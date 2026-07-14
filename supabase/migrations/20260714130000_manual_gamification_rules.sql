-- Catalogo editable mostrado en el Manual. La lectura es para cualquier usuario
-- autenticado y la escritura queda restringida a Super Admin y Direccion.

CREATE TABLE IF NOT EXISTS public.manual_gamification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity text NOT NULL UNIQUE CHECK (char_length(btrim(activity)) BETWEEN 3 AND 160),
  points integer NOT NULL CHECK (points BETWEEN -1000 AND 1000),
  sort_order integer NOT NULL UNIQUE CHECK (sort_order > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.manual_gamification_rules (sort_order, activity, points)
VALUES
  (1, 'Crear acción correctamente documentada', 3),
  (2, 'Agregar comentario de avance', 1),
  (3, 'Adjuntar evidencia', 2),
  (4, 'Completar checklist', 2),
  (5, 'Actualizar estatus oportunamente', 2),
  (6, 'Acción vencida', -8),
  (7, 'Acción escalada por falta de seguimiento', -10),
  (8, 'Reprogramación', -4),
  (9, 'Segunda reprogramación', -8),
  (10, 'Acción marcada como Realizada', 5),
  (11, 'Acción Verificada (Responsable)', 7),
  (12, 'Acción Verificada (Verificador)', 7),
  (13, 'Acción cerrada antes de la fecha compromiso', 10),
  (14, 'Acción roja cerrada en tiempo', 5),
  (15, 'Acción sin reprogramaciones', 2),
  (16, 'Día con actividad (racha)', 3),
  (17, 'Semana sin acciones vencidas', 15),
  (18, 'Mes con ICC ≥ 95%', 25),
  (19, 'Completar módulo Academia', 5),
  (20, 'Aprobar evaluación', 8),
  (21, 'Actualizar perfil organizacional (Organigrama)', 15)
ON CONFLICT (sort_order) DO UPDATE
SET activity = EXCLUDED.activity,
    points = EXCLUDED.points;

CREATE OR REPLACE FUNCTION public.can_edit_manual_gamification()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.is_super_admin()
      OR public.has_business_role('super_admin')
      OR public.has_business_role('Direccion')
    );
$$;

REVOKE ALL ON FUNCTION public.can_edit_manual_gamification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_manual_gamification() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_manual_gamification_rule_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.activity := btrim(NEW.activity);
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_manual_gamification_rule_audit
  ON public.manual_gamification_rules;
CREATE TRIGGER set_manual_gamification_rule_audit
BEFORE UPDATE ON public.manual_gamification_rules
FOR EACH ROW EXECUTE FUNCTION public.set_manual_gamification_rule_audit();

ALTER TABLE public.manual_gamification_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.manual_gamification_rules FROM anon, authenticated;
GRANT SELECT ON TABLE public.manual_gamification_rules TO authenticated;
GRANT UPDATE (activity, points) ON TABLE public.manual_gamification_rules TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read manual gamification rules"
  ON public.manual_gamification_rules;
CREATE POLICY "Authenticated users can read manual gamification rules"
ON public.manual_gamification_rules
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Super Admin and Direccion can update manual gamification rules"
  ON public.manual_gamification_rules;
CREATE POLICY "Super Admin and Direccion can update manual gamification rules"
ON public.manual_gamification_rules
FOR UPDATE
TO authenticated
USING ((SELECT public.can_edit_manual_gamification()))
WITH CHECK ((SELECT public.can_edit_manual_gamification()));

