-- =============================================================================
-- 1) Adjuntos en comentarios (PDF, PNG, JPG): paths en JSONB
-- 2) Bucket de storage para evidencias (crear si no existe)
-- =============================================================================

-- Adjuntos en comentarios: array de { storage_path, file_name }
ALTER TABLE accion_comentarios
  ADD COLUMN IF NOT EXISTS adjuntos jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN accion_comentarios.adjuntos IS 'Array de { storage_path, file_name } para archivos adjuntos (PDF, PNG, JPG)';

-- Bucket para evidencias (acciones y comentarios)
-- Si falla por permisos, crear el bucket desde el Dashboard y ejecutar solo las políticas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidencias',
  'evidencias',
  false,
  10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

-- Políticas: autenticados pueden subir y leer
DROP POLICY IF EXISTS evidencias_insert ON storage.objects;
CREATE POLICY evidencias_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidencias');

DROP POLICY IF EXISTS evidencias_select ON storage.objects;
CREATE POLICY evidencias_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'evidencias');

DROP POLICY IF EXISTS evidencias_delete ON storage.objects;
CREATE POLICY evidencias_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'evidencias');
