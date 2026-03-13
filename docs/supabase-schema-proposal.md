# Propuesta de esquema Supabase (Postgres)

Basado en §8 Estructura de Datos de lovable-spec.md. Usar como referencia para migraciones.

---

## Enums

```sql
-- Rol de negocio (área)
CREATE TYPE user_role AS ENUM (
  'DG', 'Sistemas', 'Operaciones', 'Planeación', 'Calidad',
  'Evidencias', 'Finanzas', 'Mantenimiento', 'RH', 'Comercial'
);

-- Rol de aplicación (permisos)
CREATE TYPE app_role AS ENUM ('admin', 'viewer');

-- Estado de acción
CREATE TYPE action_status AS ENUM (
  'Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Hecho', 'Verificado'
);

-- Prioridad
CREATE TYPE prioridad_nc AS ENUM ('P1_Critica', 'P2_Media', 'P3_Baja');

-- KPIs sagrados
CREATE TYPE nombre_kpi AS ENUM (
  'OTIF', 'Incidencias', 'Evidencias_T_mas_cero', 'DSO', 'Margen', 'NPS'
);

CREATE TYPE kpi_unidad AS ENUM ('porcentaje', 'numero', 'dias', 'moneda');
```

---

## Tablas principales

### usuarios

- `id` uuid PK
- `user_id` uuid FK → auth.users NOT NULL UNIQUE
- `nombre` text NOT NULL (2-100 chars)
- `rol` user_role (default 'Operaciones')
- `area` text
- `activo` boolean default true
- `onboarding_completed` boolean default false
- `created_at`, `updated_at` timestamptz

### acciones_diarias

- `id` uuid PK
- `fecha` date default CURRENT_DATE
- `descripcion_accion` text NOT NULL (10-500)
- `responsable` uuid FK → usuarios NOT NULL
- `hora_limite` time NOT NULL
- `evidencia_esperada` text NOT NULL (min 5 chars)
- `evidencia_cargada` boolean default false
- `evidencia_adjunta` text
- `estado` action_status default 'Pendiente'
- `kpi_afectado` uuid FK → kpis
- `okr_impactado` uuid FK → okrs
- `proceso` uuid FK → procesos
- `area` text
- `cliente_id` uuid FK → clientes
- `prioridad` prioridad_nc default 'P2_Media'
- `causa_raiz` text (cuando Bloqueado)
- `responsable_bloqueo` uuid FK → usuarios
- `escalado` boolean default false
- `fecha_escalamiento` timestamptz
- `notas_escalamiento` text
- `repeticion` boolean default false
- `verificador_dato` uuid FK → usuarios
- `verificador_gobierno` uuid FK → usuarios
- `created_at`, `updated_at` timestamptz

### kpis

- `id` uuid PK
- `nombre_kpi` nombre_kpi
- `definicion_operable` text
- `unidad` kpi_unidad
- `owner_rol` user_role
- `formula` text

### okrs

- `id` uuid PK
- `nombre_okr` text
- `descripcion` text
- `proceso` uuid FK → procesos
- `owner_usuario` uuid FK → usuarios
- `periodo` text default 'trimestral'
- `activo` boolean

### procesos

- `id` uuid PK
- `nombre_proceso` text
- `owner_usuario` uuid FK → usuarios

### clientes

- `id` uuid PK
- `nombre` text (y demás campos según catálogo)

---

## Tablas de soporte (nombres según spec)

- `accion_evidencias` — id, accion_id, url/storage_path, uploaded_at, etc.
- `accion_historial` — log de cambios de estado y campos
- `accion_dependencias` — accion_id, depende_de_id, tipo
- `accion_areas_asignadas` — accion_id, area, estado (pendiente/aceptado/rechazado)
- `accion_flujo_cascada` — flujos entre áreas
- `kpi_mediciones` — kpi_id, fecha, valor, etc.
- `kpi_metas` — kpi_id, meta, umbral_alerta, umbral_critico, notificar_a
- `medicion_disciplina` — usuario_id, fecha, acciones_asignadas, acciones_cerradas_en_tiempo, porcentaje_cumplimiento, etc.
- `notificaciones` — usuario_id, tipo, prioridad, leido, payload, created_at
- `area_onepager_config` — area, config json/text
- `area_reportes_diarios` — area, fecha, completion %, etc.
- `checklist_items_completados` — reporte/area, item_id, completado, evidencia
- `user_roles` — user_id (auth), app_role (admin/viewer)

---

## RLS (resumen spec §15)

- Acciones: cada usuario ve solo las propias; admins ven/editan todo.
- Notificaciones: privadas por usuario.
- Usuarios: spec §17 indica riesgo — solo propio usuario o admins leen; puede impedir listar responsables en acciones (revisar policy de lectura para dropdowns).

---

## Triggers y funciones (spec §11)

- `handle_new_user` — Crear perfil en `usuarios` al registrarse.
- `validate_accion` — Descripción 10-500, evidencia esperada ≥5, solo admin puede Verificado.
- `validate_usuario` — Nombre 2-100.
- `log_accion_status_change`, `log_accion_creation` — Auditoría.
- `update_updated_at_column` — updated_at.
- TODO: cálculo automático de `medicion_disciplina` no implementado en spec.
