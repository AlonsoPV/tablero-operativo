-- Actualizar la opción "Otro" del catálogo evidencia_esperada a "Otro especificar".
UPDATE dropdown_options o
SET label = 'Otro especificar', updated_at = now()
FROM dropdown_catalogs c
WHERE o.catalog_id = c.id
  AND trim(lower(c.key)) = 'evidencia_esperada'
  AND (trim(lower(o.value)) = 'otro' OR trim(lower(o.label)) = 'otro');
