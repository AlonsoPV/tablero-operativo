-- =============================================================================
-- SCRUMBAN — Limpieza Total del Dataset Sintético de Demostración Comercial Local
-- Exclusivo para Supabase Local (`scrumban-tc-local`).
-- =============================================================================

BEGIN;

DELETE FROM public.assistant_pending_ops;
DELETE FROM public.qa_outbox;
DELETE FROM public.notification_email_logs;
DELETE FROM public.whatsapp_messages;

DELETE FROM public.acciones_diarias
WHERE id IN (
  '22222222-2222-4333-8444-555555550001',
  '22222222-2222-4333-8444-555555550002',
  '22222222-2222-4333-8444-555555550003',
  '22222222-2222-4333-8444-555555550004',
  '22222222-2222-4333-8444-555555550005',
  '22222222-2222-4333-8444-555555550006',
  '22222222-2222-4333-8444-555555550007',
  '22222222-2222-4333-8444-555555550008'
)
OR titulo_accion ILIKE '%revisar este problema%'
OR titulo_accion ILIKE '%demo-rehearsal%'
OR titulo_accion LIKE 'tc-qa-%';

DELETE FROM public.okr_key_results WHERE okr_id = '11111111-2222-4333-8444-555555550001';
DELETE FROM public.okrs WHERE id = '11111111-2222-4333-8444-555555550001';
DELETE FROM public.agent_documents WHERE logical_id IN ('demo-comercial-acta-semanal', 'demo-comercial-politica-bloqueos');
DELETE FROM public.agent_memory WHERE source_ref IN ('demo-comercial-reunion-1', 'demo-comercial-reunion-2');

UPDATE public.agent_execution_gate SET enabled = false;

COMMIT;
