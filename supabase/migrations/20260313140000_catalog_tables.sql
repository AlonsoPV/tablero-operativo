-- =============================================================================
-- Tablas de catálogos / configuración (admin)
-- roles, areas, statuses, priorities, dropdown_catalogs, dropdown_options, catalog_kpis
-- =============================================================================

-- catalog_roles: roles visibles del sistema (preparado para permisos por rol)
CREATE TABLE catalog_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre text NOT NULL,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_catalog_roles_nombre_length CHECK (char_length(trim(nombre)) >= 2)
);

CREATE INDEX idx_catalog_roles_activo ON catalog_roles(activo);

-- areas: departamentos/áreas para usuarios, filtros y reportes
CREATE TABLE areas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre text NOT NULL,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_areas_nombre_length CHECK (char_length(trim(nombre)) >= 2)
);

CREATE UNIQUE INDEX idx_areas_nombre_unique ON areas(lower(trim(nombre)));
CREATE INDEX idx_areas_activo ON areas(activo);

-- statuses: estatus operativos (orden, color, es_cierre)
CREATE TABLE statuses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre text NOT NULL,
  descripcion text,
  color text,
  orden int NOT NULL DEFAULT 0,
  es_cierre boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_statuses_nombre_length CHECK (char_length(trim(nombre)) >= 2)
);

CREATE INDEX idx_statuses_orden ON statuses(orden);
CREATE INDEX idx_statuses_activo ON statuses(activo);

-- priorities: prioridades
CREATE TABLE priorities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre text NOT NULL,
  descripcion text,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_priorities_nombre_length CHECK (char_length(trim(nombre)) >= 2)
);

CREATE INDEX idx_priorities_orden ON priorities(orden);
CREATE INDEX idx_priorities_activo ON priorities(activo);

-- dropdown_catalogs: tipos de listas desplegables
CREATE TABLE dropdown_catalogs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dropdown_catalogs_key_length CHECK (char_length(trim(key)) >= 1),
  CONSTRAINT chk_dropdown_catalogs_nombre_length CHECK (char_length(trim(nombre)) >= 2)
);

CREATE UNIQUE INDEX idx_dropdown_catalogs_key ON dropdown_catalogs(lower(trim(key)));
CREATE INDEX idx_dropdown_catalogs_activo ON dropdown_catalogs(activo);

-- dropdown_options: opciones de cada catálogo desplegable
CREATE TABLE dropdown_options (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_id uuid NOT NULL REFERENCES dropdown_catalogs(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dropdown_options_label_length CHECK (char_length(trim(label)) >= 1),
  CONSTRAINT chk_dropdown_options_value_length CHECK (char_length(trim(value)) >= 1)
);

CREATE INDEX idx_dropdown_options_catalog ON dropdown_options(catalog_id);
CREATE INDEX idx_dropdown_options_orden ON dropdown_options(catalog_id, orden);
CREATE UNIQUE INDEX idx_dropdown_options_catalog_value ON dropdown_options(catalog_id, lower(trim(value)));

-- catalog_kpis: KPIs configurables (nombre, unidad, tipo, meta, periodicidad)
-- Separado de kpis existente (sagrados) para evolución y dashboards dinámicos
CREATE TABLE catalog_kpis (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre text NOT NULL,
  descripcion text,
  unidad text NOT NULL DEFAULT 'porcentaje',
  tipo text NOT NULL DEFAULT 'manual',
  meta_objetivo numeric,
  periodicidad text NOT NULL DEFAULT 'mensual',
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_catalog_kpis_nombre_length CHECK (char_length(trim(nombre)) >= 2)
);

CREATE INDEX idx_catalog_kpis_activo ON catalog_kpis(activo);
CREATE INDEX idx_catalog_kpis_orden ON catalog_kpis(orden);

-- Triggers updated_at
CREATE TRIGGER set_catalog_roles_updated_at
  BEFORE UPDATE ON catalog_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_areas_updated_at
  BEFORE UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_statuses_updated_at
  BEFORE UPDATE ON statuses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_priorities_updated_at
  BEFORE UPDATE ON priorities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_dropdown_catalogs_updated_at
  BEFORE UPDATE ON dropdown_catalogs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_dropdown_options_updated_at
  BEFORE UPDATE ON dropdown_options FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_catalog_kpis_updated_at
  BEFORE UPDATE ON catalog_kpis FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE catalog_roles IS 'Catálogo de roles visibles; preparado para permisos por rol';
COMMENT ON TABLE areas IS 'Catálogo de áreas/departamentos para usuarios y reportes';
COMMENT ON TABLE statuses IS 'Estatus operativos con orden, color y es_cierre';
COMMENT ON TABLE catalog_kpis IS 'KPIs configurables; preparado para fórmulas y dashboards';
