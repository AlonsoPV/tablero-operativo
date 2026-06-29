-- Permit WEBP image evidence uploads for actions and comments.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]
WHERE id = 'evidencias';

COMMENT ON COLUMN public.accion_comentarios.adjuntos IS
  'Array de { storage_path, file_name } para archivos adjuntos (PDF, PNG, JPG, WEBP, CSV, Excel)';
