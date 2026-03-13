# Tablero Operativo Q·Quiero — Documentación Funcional y Técnica
---
## 1. Resumen Ejecutivo
**Q·Quiero** es un tablero operativo diario diseñado para empresas de logística y servicios que necesitan controlar la ejecución de acciones críticas vinculadas a KPIs y OKRs. Permite a líderes de área registrar, dar seguimiento y verificar tareas diarias con evidencia obligatoria, asegurando rendición de cuentas y trazabilidad completa.
**Stack tecnológico:** React + Vite + TypeScript + Tailwind CSS + Lovable Cloud (Supabase).
---
## 2. Objetivo del Tablero
- Garantizar que cada acción diaria esté vinculada a un KPI u OKR medible.
- Eliminar la ambigüedad en la asignación de responsabilidades.
- Proveer visibilidad ejecutiva en tiempo real sobre el estado de operaciones.
- Forzar disciplina operativa mediante evidencia obligatoria y métricas de cumplimiento.
---
## 3. Problema que Resuelve
| Problema | Cómo lo resuelve |
|---|---|
| Tareas sin responsable claro | Cada acción requiere un responsable asignado obligatoriamente |
| Falta de evidencia de ejecución | No se puede marcar como "Hecho" sin evidencia cargada |
| Desconexión entre tareas y metas | Cada acción se vincula a un KPI y/o OKR |
| Sin visibilidad de bloqueos | Estado "Bloqueado" con causa raíz y responsable de resolución |
| Falta de métricas de disciplina | Medición automática de cumplimiento por usuario |
| Comunicación fragmentada | Notificaciones automáticas por cambios de estado y dependencias |
---
## 4. Tipos de Usuario y Permisos
### Roles del Sistema (`user_role`)
| Rol | Área | Permisos Especiales |
|---|---|---|
| **DG** | Dirección General | Verificar acciones, acceso total, admin |
| **Sistemas** | Sistemas y Datos | Verificar acciones, acceso total, admin |
| **Operaciones** | Logística | CRUD acciones propias, ver KPI OTIF |
| **Planeación** | Planeación/Soporte | CRUD acciones propias |
| **Calidad** | Control de Calidad | CRUD acciones propias, ver KPI Incidencias |
| **Evidencias** | Gestión Documental | CRUD acciones propias, KPI Evidencias T+0 |
| **Finanzas** | Finanzas | CRUD acciones propias, ver KPI DSO/Margen |
| **Mantenimiento** | Mantenimiento | CRUD acciones propias |
| **RH** | Recursos Humanos | CRUD acciones propias |
| **Comercial** | Comercial | CRUD acciones propias, ver KPI NPS |
### Roles de Aplicación (`app_role`)
| Rol | Descripción |
|---|---|
| `admin` | Acceso total (lectura/escritura de todo) |
| `viewer` | Solo lectura |
### Reglas de Acceso Clave
- **Solo DG y Sistemas** pueden mover acciones al estado `Verificado`.
- **Todos los usuarios autenticados** pueden crear acciones (botón "Nueva Acción" visible para todos).
- Las acciones solo son visibles para su responsable o administradores.
- Los usuarios solo pueden editar/eliminar sus propias acciones.
---
## 5. Módulos / Pantallas
### 5.1 Login (`LoginForm`)
- Formulario de email + contraseña.
- Registro con nombre, rol y email.
- Validación de email requerida antes de acceder.
### 5.2 Dashboard Ejecutivo (`MainApp` → vista `dashboard`)
- **Tarjetas de resumen**: Total acciones hoy, completadas, bloqueadas, sin evidencia.
- **Tabla de control de acciones** (`AccionesControlTable`): Lista filtrable de todas las acciones del día.
- **Semáforo KPI** (`KPISemaforoCard`): Estado visual (verde/amarillo/rojo) de cada KPI.
### 5.3 Kanban Personal (`MainApp` → vista `kanban`)
- **Tablero Kanban** (`KanbanBoard`): Columnas por estado (Pendiente → Hoy → En Ejecución → Bloqueado → Hecho → Verificado).
- Drag & drop para cambiar estado.
- Impide mover a "Hecho" sin evidencia.
- **Temporizador de cuenta regresiva** (`CountdownTimer`): Muestra tiempo restante hasta hora límite.
### 5.4 Métricas de Disciplina (`MainApp` → vista `disciplina`)
- **Tarjeta de disciplina** (`DisciplinaCard`): Porcentaje de cumplimiento, acciones sin evidencia, racha de días en verde, reincidencias.
### 5.5 Panel de Área (`AreaPanel`)
- Configuración one-pager por área.
- Checklist diario con evidencia por item.
- Reporte diario de métricas.
### 5.6 Vista Calendario (`CalendarView`)
- Visualización de acciones por fecha.
- Navegación temporal.
### 5.7 Manual de Operaciones (`/manual`)
- Documentación interactiva del sistema.
- Tutorial de onboarding para nuevos usuarios.
- Chat con asistente IA de operaciones.
### 5.8 Reportes Históricos (`HistoricalReports`)
- Filtrado por líder/responsable.
- Gráficas de tendencia de cumplimiento.
- Exportación a PDF/Excel.
### 5.9 Centro de Notificaciones (`NotificationCenter`)
- Notificaciones en tiempo real.
- Filtrado por tipo y prioridad.
- Marcado de leído/no leído.
---
## 6. Flujo Principal de Usuario
```
[Login] 
  → [Onboarding Tutorial] (si es primera vez)
  → [Dashboard Ejecutivo]
    → Ver resumen del día
    → Crear nueva acción (botón "+")
    → Ver detalle de acción existente
    → Cambiar a vista Kanban para ejecutar
      → Arrastrar acciones entre estados
      → Subir evidencia
      → Marcar como "Hecho"
    → DG/Sistemas verifican acciones completadas
  → [Panel de Área]
    → Completar checklist diario
    → Reportar métricas del área
  → [Reportes Históricos]
    → Analizar tendencias
    → Exportar reportes
```
---
## 7. Acciones Posibles por Módulo
### Dashboard
| Acción | Rol requerido |
|---|---|
| Ver estadísticas del día | Todos (solo propias o admin) |
| Crear nueva acción | Todos |
| Ver detalle de acción | Dueño o admin |
| Filtrar acciones | Todos |
### Kanban
| Acción | Rol requerido |
|---|---|
| Mover acción entre estados | Dueño o admin |
| Subir evidencia | Dueño o admin |
| Marcar como Hecho | Dueño (con evidencia) |
| Verificar acción | Solo DG/Sistemas |
### Crear/Editar Acción
| Campo | Obligatorio | Validación |
|---|---|---|
| Descripción | Sí | Mín 10, máx 500 caracteres |
| Responsable | Sí | UUID de usuario válido |
| Hora límite | Sí | Formato HH:MM |
| Evidencia esperada | Sí | Mín 5 caracteres |
| KPI afectado | No | FK a tabla kpis |
| OKR impactado | No | FK a tabla okrs |
| Proceso | No | FK a tabla procesos |
| Área | No | Texto libre |
| Cliente | No | FK a tabla clientes |
| Prioridad | No | P1_Critica, P2_Media, P3_Baja (default: P2) |
| Áreas adicionales | No | Multi-área con flujo en cascada |
### Panel de Área
| Acción | Rol requerido |
|---|---|
| Completar checklist items | Dueño del reporte |
| Subir evidencia por item | Dueño del reporte |
| Editar notas | Dueño o admin |
| Ver reportes de otras áreas | Todos |
---
## 8. Estructura de Datos
### Tablas Principales
```
usuarios
├── id (PK, uuid)
├── user_id (FK → auth.users)
├── nombre (text, NOT NULL)
├── rol (enum: user_role)
├── area (text)
├── activo (boolean, default: true)
├── onboarding_completed (boolean, default: false)
├── created_at, updated_at
acciones_diarias
├── id (PK, uuid)
├── fecha (date, default: today)
├── descripcion_accion (text, 10-500 chars)
├── responsable (FK → usuarios, NOT NULL)
├── hora_limite (time, NOT NULL)
├── evidencia_esperada (text, mín 5 chars)
├── evidencia_cargada (boolean, default: false)
├── evidencia_adjunta (text)
├── estado (enum: action_status, default: Pendiente)
├── kpi_afectado (FK → kpis)
├── okr_impactado (FK → okrs)
├── proceso (FK → procesos)
├── area (text)
├── cliente_id (FK → clientes)
├── prioridad (enum: prioridad_nc, default: P2_Media)
├── causa_raiz (text)
├── responsable_bloqueo (FK → usuarios)
├── escalado (boolean, default: false)
├── fecha_escalamiento (timestamp)
├── notas_escalamiento (text)
├── repeticion (boolean, default: false)
├── verificador_dato (FK → usuarios)
├── verificador_gobierno (FK → usuarios)
├── created_at, updated_at
kpis
├── id (PK, uuid)
├── nombre_kpi (enum: OTIF, Incidencias, Evidencias_T_mas_cero, DSO, Margen, NPS)
├── definicion_operable (text)
├── unidad (enum: porcentaje, numero, dias, moneda)
├── owner_rol (enum: user_role)
├── formula (text)
okrs
├── id (PK, uuid)
├── nombre_okr (text)
├── descripcion (text)
├── proceso (FK → procesos)
├── owner_usuario (FK → usuarios)
├── periodo (text, default: trimestral)
├── activo (boolean)
procesos
├── id (PK, uuid)
├── nombre_proceso (text)
├── owner_usuario (FK → usuarios)
```
### Tablas de Soporte
```
accion_evidencias          — Archivos de evidencia por acción
accion_historial           — Log de auditoría de cambios
accion_dependencias        — Dependencias entre acciones (bloquea/depende)
accion_areas_asignadas     — Asignación multi-área
accion_flujo_cascada       — Flujos de impacto entre áreas
kpi_mediciones             — Mediciones diarias calculadas por KPI
kpi_metas                  — Umbrales y alertas configurables por KPI
medicion_disciplina        — Métricas de disciplina por usuario/día
notificaciones             — Centro de notificaciones
clientes                   — Catálogo de clientes
area_onepager_config       — Configuración one-pager por área
area_reportes_diarios      — Reportes diarios de área
checklist_items_completados — Items de checklist completados
user_roles                 — Roles de aplicación (admin/viewer)
```
---
## 9. Estados de Procesos
### Flujo de Estados de Acciones
```
Pendiente → Hoy → En_Ejecucion → Hecho → Verificado
                        ↓
                    Bloqueado
                        ↓
                  (resolver) → En_Ejecucion
```
| Estado | Descripción | Quién puede asignar |
|---|---|---|
| `Pendiente` | Acción registrada, sin iniciar | Sistema (default) |
| `Hoy` | Programada para hoy | Usuario/Sistema |
| `En_Ejecucion` | En progreso activo | Usuario dueño |
| `Bloqueado` | Detenida por impedimento | Usuario dueño (requiere causa_raiz) |
| `Hecho` | Completada con evidencia | Usuario dueño (requiere evidencia) |
| `Verificado` | Validada por autoridad | Solo DG o Sistemas |
### Estados de Asignación Multi-Área
```
pendiente → aceptado / rechazado
```
### Estados de KPI (Semáforo)
```
verde    — Cumplimiento ≥ umbral_alerta
amarillo — Cumplimiento entre umbral_critico y umbral_alerta  
rojo     — Cumplimiento < umbral_critico
```
---
## 10. Filtros, Búsquedas y Vistas
### Filtros Disponibles
| Filtro | Ubicación | Tipo |
|---|---|---|
| Fecha | Dashboard, Reportes | Selector de fecha |
| Estado | Tabla de acciones | Multi-select |
| Responsable/Líder | Reportes históricos | Dropdown |
| Área | Panel de área | Tabs |
| KPI | Semáforo, Filtros | Dropdown |
| Prioridad | Filtros de acciones | Multi-select |
| Cliente | Filtros de acciones | Dropdown |
### Vistas
| Vista | Descripción |
|---|---|
| Dashboard Ejecutivo | Resumen de tarjetas + tabla + semáforo |
| Kanban Personal | Tablero drag & drop por estado |
| Disciplina | Métricas de cumplimiento por usuario |
| Calendario | Acciones por fecha |
| Reportes Históricos | Tendencias y exportación |
| Panel de Área | Checklist y configuración por área |
---
## 11. Notificaciones y Automatizaciones
### Notificaciones Automáticas (Triggers SQL)
| Evento | Notificación | Prioridad |
|---|---|---|
| Acción bloqueada | Al dueño + responsable de bloqueo | Alta/Urgente |
| Acción completada (Hecho) | Al dueño | Normal |
| Acción verificada | Al dueño | Normal |
| Acción en ejecución | Al dueño | Normal |
| Evidencia subida | Al dueño de la acción | Normal |
| Dependencia bloqueada | A dueños de acciones dependientes | Urgente |
| Dependencia resuelta | A dueños de acciones dependientes | Normal |
| KPI bajo umbral crítico | A usuarios configurados en `notificar_a` | Urgente |
| KPI bajo umbral alerta | A usuarios configurados en `notificar_a` | Alta |
### Automatizaciones
| Automatización | Mecanismo |
|---|---|
| Detección de repetición | Trigger `check_action_repetition` |
| Cálculo de cumplimiento KPI | Función `check_kpi_compliance` |
| Log de auditoría | Triggers `log_accion_status_change`, `log_accion_creation` |
| Cálculo % completado de reportes | Trigger `calculate_reporte_completion` |
| Creación automática de perfil | Trigger `handle_new_user` en auth.users |
| Actualización de `updated_at` | Trigger `update_updated_at_column` |
### Notificaciones en Tiempo Real
- Realtime habilitado vía Supabase channels en tabla `acciones_diarias`.
- Alerta 15 minutos antes de hora límite (verificación cada 60 segundos en cliente).
---
## 12. Métricas y KPIs
### KPIs Sagrados
| KPI | Unidad | Owner | Descripción |
|---|---|---|---|
| **OTIF** | Porcentaje | Operaciones | On-Time In-Full delivery |
| **Incidencias** | Número | Calidad | Incidentes de calidad |
| **Evidencias T+0** | Porcentaje | Evidencias | Evidencia entregada el mismo día |
| **DSO** | Días | Finanzas | Days Sales Outstanding |
| **Margen** | Moneda | Finanzas | Margen de utilidad |
| **NPS** | Número | Comercial | Net Promoter Score |
### Métricas de Disciplina (por usuario/día)
| Métrica | Descripción |
|---|---|
| `acciones_asignadas` | Total de acciones asignadas en el día |
| `acciones_cerradas_en_tiempo` | Completadas antes de hora límite |
| `porcentaje_cumplimiento` | % de cumplimiento |
| `acciones_sin_evidencia` | Acciones sin evidencia cargada |
| `reincidencias` | Misma falla en mismo KPI/proceso |
| `dias_consecutivos_en_verde` | Racha de días con >90% cumplimiento |
### Metas Configurables (`kpi_metas`)
- Meta valor objetivo por KPI.
- Umbral de alerta (amarillo).
- Umbral crítico (rojo).
- Período de evaluación (diario por defecto).
- Lista de usuarios a notificar.
---
## 13. Integraciones
| Integración | Estado | Propósito |
|---|---|---|
| **Lovable Cloud (Supabase)** | ✅ Activa | Base de datos, auth, storage, edge functions, realtime |
| **Storage (bucket: evidencias)** | ✅ Activa | Almacenamiento de archivos de evidencia |
| **Edge Functions** | ✅ Activa | `area-assistant`, `daily-summary`, `operations-assistant` |
| **Lovable AI** | ✅ Disponible | Asistente IA para áreas y operaciones |
| **Exportación PDF** | ✅ Activa | jsPDF + jspdf-autotable |
| **Exportación Excel** | ✅ Activa | xlsx |
| **Email (verificación)** | ✅ Activa | Verificación de email al registrarse |
---
## 14. Reglas de Negocio
### Acciones Diarias
1. **No se puede marcar como "Hecho" sin evidencia cargada.**
2. **Solo DG o Sistemas pueden verificar acciones** (estado `Verificado`).
3. La descripción debe tener entre 10 y 500 caracteres.
4. La evidencia esperada debe tener mínimo 5 caracteres.
5. Si una acción tiene el mismo KPI, proceso y responsable que una anterior, se marca como `repeticion = true`.
6. Cada acción requiere un responsable obligatorio.
7. La fecha default es hoy (`CURRENT_DATE`).
8. La prioridad default es `P2_Media`.
### KPIs
9. El cumplimiento se calcula automáticamente al cambiar estado de acciones vinculadas.
10. Si no hay acciones para un KPI, se considera 100% (nada que fallar).
11. Los umbrales de alerta y crítico definen el color del semáforo.
### Usuarios
12. El nombre debe tener entre 2 y 100 caracteres.
13. Al registrarse, se crea automáticamente un perfil en `usuarios` vía trigger.
14. Si no se especifica rol, se asigna `Operaciones` por defecto.
15. El onboarding se muestra una sola vez (al primer login).
### Seguridad (RLS)
16. Cada usuario solo ve sus propias acciones (excepto admins).
17. Los admins ven y editan todo.
18. Las notificaciones son privadas por usuario.
19. Los roles se almacenan en tabla separada (`user_roles`), nunca en el perfil.
---
## 15. Validaciones
### Validaciones a Nivel de Base de Datos (Triggers)
| Validación | Tabla | Tipo |
|---|---|---|
| Descripción 10-500 chars | `acciones_diarias` | Trigger `validate_accion` |
| Evidencia esperada ≥ 5 chars | `acciones_diarias` | Trigger `validate_accion` |
| Solo admin puede verificar | `acciones_diarias` | Trigger `validate_accion` |
| Nombre 2-100 chars | `usuarios` | Trigger `validate_usuario` |
### Validaciones a Nivel de Aplicación
| Validación | Ubicación |
|---|---|
| No "Hecho" sin evidencia | `useAcciones.tsx` (client-side + trigger) |
| Campos obligatorios en formularios | `CreateAccionModal` |
| Email válido en registro | `LoginForm` |
| Contraseña requerida | `LoginForm` |
---
## 16. Funcionalidades Pendientes o Ambiguas
| # | Funcionalidad | Estado | Notas |
|---|---|---|---|
| 1 | **Escalamiento automático** | 🟡 Parcial | Campos `escalado`, `fecha_escalamiento` existen pero no hay lógica automática de escalamiento por tiempo |
| 2 | **Flujo en cascada entre áreas** | 🟡 Parcial | Tabla `accion_flujo_cascada` existe, se pueden crear flujos, pero la notificación automática no está implementada |
| 3 | **Resumen diario automático** | 🟡 Parcial | Edge function `daily-summary` existe pero no hay cron job configurado |
| 4 | **Dashboard multi-área (AllAreasOverview)** | 🟡 Componente existe | No se confirma si está integrado en la navegación principal |
| 5 | **Burndown chart** | 🟡 Componente existe | `BurndownChart` creado pero integración en vistas no confirmada |
| 6 | **Importación/Exportación de áreas** | 🟡 Componente existe | `AreaImportExport` disponible |
| 7 | **Verificador de dato vs verificador de gobierno** | ❓ Ambiguo | Campos existen en `acciones_diarias` pero no hay UI ni lógica diferenciada |
| 8 | **Cálculo automático de `medicion_disciplina`** | ❌ Pendiente | La tabla existe pero no hay trigger/función que la llene automáticamente |
| 9 | **Recuperación de contraseña** | ❌ Pendiente | No hay flujo de "olvidé mi contraseña" |
| 10 | **Gestión de usuarios (admin)** | ❌ Pendiente | No hay pantalla para que admins gestionen usuarios |
| 11 | **Configuración de áreas desde UI** | 🟡 Parcial | Templates existen (`areaTemplates.ts`) pero no hay CRUD completo |
| 12 | **Filtros avanzados en tabla de acciones** | 🟡 Componente existe | `AccionFilters` disponible, integración parcial |
---
## 17. Riesgos y Huecos Detectados
### Riesgos de Seguridad
| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | RLS en `usuarios` permite que solo el propio usuario o admins lean registros — esto impide que otros usuarios vean nombres de responsables en acciones | 🔴 Alta | Necesita policy de lectura más amplia o vista pública de nombres |
| 2 | `handle_new_user` es `SECURITY DEFINER` — riesgo si se modifica | 🟡 Media | Mantener auditoría del trigger |
| 3 | No hay rate limiting en creación de acciones | 🟡 Media | Considerar límite por usuario/día |
### Riesgos Funcionales
| # | Riesgo | Severidad | Impacto |
|---|---|---|---|
| 4 | `medicion_disciplina` no se calcula automáticamente | 🔴 Alta | La vista de disciplina estará vacía sin datos manuales |
| 5 | El realtime check de deadlines solo funciona con la app abierta (client-side) | 🟡 Media | Los usuarios no recibirán alertas si no tienen la app abierta |
| 6 | No hay límite de 1000 rows manejado explícitamente en queries | 🟡 Media | Podría perder datos si hay >1000 acciones en un día |
| 7 | El campo `area` en `acciones_diarias` es texto libre, no normalizado | 🟡 Media | Inconsistencias en nombres de área |
| 8 | No hay backup automático ni política de retención de datos | 🟡 Media | Depende de Lovable Cloud |
| 9 | Los triggers de auditoría no tienen tests automatizados | 🟡 Media | Riesgo de regresiones silenciosas |
| 10 | El onboarding tutorial no se puede re-lanzar desde la UI (solo vía `resetOnboarding` en código) | 🟢 Baja | Funcionalidad existe pero no expuesta |
### Huecos de UX
| # | Hueco | Impacto |
|---|---|---|
| 11 | No hay indicador visual de "acción próxima a vencer" en la tabla principal | Usuarios podrían perder deadlines |
| 12 | No hay confirmación antes de cambiar estado en Kanban (drag & drop) | Cambios accidentales posibles |
| 13 | No hay modo offline / PWA | No funciona sin conexión |
| 14 | No hay dark mode toggle visible en la UI | Preferencia de usuario no controlable |
---
## Apéndice: Mapeo de Personas Clave
| Persona | Rol | Área |
|---|---|---|
| Gerardo | DG / Sistemas | Dirección General |
| Irhec | Operaciones | Logística |
| Abraham | Planeación | Planeación/Soporte |
| Nubia | Mantenimiento | Mantenimiento |
| Damaris | RH | Recursos Humanos |
| Itzel | Calidad | Control de Calidad |
| Gildardo | Comercial | Comercial |
---
*Documento generado el 2026-03-13. Versión 1.0.*
