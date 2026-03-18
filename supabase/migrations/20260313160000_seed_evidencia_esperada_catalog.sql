-- Catálogo "evidencia_esperada" para el formulario de acciones (correo, llamada, documento, etc.)
INSERT INTO dropdown_catalogs (key, nombre, descripcion, activo)
SELECT 'evidencia_esperada', 'Evidencia esperada', 'Tipo de evidencia a entregar en acciones diarias', true
WHERE NOT EXISTS (SELECT 1 FROM dropdown_catalogs WHERE trim(lower(key)) = 'evidencia_esperada');

INSERT INTO dropdown_options (catalog_id, label, value, orden, activo)
SELECT c.id, v.label, v.value, v.orden, true
FROM dropdown_catalogs c
CROSS JOIN (VALUES
  ('Correo', 'correo', 1),
  ('Llamada', 'llamada', 2),
  ('Documento', 'documento', 3),
  ('Reunión', 'reunion', 4),
  ('Screenshot / captura', 'screenshot', 5),
  ('Otro especificar', 'otro', 6)
) AS v(label, value, orden)
WHERE c.key = 'evidencia_esperada'
  AND NOT EXISTS (
    SELECT 1 FROM dropdown_options o
    WHERE o.catalog_id = c.id AND lower(trim(o.value)) = v.value
  );
