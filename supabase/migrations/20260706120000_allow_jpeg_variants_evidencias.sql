-- Permitir variantes comunes de JPEG que algunos navegadores/cámaras reportan
-- como image/pjpeg, además de archivos .jpeg/.jfif normalizados a image/jpeg.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/webp',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]
WHERE id = 'evidencias';
