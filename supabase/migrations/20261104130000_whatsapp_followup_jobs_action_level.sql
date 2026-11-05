-- Followups automáticos a nivel acción (bidireccional.md): checkpoint_id null + target_type=action.

ALTER TABLE public.whatsapp_followup_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_followup_jobs_target_chk;

ALTER TABLE public.whatsapp_followup_jobs
  ADD CONSTRAINT whatsapp_followup_jobs_target_chk CHECK (
    (
      scope = 'corporate'
      AND accion_id IS NOT NULL
      AND (
        checkpoint_id IS NOT NULL
        OR (
          checkpoint_id IS NULL
          AND coalesce(payload->>'target_type', '') = 'action'
        )
      )
    )
    OR (
      scope = 'team'
      AND team_action_id IS NOT NULL
      AND checklist_index IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT whatsapp_followup_jobs_target_chk ON public.whatsapp_followup_jobs IS
  'Corporate: checkpoint legacy O action-level (checkpoint_id null + payload.target_type=action). Team: team_action + checklist_index.';
