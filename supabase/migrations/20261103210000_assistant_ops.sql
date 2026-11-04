-- Copiloto IA: operaciones pendientes (confirmación humana) y auditoría.

CREATE TABLE IF NOT EXISTS public.assistant_pending_ops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tool text NOT NULL,
  resource_id uuid,
  expected_updated_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'confirmed', 'cancelled', 'expired', 'conflict')),
  expires_at timestamptz NOT NULL,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_assistant_pending_ops_usuario_status
  ON public.assistant_pending_ops (usuario_id, status, created_at DESC);

COMMENT ON TABLE public.assistant_pending_ops IS
  'Propuestas de escritura del copiloto IA. Solo se ejecutan tras confirmacion explicita del usuario dueño.';

ALTER TABLE public.assistant_pending_ops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_pending_ops_select_own ON public.assistant_pending_ops;
CREATE POLICY assistant_pending_ops_select_own
  ON public.assistant_pending_ops
  FOR SELECT
  TO authenticated
  USING (usuario_id = public.get_my_usuario_id());

DROP POLICY IF EXISTS assistant_pending_ops_insert_own ON public.assistant_pending_ops;
CREATE POLICY assistant_pending_ops_insert_own
  ON public.assistant_pending_ops
  FOR INSERT
  TO authenticated
  WITH CHECK (usuario_id = public.get_my_usuario_id());

DROP POLICY IF EXISTS assistant_pending_ops_update_own ON public.assistant_pending_ops;
CREATE POLICY assistant_pending_ops_update_own
  ON public.assistant_pending_ops
  FOR UPDATE
  TO authenticated
  USING (usuario_id = public.get_my_usuario_id())
  WITH CHECK (usuario_id = public.get_my_usuario_id());

GRANT SELECT, INSERT, UPDATE ON public.assistant_pending_ops TO authenticated;

CREATE TABLE IF NOT EXISTS public.assistant_op_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  pending_op_id uuid REFERENCES public.assistant_pending_ops(id) ON DELETE SET NULL,
  tool text NOT NULL,
  resource_id uuid,
  result text NOT NULL
    CHECK (result IN ('proposed', 'executed', 'cancelled', 'denied', 'conflict', 'error', 'expired')),
  preview_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_op_log_usuario_created
  ON public.assistant_op_log (usuario_id, created_at DESC);

COMMENT ON TABLE public.assistant_op_log IS
  'Auditoria minima del copiloto IA: herramienta, recurso, resultado y usuario. No guarda conversaciones.';

ALTER TABLE public.assistant_op_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_op_log_select_own ON public.assistant_op_log;
CREATE POLICY assistant_op_log_select_own
  ON public.assistant_op_log
  FOR SELECT
  TO authenticated
  USING (usuario_id = public.get_my_usuario_id());

DROP POLICY IF EXISTS assistant_op_log_insert_own ON public.assistant_op_log;
CREATE POLICY assistant_op_log_insert_own
  ON public.assistant_op_log
  FOR INSERT
  TO authenticated
  WITH CHECK (usuario_id = public.get_my_usuario_id());

GRANT SELECT, INSERT ON public.assistant_op_log TO authenticated;
