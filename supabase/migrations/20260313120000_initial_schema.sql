-- =============================================================================
-- Tablero Operativo Q·Quiero — Esquema inicial
-- Basado en docs/supabase-schema-proposal.md y docs/lovable-spec.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM (
  'DG', 'Sistemas', 'Operaciones', 'Planeación', 'Calidad',
  'Evidencias', 'Finanzas', 'Mantenimiento', 'RH', 'Comercial'
);

CREATE TYPE app_role AS ENUM ('admin', 'viewer');

CREATE TYPE action_status AS ENUM (
  'Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Hecho', 'Verificado'
);

CREATE TYPE prioridad_nc AS ENUM ('P1_Critica', 'P2_Media', 'P3_Baja');

CREATE TYPE nombre_kpi AS ENUM (
  'OTIF', 'Incidencias', 'Evidencias_T_mas_cero', 'DSO', 'Margen', 'NPS'
);

CREATE TYPE kpi_unidad AS ENUM ('porcentaje', 'numero', 'dias', 'moneda');

CREATE TYPE notificacion_prioridad AS ENUM ('Normal', 'Alta', 'Urgente');

CREATE TYPE area_asignacion_estado AS ENUM ('pendiente', 'aceptado', 'rechazado');

-- -----------------------------------------------------------------------------
-- EXTENSION (UUID)
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- FUNCIÓN: updated_at
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- TABLAS PRINCIPALES (orden por dependencias)
-- -----------------------------------------------------------------------------

-- usuarios (perfil extendido de auth.users)
CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  rol user_role NOT NULL DEFAULT 'Operaciones',
  area text,
  activo boolean NOT NULL DEFAULT true,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_usuario_nombre_length CHECK (char_length(nombre) >= 2 AND char_length(nombre) <= 100)
);

CREATE INDEX idx_usuarios_user_id ON usuarios(user_id);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);
CREATE INDEX idx_usuarios_activo ON usuarios(activo);

-- procesos
CREATE TABLE procesos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_proceso text NOT NULL,
  owner_usuario uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- clientes
CREATE TABLE clientes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- kpis
CREATE TABLE kpis (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_kpi nombre_kpi NOT NULL,
  definicion_operable text,
  unidad kpi_unidad NOT NULL,
  owner_rol user_role NOT NULL,
  formula text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- okrs
CREATE TABLE okrs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_okr text NOT NULL,
  descripcion text,
  proceso uuid REFERENCES procesos(id) ON DELETE SET NULL,
  owner_usuario uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  periodo text NOT NULL DEFAULT 'trimestral',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- acciones_diarias
CREATE TABLE acciones_diarias (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  descripcion_accion text NOT NULL,
  responsable uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  hora_limite time NOT NULL,
  evidencia_esperada text NOT NULL,
  evidencia_cargada boolean NOT NULL DEFAULT false,
  evidencia_adjunta text,
  estado action_status NOT NULL DEFAULT 'Pendiente',
  kpi_afectado uuid REFERENCES kpis(id) ON DELETE SET NULL,
  okr_impactado uuid REFERENCES okrs(id) ON DELETE SET NULL,
  proceso uuid REFERENCES procesos(id) ON DELETE SET NULL,
  area text,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  prioridad prioridad_nc NOT NULL DEFAULT 'P2_Media',
  causa_raiz text,
  responsable_bloqueo uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  escalado boolean NOT NULL DEFAULT false,
  fecha_escalamiento timestamptz,
  notas_escalamiento text,
  repeticion boolean NOT NULL DEFAULT false,
  verificador_dato uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  verificador_gobierno uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_accion_descripcion_length CHECK (char_length(descripcion_accion) >= 10 AND char_length(descripcion_accion) <= 500),
  CONSTRAINT chk_accion_evidencia_esperada_length CHECK (char_length(evidencia_esperada) >= 5)
);

CREATE INDEX idx_acciones_diarias_fecha ON acciones_diarias(fecha);
CREATE INDEX idx_acciones_diarias_responsable ON acciones_diarias(responsable);
CREATE INDEX idx_acciones_diarias_estado ON acciones_diarias(estado);
CREATE INDEX idx_acciones_diarias_fecha_estado ON acciones_diarias(fecha, estado);

-- -----------------------------------------------------------------------------
-- TABLAS DE SOPORTE
-- -----------------------------------------------------------------------------

-- accion_evidencias (archivos de evidencia por acción)
CREATE TABLE accion_evidencias (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  accion_id uuid NOT NULL REFERENCES acciones_diarias(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text,
  content_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_accion_evidencias_accion_id ON accion_evidencias(accion_id);

-- accion_historial (log de auditoría)
CREATE TABLE accion_historial (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  accion_id uuid NOT NULL REFERENCES acciones_diarias(id) ON DELETE CASCADE,
  campo text,
  valor_anterior text,
  valor_nuevo text,
  changed_by uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accion_historial_accion_id ON accion_historial(accion_id);
CREATE INDEX idx_accion_historial_created_at ON accion_historial(created_at);

-- accion_dependencias (bloquea/depende entre acciones)
CREATE TABLE accion_dependencias (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  accion_id uuid NOT NULL REFERENCES acciones_diarias(id) ON DELETE CASCADE,
  depende_de_id uuid NOT NULL REFERENCES acciones_diarias(id) ON DELETE CASCADE,
  tipo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_accion_dependencias_no_self CHECK (accion_id != depende_de_id)
);

CREATE INDEX idx_accion_dependencias_accion ON accion_dependencias(accion_id);
CREATE INDEX idx_accion_dependencias_depende_de ON accion_dependencias(depende_de_id);

-- accion_areas_asignadas (asignación multi-área)
CREATE TABLE accion_areas_asignadas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  accion_id uuid NOT NULL REFERENCES acciones_diarias(id) ON DELETE CASCADE,
  area text NOT NULL,
  estado area_asignacion_estado NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accion_areas_asignadas_accion ON accion_areas_asignadas(accion_id);

-- accion_flujo_cascada (flujos de impacto entre áreas)
CREATE TABLE accion_flujo_cascada (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  accion_id uuid NOT NULL REFERENCES acciones_diarias(id) ON DELETE CASCADE,
  area_origen text NOT NULL,
  area_destino text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accion_flujo_cascada_accion ON accion_flujo_cascada(accion_id);

-- kpi_mediciones (mediciones diarias por KPI)
CREATE TABLE kpi_mediciones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kpi_id uuid NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  valor numeric NOT NULL,
  meta_valor numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kpi_id, fecha)
);

CREATE INDEX idx_kpi_mediciones_kpi_fecha ON kpi_mediciones(kpi_id, fecha);

-- kpi_metas (umbrales y alertas por KPI)
CREATE TABLE kpi_metas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kpi_id uuid NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  meta_valor numeric NOT NULL,
  umbral_alerta numeric NOT NULL,
  umbral_critico numeric NOT NULL,
  periodo_evaluacion text DEFAULT 'diario',
  notificar_a uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_metas_kpi_id ON kpi_metas(kpi_id);

-- medicion_disciplina (métricas de disciplina por usuario/día)
-- TODO: spec indica que el cálculo automático no está implementado
CREATE TABLE medicion_disciplina (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  acciones_asignadas int NOT NULL DEFAULT 0,
  acciones_cerradas_en_tiempo int NOT NULL DEFAULT 0,
  porcentaje_cumplimiento numeric(5,2) NOT NULL DEFAULT 0,
  acciones_sin_evidencia int NOT NULL DEFAULT 0,
  reincidencias int NOT NULL DEFAULT 0,
  dias_consecutivos_en_verde int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usuario_id, fecha)
);

CREATE INDEX idx_medicion_disciplina_usuario_fecha ON medicion_disciplina(usuario_id, fecha);

-- notificaciones (centro de notificaciones)
CREATE TABLE notificaciones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  prioridad notificacion_prioridad NOT NULL DEFAULT 'Normal',
  leido boolean NOT NULL DEFAULT false,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_usuario ON notificaciones(usuario_id);
CREATE INDEX idx_notificaciones_usuario_leido ON notificaciones(usuario_id, leido);
CREATE INDEX idx_notificaciones_created_at ON notificaciones(created_at DESC);

-- area_onepager_config (configuración one-pager por área)
CREATE TABLE area_onepager_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  area text NOT NULL UNIQUE,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- area_reportes_diarios (reportes diarios de área)
CREATE TABLE area_reportes_diarios (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  area text NOT NULL,
  fecha date NOT NULL,
  completion_percent numeric(5,2) NOT NULL DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(area, fecha)
);

CREATE INDEX idx_area_reportes_diarios_area_fecha ON area_reportes_diarios(area, fecha);

-- checklist_items_completados (ítems de checklist por reporte/área)
CREATE TABLE checklist_items_completados (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporte_id uuid NOT NULL REFERENCES area_reportes_diarios(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  completado boolean NOT NULL DEFAULT false,
  evidencia_path text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_items_reporte ON checklist_items_completados(reporte_id);

-- user_roles (roles de aplicación admin/viewer, vinculado a auth)
CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  app_role app_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- -----------------------------------------------------------------------------
-- TRIGGERS: updated_at
-- -----------------------------------------------------------------------------

CREATE TRIGGER set_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_procesos_updated_at
  BEFORE UPDATE ON procesos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_kpis_updated_at
  BEFORE UPDATE ON kpis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_okrs_updated_at
  BEFORE UPDATE ON okrs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_acciones_diarias_updated_at
  BEFORE UPDATE ON acciones_diarias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_accion_areas_asignadas_updated_at
  BEFORE UPDATE ON accion_areas_asignadas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_kpi_metas_updated_at
  BEFORE UPDATE ON kpi_metas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_medicion_disciplina_updated_at
  BEFORE UPDATE ON medicion_disciplina
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_area_onepager_config_updated_at
  BEFORE UPDATE ON area_onepager_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_area_reportes_diarios_updated_at
  BEFORE UPDATE ON area_reportes_diarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_checklist_items_completados_updated_at
  BEFORE UPDATE ON checklist_items_completados
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- TRIGGER: handle_new_user (crear perfil en usuarios al registrarse)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_nombre text;
  user_rol user_role;
BEGIN
  user_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1));
  user_rol := COALESCE(
    (NEW.raw_user_meta_data->>'rol')::user_role,
    'Operaciones'::user_role
  );
  INSERT INTO public.usuarios (user_id, nombre, rol)
  VALUES (NEW.id, user_nombre, user_rol);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Se ejecuta en auth.users (esquema auth de Supabase)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS (Row Level Security)
-- -----------------------------------------------------------------------------

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE acciones_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE accion_evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE accion_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicion_disciplina ENABLE ROW LEVEL SECURITY;

-- Helper: es admin (tiene app_role = 'admin' en user_roles)
CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE u.id = auth.uid() AND ur.app_role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: id del usuario actual en tabla usuarios
CREATE OR REPLACE FUNCTION get_my_usuario_id()
RETURNS uuid AS $$
  SELECT id FROM usuarios WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- usuarios: solo el propio usuario o admins pueden leer
CREATE POLICY usuarios_select_own_or_admin ON usuarios
  FOR SELECT USING (
    user_id = auth.uid() OR is_app_admin()
  );
CREATE POLICY usuarios_update_own ON usuarios
  FOR UPDATE USING (user_id = auth.uid());

-- acciones_diarias: solo propias (responsable = mi usuario) o admins
CREATE POLICY acciones_select_own_or_admin ON acciones_diarias
  FOR SELECT USING (
    responsable = get_my_usuario_id() OR is_app_admin()
  );
CREATE POLICY acciones_insert_authenticated ON acciones_diarias
  FOR INSERT WITH CHECK (true);
CREATE POLICY acciones_update_own_or_admin ON acciones_diarias
  FOR UPDATE USING (
    responsable = get_my_usuario_id() OR is_app_admin()
  );
CREATE POLICY acciones_delete_own_or_admin ON acciones_diarias
  FOR DELETE USING (
    responsable = get_my_usuario_id() OR is_app_admin()
  );

-- accion_evidencias: según acceso a la acción
CREATE POLICY accion_evidencias_select ON accion_evidencias
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM acciones_diarias a
      WHERE a.id = accion_evidencias.accion_id
        AND (a.responsable = get_my_usuario_id() OR is_app_admin())
    )
  );
CREATE POLICY accion_evidencias_insert ON accion_evidencias
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM acciones_diarias a
      WHERE a.id = accion_evidencias.accion_id
        AND (a.responsable = get_my_usuario_id() OR is_app_admin())
    )
  );

-- accion_historial: solo quien puede ver la acción
CREATE POLICY accion_historial_select ON accion_historial
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM acciones_diarias a
      WHERE a.id = accion_historial.accion_id
        AND (a.responsable = get_my_usuario_id() OR is_app_admin())
    )
  );

-- notificaciones: solo las propias
CREATE POLICY notificaciones_select_own ON notificaciones
  FOR SELECT USING (usuario_id = get_my_usuario_id());
CREATE POLICY notificaciones_update_own ON notificaciones
  FOR UPDATE USING (usuario_id = get_my_usuario_id());

-- user_roles: solo admins pueden leer/editar (o el propio para leer su rol)
CREATE POLICY user_roles_select_own_or_admin ON user_roles
  FOR SELECT USING (user_id = auth.uid() OR is_app_admin());

-- medicion_disciplina: solo propias o admin
CREATE POLICY medicion_disciplina_select_own_or_admin ON medicion_disciplina
  FOR SELECT USING (usuario_id = get_my_usuario_id() OR is_app_admin());

-- Tablas sin RLS (lectura amplia para catálogos): kpis, okrs, procesos, clientes
-- Se pueden proteger después con políticas de solo lectura si se desea.

-- -----------------------------------------------------------------------------
-- COMENTARIOS
-- -----------------------------------------------------------------------------

COMMENT ON TABLE usuarios IS 'Perfil extendido por usuario de auth; spec §8';
COMMENT ON TABLE acciones_diarias IS 'Acciones del día; spec §8. Solo DG/Sistemas pueden Verificado';
COMMENT ON TABLE medicion_disciplina IS 'TODO: cálculo automático no implementado en spec §16.8';
