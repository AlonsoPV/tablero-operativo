ALTER TABLE public.assistant_pending_ops
  ADD COLUMN IF NOT EXISTS request_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_pending_ops_request_key
  ON public.assistant_pending_ops (usuario_id, tool, request_key)
  WHERE request_key IS NOT NULL;
