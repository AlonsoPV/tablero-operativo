# Arquitectura funcional — Tablero Operativo

Derivada de `dashboard-spec.md` y `dashboard-spec-analysis.md`. React + Vite + TypeScript + Supabase + Vercel.

---

## A. Módulos del frontend

Estructura de **features** alineada con la spec y con la base actual del proyecto:

| Módulo | Ruta base | Descripción |
|--------|-----------|-------------|
| **auth** | `/login` | Login, registro (y futuro recuperación de contraseña). |
| **dashboard** | `/dashboard` | Resumen del día: tarjetas KPI, tabla de acciones, semáforo, burndown. |
| **operations** | `/operations` | Listado, detalle, formulario y acciones sobre acciones diarias (CRUD, estado, evidencia, dependencias). |
| **kanban** | `/kanban` | Tablero por columnas de estado; drag & drop. |
| **metrics** (disciplina) | `/disciplina` | Métricas de cumplimiento por usuario. |
| **areas** | `/areas` | Panel de área: one-pager, checklist diario, reportes por área. |
| **calendar** | `/calendario` | Vista temporal de acciones por fecha. |
| **reports** | `/reportes` | Reportes históricos, filtros, exportación PDF/Excel. |
| **notifications** | `/notificaciones` | Centro de notificaciones. |
| **manual** | `/manual` | Manual de operaciones, tutorial, chat IA. |
| **users** | `/settings/users` | Administración de usuarios (listado, detalle, crear, editar, activar/desactivar). |
| **catalogs** | `/settings/catalogs/*` | Catálogos: índice, roles, áreas, estatus, prioridades, dropdowns, KPIs. |
| **settings** | `/settings` | Contenedor: usuarios + catálogos (y futuros ajustes). |

**Nota:** No se añaden módulos no descritos en la spec (ej. permisos granulares por área).

---

## B. Rutas

Rutas principales definidas según spec y proyecto actual:

| Ruta | Módulo | Notas |
|------|--------|-------|
| `/login` | auth | Página de login. |
| `/` | — | Redirect a `/dashboard` (o login si no autenticado). |
| `/dashboard` | dashboard | Dashboard principal. |
| `/kanban` | kanban | Kanban personal. |
| `/disciplina` | metrics | Métricas de disciplina. |
| `/areas` | areas | Panel de área (tabs por área/rol). |
| `/calendario` | calendar | Vista calendario. |
| `/reportes` | reports | Reportes históricos. |
| `/notificaciones` | notifications | Centro de notificaciones. |
| `/manual` | manual | Manual de operaciones. |
| `/settings` | settings | Layout settings; index → redirect a usuarios. |
| `/settings/users` | users | Listado de usuarios. |
| `/settings/users/:id` | users | Detalle de usuario. |
| `/settings/catalogs` | catalogs | Índice de catálogos. |
| `/settings/catalogs/roles` | catalogs | CRUD roles. |
| `/settings/catalogs/areas` | catalogs | CRUD áreas. |
| `/settings/catalogs/statuses` | catalogs | CRUD estatus. |
| `/settings/catalogs/priorities` | catalogs | CRUD prioridades. |
| `/settings/catalogs/dropdowns` | catalogs | Lista de catálogos desplegables. |
| `/settings/catalogs/dropdowns/:catalogId` | catalogs | Opciones de un dropdown. |
| `/settings/catalogs/kpis` | catalogs | CRUD KPIs de catálogo. |

**Operaciones (acciones diarias):** La spec no exige ruta tipo `/operations/:id` explícita; el detalle puede ser modal desde dashboard/kanban. Si se desea URL para detalle: `/operations` (listado) y `/operations/:id` (detalle). **Supuesto:** listado en dashboard/kanban; detalle en modal o ruta según decisión de producto. Se deja preparado para `/operations` y `/operations/:id` si se implementa vista dedicada.

---

## C. Tipos TypeScript

Entidades y tipos alineados con la spec y con las tablas existentes:

### Perfil y auth

- `UserProfile` — id, user_id, nombre, rol, area, activo, onboarding_completed, created_at, updated_at.
- `AppRole` — 'admin' | 'viewer' (y en BD 'super_admin' si existe).
- `UserRole` — rol funcional (DG, Sistemas, Operaciones, …); en front puede ser string si viene de catálogo.

### Operaciones (acciones diarias)

- `AccionDiaria` (u `Operation`) — campos de la spec §5.1: id, fecha, descripcion_accion, responsable, hora_limite, evidencia_esperada, estado, prioridad, kpi_afectado, okr_impactado, proceso, area, cliente_id, evidencia_cargada, evidencia_adjunta, causa_raiz, responsable_bloqueo, escalado, fecha_escalamiento, notas_escalamiento, repeticion, verificador_dato, verificador_gobierno, created_at, updated_at.
- `ActionStatus` — Pendiente | Hoy | En_Ejecucion | Bloqueado | Hecho | Verificado.
- `PrioridadNc` — P1_Critica | P2_Media | P3_Baja.
- `AccionEvidencia` — accion_id, storage_path, file_name, content_type, uploaded_at, uploaded_by.
- `AccionHistorialEntry` — accion_id, campo, valor_anterior, valor_nuevo, changed_by, tipo_cambio, created_at.
- `AccionDependencia` — accion_bloqueadora_id, accion_dependiente_id, tipo_dependencia.
- `AccionAreaAsignada` — accion_id, area, estado (pendiente/aceptado/rechazado).

### Catálogos y soporte

- `CatalogRole`, `Area`, `Status`, `Priority`, `DropdownCatalog`, `DropdownOption`, `CatalogKpi` — ya existentes en `catalogs.types`.
- `CatalogFilter` — search, activo (filtros genéricos).
- `Cliente` — id, nombre, contacto_nombre?, contacto_email?, activo?, notas? (spec §9.7).
- `Proceso` — id, nombre_proceso, owner_usuario.
- `Okr` — id, nombre_okr, descripcion, proceso, owner_usuario, periodo, activo.

### KPIs

- `Kpi` — id, nombre_kpi, definicion_operable, unidad, owner_rol, formula (sagrados).
- `KpiMeta` — meta_valor, umbral_alerta, umbral_critico, periodo, notificar_a, activo.
- `KpiMedicion` — kpi_id, fecha/periodo, valor, cumplimiento, color semáforo (según modelo real).
- `MedicionDisciplina` — usuario_id, fecha, acciones_asignadas, acciones_cerradas_en_tiempo, porcentaje_cumplimiento, acciones_sin_evidencia, reincidencias, dias_consecutivos_en_verde.

### Notificaciones y reportes

- `Notificacion` — id, usuario_id, tipo, prioridad, titulo, mensaje, leido, created_at.
- Tipos para exportación: payload de acciones filtradas para PDF/Excel.

### Formularios (Zod / React Hook Form)

- Schemas para: usuario (user.schema), acción/operación (operation.schema), catálogos (role, area, status, priority, dropdown, kpi), y filtros donde aplique.

---

## D. Servicios (Supabase)

Capas de datos por dominio; sin llamadas directas a Supabase en componentes.

| Servicio | Responsabilidad |
|----------|-----------------|
| **auth.service** | signIn, signOut, signUp (metadata nombre/rol); sesión. |
| **users.service** (o usersAdminService) | CRUD perfiles en `usuarios`; list con filtros; setActivo. |
| **operations.service** (o acciones.service) | list, getById, create, update, delete de `acciones_diarias`; filtros por fecha, estado, prioridad, área, responsable; subir evidencia (storage + accion_evidencias); historial. |
| **evidencias.service** | Subida a bucket `evidencias`, registro en `accion_evidencias`, actualización de evidencia_cargada/evidencia_adjunta. |
| **catalogs:** roles, areas, statuses, priorities, dropdownCatalogs, dropdownOptions, kpis | Ya existentes por catálogo; list, getById, create, update, setActivo. |
| **kpis.service** (KPIs sagrados y metas) | Lectura de `kpis`, `kpi_metas`, `kpi_mediciones`; cálculo de cumplimiento (o invocar función/edge si existe). |
| **disciplina.service** | Lectura de `medicion_disciplina` por usuario/fecha; TODO si no hay cálculo automático. |
| **notificaciones.service** | list por usuario, marcar leído, eliminar. |
| **reportes.service** | Datos para exportación (acciones filtradas); generación PDF/Excel en cliente (jsPDF, xlsx). |
| **clientes.service** | list, getById (para filtros y formulario de acción). |
| **procesos.service** | list, getById. |
| **okrs.service** | list activos, getById. |
| **areaReportes.service** | area_reportes_diarios, area_onepager_config según spec. |

**Regla:** Los componentes usan hooks (React Query) que llaman a estos servicios; no importan el cliente de Supabase directamente.

---

*Documento de arquitectura. Versión 1.0.*
