-- Optimizaciones de tickets (requiere esquema base ya aplicado).
--
-- Prerequisitos en Supabase:
--   1. Migraciones base del repo (incluye public.usuarios)
--   2. 20260604120000_tickets_support.sql
--
-- En local/remoto: supabase db push
-- No ejecutes solo este archivo en un proyecto vacio.

DO $guard$
BEGIN
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION
      'Falta public.usuarios. Aplica las migraciones base del proyecto (supabase db push o desde 20260313120000_initial_schema.sql).';
  END IF;

  IF to_regclass('public.support_tickets') IS NULL
     OR to_regclass('public.support_ticket_comments') IS NULL THEN
    RAISE EXCEPTION
      'Faltan tablas de tickets. Ejecuta primero supabase/migrations/20260604120000_tickets_support.sql.';
  END IF;

  IF to_regprocedure('public.can_manage_support_tickets()') IS NULL THEN
    RAISE EXCEPTION
      'Falta can_manage_support_tickets(). Ejecuta 20260604120000_tickets_support.sql.';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.support_ticket_comment_counts(p_ticket_ids uuid[])
RETURNS TABLE(ticket_id uuid, comment_count integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.ticket_id, COUNT(*)::integer AS comment_count
  FROM public.support_ticket_comments c
  WHERE c.ticket_id = ANY(p_ticket_ids)
  GROUP BY c.ticket_id;
$$;

GRANT EXECUTE ON FUNCTION public.support_ticket_comment_counts(uuid[]) TO authenticated;

DROP POLICY IF EXISTS support_ticket_comments_insert_visible_ticket ON public.support_ticket_comments;

CREATE POLICY support_ticket_comments_insert_visible_ticket ON public.support_ticket_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = public.get_my_usuario_id()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = support_ticket_comments.ticket_id
        AND (t.created_by = public.get_my_usuario_id() OR public.can_manage_support_tickets())
    )
  );
