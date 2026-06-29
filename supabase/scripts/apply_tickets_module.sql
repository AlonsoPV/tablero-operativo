-- Diagnostico: ejecuta esto en el SQL Editor del MISMO proyecto que usa la app.
-- Si has_usuarios = false, este no es el proyecto migrado o falta el esquema base.

SELECT
  to_regclass('public.usuarios') IS NOT NULL AS has_usuarios,
  to_regclass('public.support_tickets') IS NOT NULL AS has_support_tickets,
  to_regclass('public.support_ticket_comments') IS NOT NULL AS has_support_ticket_comments,
  to_regprocedure('public.support_ticket_comment_counts(uuid[])') IS NOT NULL AS has_comment_counts_rpc;

-- Orden recomendado si faltan objetos:
--   1. supabase db push   (desde la raiz del repo, contra el proyecto correcto)
--   2. O manualmente:
--        20260313120000_initial_schema.sql  (si no hay usuarios)
--        20260604120000_tickets_support.sql (si no hay tickets)
--        20260630210000_support_tickets_optimizations.sql (RPC + RLS)
