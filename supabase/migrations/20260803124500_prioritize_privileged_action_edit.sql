-- Corrige la normalizacion de roles: primero convierte a minusculas y despues
-- elimina caracteres especiales. Antes, "Direccion" se volvia "_ireccion".

CREATE OR REPLACE FUNCTION public.normalize_business_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    both '_' FROM regexp_replace(
      translate(
        lower(trim(coalesce(p_role, ''))),
        U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1',
        'aeiouun'
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    )
  );
$$;

NOTIFY pgrst, 'reload schema';
