-- Alias de nombres visibles del catálogo → claves internas del kanban corporativo.

UPDATE public.statuses
SET estado_key = CASE
  WHEN estado_key IS NOT NULL AND btrim(estado_key) <> '' THEN estado_key
  WHEN lower(trim(nombre)) IN ('asignado') THEN 'Pendiente'
  WHEN lower(trim(nombre)) IN ('por verificar', 'porverificar') THEN 'Hecho'
  WHEN lower(trim(nombre)) IN ('pendiente') THEN 'Pendiente'
  WHEN lower(trim(nombre)) IN ('hoy') THEN 'Hoy'
  WHEN lower(trim(nombre)) IN ('en_ejecucion', 'en ejecucion', 'en ejecución', 'en proceso') THEN 'En_Ejecucion'
  WHEN lower(trim(nombre)) IN ('bloqueado') THEN 'Bloqueado'
  WHEN lower(trim(nombre)) IN ('retraso', 'vencido') THEN 'Retraso'
  WHEN lower(trim(nombre)) IN ('hecho', 'terminado', 'realizado') THEN 'Hecho'
  WHEN lower(trim(nombre)) IN ('verificado', 'validacion', 'validación') THEN 'Verificado'
  WHEN orden = 1 THEN 'Pendiente'
  WHEN orden = 6 AND es_cierre IS TRUE THEN 'Hecho'
  WHEN orden = 7 AND es_cierre IS TRUE THEN 'Verificado'
  ELSE estado_key
END
WHERE estado_key IS NULL
   OR btrim(coalesce(estado_key, '')) = '';

NOTIFY pgrst, 'reload schema';
