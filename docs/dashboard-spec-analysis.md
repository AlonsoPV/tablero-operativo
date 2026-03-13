# Análisis funcional — Tablero Operativo Q·Quiero

Documento derivado de `dashboard-spec.md`. Fuente de verdad para arquitectura y desarrollo.

---

## 1. Objetivo del sistema

**Q·Quiero** es un tablero operativo diario para controlar la ejecución de acciones críticas en empresas de logística y servicios. Objetivos principales:

- Vincular cada tarea diaria a un **KPI u OKR** medible.
- Asegurar **rendición de cuentas**, **trazabilidad** y **disciplina operativa**.
- Resolver: tareas sin responsable, falta de evidencia, desconexión tarea-meta, visibilidad de bloqueos, métricas de disciplina, comunicación fragmentada, decisiones sin datos (semáforo KPI).

**Tipo de decisiones que permite:** qué acciones están bloqueadas y por qué; quién cumple y quién no; qué KPIs están en riesgo; reincidencias; dependencias cruzadas entre áreas.

---

## 2. Tipos de usuario y roles detectados

### 2.1 Roles del sistema (`user_role`) — área funcional y visibilidad

| Rol | Alcance de módulos | Acciones clave |
|-----|--------------------|----------------|
| **DG** | Todos | CRUD acciones, verificar, reportes, configurar KPIs |
| **Sistemas** | Todos | Igual que DG + administrar catálogos, gestionar usuarios |
| **Operaciones** | Dashboard, Kanban, Panel Área, Disciplina, Calendario | CRUD propias, evidencia, KPI OTIF |
| **Planeación** | Dashboard, Kanban, Panel Área, Disciplina | CRUD propias, evidencia |
| **Calidad** | Idem | CRUD propias, KPI Incidencias |
| **Evidencias** | Idem | CRUD propias, KPI Evidencias T+0 |
| **Finanzas** | Idem | CRUD propias, KPIs DSO y Margen |
| **Mantenimiento** | Idem | CRUD propias |
| **RH** | Idem | CRUD propias |
| **Comercial** | Idem | CRUD propias, KPI NPS |

**Regla:** DG y Sistemas se tratan como admin implícito (`is_admin()`).

### 2.2 Roles de aplicación (`app_role`) — nivel de acceso transversal

| Rol | Descripción |
|-----|-------------|
| `admin` | Lectura/escritura total; verificar acciones; gestionar catálogos y usuarios. |
| `viewer` | Solo lectura; no crear ni modificar. |

**Almacenamiento:** tabla `user_roles` (no en perfil). Relación 1:1 con `auth.users` vía `user_id`.

---

## 3. Módulos del sistema

| Módulo | Objetivo | Acciones principales | Filtros |
|--------|----------|---------------------|---------|
| **Dashboard principal** | Resumen ejecutivo del día | Crear acción, ver detalle, filtrar, ir a Kanban | Fecha, estado, prioridad, área, responsable |
| **Kanban personal** | Ejecución individual por columnas de estado | Drag & drop, subir evidencia, ver detalle | Por usuario autenticado |
| **Métricas de disciplina** | Cumplimiento individual | Solo consulta | Por usuario o todos (admin) |
| **Panel de área** | Config y reporte por área | Checklist diario, evidencia por ítem, notas | Por rol/área (tabs) |
| **Vista calendario** | Acciones en el tiempo | Navegar fechas, ver acciones del día | Rango de fechas |
| **Reportes históricos** | Tendencias y exportación | Filtrar, exportar PDF/Excel | Responsable, rango fechas |
| **Centro de notificaciones** | Alertas y comunicaciones | Marcar leído, filtrar, eliminar | Tipo, prioridad, leído |
| **Manual de operaciones** | Documentación y onboarding | Navegar guías, tutorial, chat IA | — |
| **Administración de usuarios** | Gestión de usuarios por admins | Crear, editar, activar/desactivar | — |

**Nota:** Admin de usuarios está marcado en spec como **pendiente**; el proyecto ya tiene una base implementada (listado, detalle, formulario, activar/desactivar).

---

## 4. Entidad principal del negocio

**Acción diaria (`acciones_diarias`)**. Es el núcleo del sistema:

- Cada registro = una tarea con responsable, fecha, hora límite, evidencia esperada.
- Tiene flujo de estados: Pendiente → Hoy → En_Ejecucion → Hecho → Verificado; con rama Bloqueado.
- Se vincula a: KPI, OKR, proceso, área, cliente; puede tener evidencias, historial, dependencias y asignación multi-área.

Otras entidades clave: **usuarios** (perfil extendido), **kpis** (sagrados + metas), **notificaciones**, **medicion_disciplina** (por usuario/día).

---

## 5. Acciones principales del usuario

| Acción | Quién | Cambios en sistema |
|--------|-------|--------------------|
| Crear operación | Todos autenticados | Insert en `acciones_diarias`, `accion_historial`, opcional `accion_areas_asignadas` |
| Editar operación | Dueño o admin | Update registro, `updated_at`, historial si cambia estado |
| Cambiar estatus | Dueño (mayoría); DG/Sistemas (Verificado) | Update estado, notificación, historial, posible recálculo KPI y cascada |
| Subir evidencia | Dueño o admin | Storage bucket `evidencias`, `accion_evidencias`, `evidencia_cargada`/`evidencia_adjunta` |
| Agregar dependencia | Todos | Insert en `accion_dependencias`; notificaciones si bloqueadora se bloquea |
| Asignar a múltiples áreas | Dueño o admin | Insert en `accion_areas_asignadas` (estado pendiente) |
| Completar acción (Hecho) | Dueño | Requiere evidencia; cambio estado, notificación, desbloqueo dependientes |
| Verificar acción | Solo DG/Sistemas | Estado Verificado, notificación |
| Eliminar acción | Dueño o admin | Delete (cascada dependencias/evidencias) |
| Exportar reporte | Todos | PDF/Excel con datos filtrados (jsPDF, xlsx) |

---

## 6. Catálogos requeridos

| Catálogo | Uso en spec | Tabla / enum |
|----------|-------------|--------------|
| **Roles de sistema** | usuarios.rol, kpis.owner_rol, area_onepager_config | `user_role` enum; en proyecto también `catalog_roles` (catálogo administrable) |
| **Estados de acción** | acciones_diarias.estado, Kanban, filtros | `action_status` enum; en proyecto también `statuses` (catálogo) |
| **Prioridades** | acciones_diarias.prioridad | `prioridad_nc` enum; en proyecto `priorities` (catálogo) |
| **Tipos KPI (sagrados)** | kpis.nombre_kpi, semáforo | `nombre_kpi` enum |
| **Unidades KPI** | kpis.unidad | `kpi_unidad` enum |
| **Roles de aplicación** | user_roles, has_role(), is_admin() | `app_role` enum |
| **Clientes** | acciones_diarias.cliente_id, filtros | Tabla `clientes` |
| **Procesos** | acciones_diarias.proceso, okrs, reincidencias | Tabla `procesos` |
| **OKRs** | acciones_diarias.okr_impactado | Tabla `okrs` |
| **Áreas** | usuarios.area, filtros, panel de área | Spec: texto libre; en proyecto catálogo `areas` |

**Nota:** El proyecto ya tiene catálogos administrables (roles, áreas, statuses, priorities, dropdowns, catalog_kpis). La spec mezcla enums fijos con “catálogos”; se mantiene compatibilidad con ambos (usuarios.rol como texto desde catálogo según migración reciente).

---

## 7. KPIs requeridos

### 7.1 KPIs sagrados (tabla `kpis`, enum `nombre_kpi`)

| KPI | Qué mide | Fórmula conceptual | Unidad |
|-----|----------|--------------------|--------|
| OTIF | Entregas a tiempo y completas | (entregas_correctas / total) × 100 | porcentaje |
| Incidencias | Incidentes de calidad | COUNT(incidencias del día) | numero |
| Evidencias T+0 | Evidencia el mismo día | (evidencias_hoy / total_esperadas) × 100 | porcentaje |
| DSO | Días promedio cobro | cuentas_por_cobrar / ventas_diarias | dias |
| Margen | Margen utilidad | (ingresos - costos) / ingresos × 100 | moneda |
| NPS | Satisfacción cliente | % promotores - % detractores | numero |

### 7.2 Semáforo

- Verde: cumplimiento ≥ umbral_alerta  
- Amarillo: umbral_critico ≤ cumplimiento < umbral_alerta  
- Rojo: cumplimiento < umbral_critico  

Configuración en `kpi_metas`: meta_valor, umbral_alerta, umbral_critico, periodo, notificar_a, activo.

### 7.3 Métricas de disciplina (por usuario/día)

- acciones_asignadas, acciones_cerradas_en_tiempo, porcentaje_cumplimiento, acciones_sin_evidencia, reincidencias, dias_consecutivos_en_verde.  
- **Estado:** tabla `medicion_disciplina` existe pero **no se calcula automáticamente** (TODO).

---

## 8. Reglas de negocio detectadas

### Acciones diarias

- No marcar "Hecho" sin evidencia cargada (cliente + trigger).
- Solo DG/Sistemas pueden Verificado (trigger).
- descripcion_accion: 10–500 caracteres; evidencia_esperada: mín 5 (trigger).
- Repetición: misma combinación KPI + proceso + responsable → `repeticion = true` (trigger).
- Responsable obligatorio; fecha default hoy; prioridad default P2_Media.
- (Soft) Acciones Verificado/Hecho no re-editar en UI.

### KPIs

- Cumplimiento se recalcula al cambiar estado de acciones vinculadas.
- Sin acciones para un KPI → 100% cumplimiento.
- Umbrales definen color semáforo; alertas a usuarios en `notificar_a`.

### Usuarios

- Nombre 2–100 caracteres.
- Trigger crea perfil en `usuarios` al registrarse; rol default Operaciones.
- Onboarding una vez (primer login).
- Usuario inactivo no asignable como responsable (lógica/validación).

### Seguridad (RLS)

- Usuario ve solo sus acciones (admins ven/editan todo).
- Notificaciones privadas por usuario.
- `user_roles` en tabla separada.

---

## 9. Permisos o restricciones detectadas

### Matriz resumida

- **Crear/editar acción propia, subir evidencia, exportar, ver reportes:** todos los roles.
- **Editar/ver/eliminar cualquier acción, verificar acción, gestionar catálogos, gestionar metas KPI, gestionar usuarios:** solo DG y Sistemas (y por extensión admin).
- **Ver todas las acciones:** solo DG/Sistemas; resto solo propias.
- **Filtro responsable en reportes:** solo admin (dropdown responsable).

### RLS por tabla (resumen)

- acciones_diarias: SELECT/UPDATE/DELETE dueño o admin; INSERT autenticado.
- usuarios: SELECT propio o admin; UPDATE propio; INSERT/DELETE según políticas.
- notificaciones: SELECT/UPDATE/DELETE propio.
- kpis, okrs, procesos, clientes: lectura autenticada; escritura admin.
- accion_evidencias: dueño o admin.
- accion_historial: lectura autenticada; insert por trigger.
- kpi_metas, kpi_mediciones, user_roles: según spec (admin para escritura, etc.).
- area_onepager_config, area_reportes_diarios, medicion_disciplina: según spec.

---

## 10. Vacíos, ambigüedades o decisiones pendientes

| # | Elemento | Estado | Acción |
|---|----------|--------|--------|
| 1 | Cálculo automático `medicion_disciplina` | No implementado | TODO: trigger o función programada |
| 2 | Panel administración usuarios | Spec: pendiente | Proyecto ya tiene base; alinear con spec |
| 3 | Recuperación de contraseña | No definido | TODO; no inventar flujo |
| 4 | Escalamiento automático | Parcial (campos existen) | TODO: lógica por tiempo |
| 5 | Flujo cascada entre áreas | Parcial (tabla existe) | TODO: notificación automática |
| 6 | Resumen diario automático | Edge function sin cron | TODO: configurar cron |
| 7 | Verificador dato vs gobierno | Ambiguo | TODO: definir UI/lógica |
| 8 | Dashboard multi-área (AllAreasOverview) | Parcial | Confirmar integración en nav |
| 9 | Burndown chart | Parcial | Confirmar integración |
| 10 | Filtros avanzados tabla acciones | Parcial | Completar integración |
| 11 | Fórmulas KPI reales (OTIF, DSO, NPS, Margen) | Pendiente | Fuentes de datos no conectadas; cálculo actual por acciones completadas |
| 12 | Permisos por área (ej. Operaciones solo su área) | No definido | No implementar sin spec |
| 13 | Detección reincidencias + alertas visibles | Parcial (trigger existe) | TODO: notificaciones/UI |
| 14 | Límite 1000 rows en queries | Riesgo | TODO: paginación o ventanas |

**Supuestos adoptados para no bloquear:**

- Área de usuario puede ser catálogo (`areas`) o texto según migración actual.
- Admin de usuarios incluye listado, detalle, formulario y activar/desactivar; gestión de contraseña y asignación explícita de app_role se marcan TODO donde aplique.
- Catálogos administrables (roles, áreas, statuses, priorities, dropdowns, catalog_kpis) se mantienen; conviven con enums donde la spec los exige (ej. action_status en BD).

---

*Análisis extraído de `dashboard-spec.md`. Versión 1.0.*
