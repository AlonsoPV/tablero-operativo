-- =============================================================================
-- PROD — Borrado operativo (IRREVERSIBLE)
-- Proyecto: xhpasmjzuwifmjhrsumb (Scrumban PROD)
--
-- PASO 1: Ejecuta solo el bloque «VERIFICAR» (conteos actuales).
-- PASO 2: Ejecuta el bloque «BORRAR» completo (sin ROLLBACK).
-- PASO 3: Ejecuta de nuevo «VERIFICAR» — todo debe quedar en 0.
-- PASO 4: En el navegador, recarga fuerte (Ctrl+Shift+R) el tablero.
-- =============================================================================

-- ── VERIFICAR (ejecutar antes y después) ─────────────────────────────────────
SELECT 'conteos' AS fase,
  (SELECT count(*) FROM public.acciones_diarias) AS acciones,
  (SELECT count(*) FROM public.calendar_notes) AS minutas,
  (SELECT count(*) FROM public.calendar_reminders) AS recordatorios,
  (SELECT count(*) FROM public.academy_progress) AS academy_progress,
  (SELECT count(*) FROM public.accion_comentarios) AS comentarios,
  (SELECT count(*) FROM public.accion_checkpoints) AS checkpoints,
  (SELECT count(*) FROM public.accion_evidencias) AS evidencias_meta;

-- =============================================================================
-- BORRAR — Ejecuta desde aquí hasta el final (IRREVERSIBLE)
-- El SQL Editor de Supabase NO aplica bien BEGIN/ROLLBACK; cada TRUNCATE confirma al instante.
-- =============================================================================

TRUNCATE TABLE
  public.calendar_notes,
  public.calendar_reminders,
  public.academy_progress
RESTART IDENTITY;

DELETE FROM public.external_inbound_messages
WHERE accion_id IS NOT NULL;

TRUNCATE TABLE public.acciones_diarias RESTART IDENTITY CASCADE;

-- Verificación inmediata tras borrar
SELECT 'tras_borrar' AS fase,
  (SELECT count(*) FROM public.acciones_diarias) AS acciones,
  (SELECT count(*) FROM public.calendar_notes) AS minutas,
  (SELECT count(*) FROM public.calendar_reminders) AS recordatorios,
  (SELECT count(*) FROM public.academy_progress) AS academy_progress;

-- OPCIONAL: archivos en Storage
-- DELETE FROM storage.objects WHERE bucket_id = 'evidencias';
