-- =============================================================================
-- Sincronizar perfil al invitar usuarios por correo
-- El trigger de auth.users debe conservar el área enviada en raw_user_meta_data
-- para que la invitación cree el perfil completo sin depender de user_id manual.
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_nombre text;
  user_rol user_role;
  user_area text;
  user_activo boolean;
  user_onboarding_completed boolean;
BEGIN
  user_nombre := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'nombre'), ''),
    split_part(NEW.email, '@', 1)
  );
  user_rol := COALESCE(
    (NULLIF(trim(NEW.raw_user_meta_data->>'rol'), ''))::user_role,
    'Operaciones'::user_role
  );
  user_area := NULLIF(trim(NEW.raw_user_meta_data->>'area'), '');
  user_activo := COALESCE((NULLIF(trim(NEW.raw_user_meta_data->>'activo'), ''))::boolean, true);
  user_onboarding_completed := COALESCE(
    (NULLIF(trim(NEW.raw_user_meta_data->>'onboarding_completed'), ''))::boolean,
    false
  );

  INSERT INTO public.usuarios (user_id, nombre, rol, area, activo, onboarding_completed)
  VALUES (NEW.id, user_nombre, user_rol, user_area, user_activo, user_onboarding_completed);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
