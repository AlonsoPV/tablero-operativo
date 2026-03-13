# Modelo de datos Supabase — Tablero Operativo

Alineado con `dashboard-spec.md` y con las migraciones existentes. Reglas: UUID PK, created_at/updated_at, FKs claras, catálogos para valores cambiantes, RLS preparado, sin contraseñas fuera de `auth.users`.

---

## 1. Tablas principales

### 1.1 `usuarios` (perfil extendido de auth.users)

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|--------|
| id | uuid | PK | DEFAULT uuid_generate_v4() |
| user_id | uuid | Sí, UNIQUE | FK → auth.users(id) ON DELETE CASCADE |
| nombre | text | Sí | CHECK length 2–100 |
| rol | text | Sí | Default 'Operaciones'; migración 20260313150000 cambió de enum a text (catálogo) |
| area | text | No | Área funcional; puede venir de catálogo `areas` |
| activo | boolean | Sí | Default true |
| onboarding_completed | boolean | Sí | Default false |
| created_at | timestamptz | Sí | now() |
| updated_at | timestamptz | Sí | now() |

**Estado:** Existe. Migración reciente convierte `rol` a text para conectar con `catalog_roles`.

---

### 1.2 `acciones_diarias` (entidad central)

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|--------|
| id | uuid | PK | |
| fecha | date | Sí | Default CURRENT_DATE |
| descripcion_accion | text | Sí | CHECK 10–500 caracteres |
| responsable | uuid | Sí | FK usuarios(id) ON DELETE RESTRICT |
| hora_limite | time | Sí | |
| evidencia_esperada | text | Sí | CHECK ≥ 5 caracteres |
| evidencia_cargada | boolean | Sí | Default false |
| evidencia_adjunta | text | No | URL |
| estado | action_status | Sí | Default 'Pendiente' |
| prioridad | prioridad_nc | Sí | Default 'P2_Media' |
| kpi_afectado | uuid | No | FK kpis(id) |
| okr_impactado | uuid | No | FK okrs(id) |
| proceso | uuid | No | FK procesos(id) |
| area | text | No | |
| cliente_id | uuid | No | FK clientes(id) |
| causa_raiz | text | No | Requerido si estado = Bloqueado (lógica/trigger) |
| responsable_bloqueo | uuid | No | FK usuarios(id) |
| escalado | boolean | Sí | Default false |
| fecha_escalamiento | timestamptz | No | |
| notas_escalamiento | text | No | |
| repeticion | boolean | Sí | Default false; trigger |
| verificador_dato | uuid | No | FK usuarios(id) |
| verificador_gobierno | uuid | No | FK usuarios(id) |
| created_at | timestamptz | Sí | |
| updated_at | timestamptz | Sí | |

**Estado:** Existe en initial_schema.

---

### 1.3 `procesos`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | uuid | PK |
| nombre_proceso | text | NOT NULL |
| owner_usuario | uuid | FK usuarios(id) |
| created_at, updated_at | timestamptz | |

**Estado:** Existe.

---

### 1.4 `clientes`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | uuid | PK |
| nombre | text | NOT NULL |
| created_at, updated_at | timestamptz | |

**Gap con spec §9.7:** La spec incluye contacto_nombre, contacto_email, activo, notas. **TODO:** Migración opcional para añadir esas columnas si se requiere.

**Estado:** Existe con id, nombre; resto opcional.

---

### 1.5 `kpis` (KPIs sagrados)

| Campo | Tipo | Notas |
|-------|------|--------|
| id | uuid | PK |
| nombre_kpi | nombre_kpi (enum) | NOT NULL |
| definicion_operable | text | |
| unidad | kpi_unidad (enum) | NOT NULL |
| owner_rol | user_role | NOT NULL |
| formula | text | |
| created_at, updated_at | timestamptz | |

**Estado:** Existe.

---

### 1.6 `okrs`

| Campo | Tipo | Notas |
|-------|------|--------|
| id | uuid | PK |
| nombre_okr | text | NOT NULL |
| descripcion | text | |
| proceso | uuid | FK procesos(id) |
| owner_usuario | uuid | FK usuarios(id) |
| periodo | text | Default 'trimestral' |
| activo | boolean | Default true |
| created_at, updated_at | timestamptz | |

**Estado:** Existe.

---

## 2. Relaciones entre tablas

- **usuarios** ← auth.users (user_id). Referenciado por: acciones_diarias.responsable, responsable_bloqueo, verificador_*, procesos.owner_usuario, okrs.owner_usuario, accion_evidencias.uploaded_by, accion_historial.changed_by, notificaciones.usuario_id, medicion_disciplina.usuario_id, user_roles.user_id.
- **acciones_diarias** → usuarios, kpis, okrs, procesos, clientes. Referenciada por: accion_evidencias, accion_historial, accion_dependencias (accion_id y depende_de_id), accion_areas_asignadas, accion_flujo_cascada.
- **kpis** → referenciado por acciones_diarias.kpi_afectado, kpi_mediciones, kpi_metas.
- **user_roles** → auth.users (user_id). Tabla separada para app_role (admin/viewer/super_admin).

---

## 3. Catálogos

### Enums (existentes)

- user_role, app_role, action_status, prioridad_nc, nombre_kpi, kpi_unidad, notificacion_prioridad, area_asignacion_estado.

### Tablas de catálogo (migración 20260313140000)

| Tabla | Uso |
|-------|-----|
| catalog_roles | Roles visibles; usuarios.rol puede almacenar nombre aquí. |
| areas | Áreas/departamentos; usuarios.area y filtros. |
| statuses | Estatus operativos (orden, color, es_cierre); puede coexistir con action_status para UI. |
| priorities | Prioridades; puede coexistir con prioridad_nc. |
| dropdown_catalogs | Tipos de listas desplegables (key único). |
| dropdown_options | Opciones label/value por catálogo. |
| catalog_kpis | KPIs configurables (nombre, unidad, tipo, meta, periodicidad); evolución futura. |

**Nota:** acciones_diarias.estado y .prioridad siguen con enums en BD; la spec los define así. Los catálogos statuses/priorities sirven para configuración visual o futura migración.

---

## 4. Campos de auditoría

- **Todas las tablas principales:** created_at, updated_at (triggers update_updated_at_column).
- **accion_historial:** Registro por cambio en acciones_diarias (campo, valor_anterior, valor_nuevo, changed_by, created_at). Triggers: log_accion_creation, log_accion_status_change (según spec §7).

---

## 5. Tablas de historial o seguimiento

| Tabla | Propósito |
|-------|-----------|
| accion_historial | Auditoría de cambios por acción (creación, cambio estado, evidencia, causa_raiz). |
| accion_evidencias | Archivos de evidencia por acción (storage_path, file_name, uploaded_at, uploaded_by). |
| accion_dependencias | accion_id depende de depende_de_id; tipo. |
| accion_areas_asignadas | Multi-área por acción; estado pendiente/aceptado/rechazado. |
| accion_flujo_cascada | Flujo área_origen → area_destino por acción (spec §14.5 parcial). |
| kpi_mediciones | Valor y meta por kpi_id y fecha. |
| medicion_disciplina | Métricas de disciplina por usuario_id y fecha (cálculo automático TODO). |

---

## 6. Tablas de soporte para dropdowns y KPIs

- **dropdown_catalogs** + **dropdown_options**: Listas desplegables genéricas.
- **catalog_kpis**: KPIs configurables (evolución).
- **kpi_metas**: meta_valor, umbral_alerta, umbral_critico, periodo_evaluacion, notificar_a (uuid[]), activo.
- **kpi_mediciones**: Resultado diario por KPI (valor, meta_valor).

---

## 7. Resumen de tablas (lista para RLS y desarrollo)

| Tabla | Propósito |
|-------|-----------|
| usuarios | Perfil extendido por usuario. |
| user_roles | app_role por user_id (auth). |
| procesos | Procesos con owner. |
| clientes | Clientes (spec amplía con contacto, activo, notas; opcional). |
| kpis | KPIs sagrados. |
| okrs | OKRs con proceso y owner. |
| acciones_diarias | Acciones del día (núcleo). |
| accion_evidencias | Archivos de evidencia. |
| accion_historial | Auditoría de cambios. |
| accion_dependencias | Dependencias entre acciones. |
| accion_areas_asignadas | Asignación multi-área. |
| accion_flujo_cascada | Flujo entre áreas. |
| kpi_mediciones | Mediciones por KPI/fecha. |
| kpi_metas | Umbrales y notificaciones. |
| medicion_disciplina | Disciplina por usuario/fecha. |
| notificaciones | Centro de notificaciones. |
| area_onepager_config | Config one-pager por área. |
| area_reportes_diarios | Reportes diarios por área. |
| checklist_items_completados | Ítems de checklist por reporte. |
| catalog_roles | Catálogo roles. |
| areas | Catálogo áreas. |
| statuses | Catálogo estatus. |
| priorities | Catálogo prioridades. |
| dropdown_catalogs | Catálogos desplegables. |
| dropdown_options | Opciones por dropdown. |
| catalog_kpis | KPIs configurables (catálogo). |

---

## 8. Gaps y TODOs en BD

- **medicion_disciplina:** Sin trigger/función que la calcule; vista de disciplina vacía hasta implementar.
- **clientes:** Añadir contacto_nombre, contacto_email, activo, notas si se requiere (migración opcional).
- **Triggers de notificación:** Spec menciona notify_status_change, notify_evidence_upload, notify_dependency_*; verificar existencia en migraciones.
- **Límite 1000 rows:** Paginación o ventanas en listados de acciones para no superar límites de PostgREST.

---

*Modelo alineado con dashboard-spec.md y migraciones existentes. Versión 1.0.*
