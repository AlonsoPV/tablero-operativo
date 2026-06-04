-- Renombrar rol de negocio Analista → Operativo (catálogo, perfiles y RLS).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Operativo';

UPDATE public.catalog_roles
SET
  nombre = 'Operativo',
  descripcion = 'Rol operativo con acceso a kanban, academia, disciplina, calendario, notificaciones, manual y mi perfil.'
WHERE public.normalize_business_role(nombre) = 'analista';

INSERT INTO public.catalog_roles (nombre, descripcion, activo)
SELECT
  'Operativo',
  'Rol operativo con acceso a kanban, academia, disciplina, calendario, notificaciones, manual y mi perfil.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_roles cr
  WHERE public.normalize_business_role(cr.nombre) = 'operativo'
);

UPDATE public.usuarios
SET rol = 'Operativo'
WHERE public.normalize_business_role(rol::text) = 'analista';

UPDATE public.catalog_roles
SET descripcion = replace(descripcion, 'tipo Analista', 'tipo Operativo')
WHERE descripcion ILIKE '%tipo Analista%';

UPDATE public.catalog_roles
SET descripcion = replace(descripcion, 'tipo analista', 'tipo operativo')
WHERE descripcion ILIKE '%tipo analista%';

DROP POLICY IF EXISTS usuarios_select_active_for_analyst ON public.usuarios;

CREATE POLICY usuarios_select_active_for_operativo ON public.usuarios
  FOR SELECT TO authenticated
  USING (
    activo = true
    AND (
      public.has_business_role('Operativo')
      OR public.has_business_role('Analista')
    )
  );
