# Especificación Funcional — Tablero Operativo Q·Quiero
---
## 1. Resumen del Sistema
### Objetivo
Q·Quiero es un tablero operativo diario diseñado para controlar la ejecución de acciones críticas en empresas de logística y servicios. Su propósito es vincular cada tarea diaria a un KPI u OKR medible, asegurando rendición de cuentas, trazabilidad y disciplina operativa.
### Problema que resuelve
| Problema | Cómo lo resuelve |
|---|---|
| Tareas sin responsable claro | Cada acción requiere un responsable obligatorio |
| Falta de evidencia de ejecución | No se puede completar una acción sin evidencia adjunta |
| Desconexión entre tareas y metas | Cada acción se vincula a un KPI y/o OKR |
| Sin visibilidad de bloqueos | Estado "Bloqueado" con causa raíz y responsable de resolución |
| Falta de métricas de disciplina | Medición automática de cumplimiento por usuario y día |
| Comunicación fragmentada | Notificaciones automáticas por cambios de estado y dependencias |
| Decisiones sin datos | Semáforo de KPIs con umbrales configurables y alertas |
### Quién lo utiliza
Líderes de área, responsables operativos y directivos de una empresa de logística. Cada usuario tiene un rol específico que determina su visibilidad y permisos.
### Tipo de decisiones que permite tomar
- ¿Qué acciones están bloqueadas y por qué?
- ¿Quién está cumpliendo y quién no?
- ¿Qué KPIs están en riesgo hoy?
- ¿Dónde hay reincidencias en fallas operativas?
- ¿Qué áreas tienen dependencias cruzadas que afectan el flujo?
---
## 2. Tipos de Usuario
### 2.1 Roles del sistema (`user_role`)
Cada usuario tiene un rol que define su área funcional y su alcance de visibilidad.
#### DG (Dirección General)
- **Responsabilidades**: Supervisión ejecutiva de todas las áreas.
- **Módulos**: Todos.
- **Acciones**: CRUD de acciones, verificar acciones completadas, acceso total a reportes, configurar KPIs y metas.
- **Persona clave**: Gerardo.
#### Sistemas
- **Responsabilidades**: Integridad de datos, lógica de semáforos, administración técnica.
- **Módulos**: Todos.
- **Acciones**: Igual que DG. Verificar acciones, administrar catálogos, gestionar usuarios.
- **Persona clave**: Gerardo.
#### Operaciones
- **Responsabilidades**: Ejecución logística diaria.
- **Módulos**: Dashboard, Kanban, Panel de Área, Disciplina, Calendario.
- **Acciones**: CRUD de acciones propias, subir evidencia, ver KPI OTIF.
- **Persona clave**: Irhec.
#### Planeación
- **Responsabilidades**: Soporte y planeación operativa.
- **Módulos**: Dashboard, Kanban, Panel de Área, Disciplina.
- **Acciones**: CRUD de acciones propias, subir evidencia.
- **Persona clave**: Abraham.
#### Calidad
- **Responsabilidades**: Control de calidad y gestión de incidencias.
- **Módulos**: Dashboard, Kanban, Panel de Área, Disciplina.
- **Acciones**: CRUD de acciones propias, ver KPI Incidencias.
- **Persona clave**: Itzel.
#### Evidencias
- **Responsabilidades**: Gestión documental y cumplimiento de evidencia T+0.
- **Módulos**: Dashboard, Kanban, Panel de Área, Disciplina.
- **Acciones**: CRUD de acciones propias, ver KPI Evidencias T+0.
#### Finanzas
- **Responsabilidades**: Control financiero.
- **Módulos**: Dashboard, Kanban, Panel de Área, Disciplina.
- **Acciones**: CRUD de acciones propias, ver KPIs DSO y Margen.
#### Mantenimiento
- **Responsabilidades**: Mantenimiento de activos e infraestructura.
- **Módulos**: Dashboard, Kanban, Panel de Área, Disciplina.
- **Acciones**: CRUD de acciones propias.
- **Persona clave**: Nubia.
#### RH (Recursos Humanos)
- **Responsabilidades**: Gestión de personal.
- **Módulos**: Dashboard, Kanban, Panel de Área, Disciplina.
- **Acciones**: CRUD de acciones propias.
- **Persona clave**: Damaris.
#### Comercial
- **Responsabilidades**: Relación con clientes y ventas.
- **Módulos**: Dashboard, Kanban, Panel de Área, Disciplina.
- **Acciones**: CRUD de acciones propias, ver KPI NPS.
- **Persona clave**: Gildardo.
### 2.2 Roles de aplicación (`app_role`)
Determinan el nivel de acceso transversal, independiente del área funcional.
| Rol | Descripción |
|---|---|
| `admin` | Lectura y escritura de todo. Puede verificar acciones, gestionar catálogos, ver datos de todos los usuarios. |
| `viewer` | Solo lectura. No puede crear ni modificar registros. |
**Regla**: Los roles DG y Sistemas son tratados como admin de forma implícita por la función `is_admin()`.
---
## 3. Módulos del Dashboard
### 3.1 Dashboard Principal
- **Objetivo**: Resumen ejecutivo del estado operativo del día.
- **Información**: Tarjetas de métricas, tabla de acciones, semáforo KPI.
- **Acciones**: Crear acción, ver detalle, filtrar, navegar a Kanban.
- **Filtros**: Fecha, estado, prioridad, área, responsable.
- **Métricas**: Total acciones hoy, completadas, bloqueadas, sin evidencia.
### 3.2 Kanban Personal
- **Objetivo**: Ejecución individual de tareas mediante tablero visual.
- **Información**: Acciones del usuario organizadas por columnas de estado.
- **Acciones**: Drag & drop entre estados, subir evidencia, ver detalle.
- **Filtros**: Automático por usuario autenticado.
- **Métricas**: Temporizador de cuenta regresiva por acción.
### 3.3 Métricas de Disciplina
- **Objetivo**: Medir el cumplimiento individual del usuario.
- **Información**: Porcentaje de cumplimiento, acciones sin evidencia, racha de días en verde, reincidencias.
- **Acciones**: Consulta (solo lectura).
- **Filtros**: Por usuario (automático) o todos (admin).
- **Métricas**: `porcentaje_cumplimiento`, `acciones_sin_evidencia`, `dias_consecutivos_en_verde`, `reincidencias`.
### 3.4 Panel de Área
- **Objetivo**: Configuración y reporte diario por área funcional.
- **Información**: One-pager del área, checklist diario, métricas reportadas.
- **Acciones**: Completar checklist, subir evidencia por ítem, agregar notas, ver reportes de otras áreas.
- **Filtros**: Por rol/área (tabs).
- **Métricas**: Porcentaje de checklist completado.
### 3.5 Vista Calendario
- **Objetivo**: Visualización temporal de acciones.
- **Información**: Acciones distribuidas por fecha.
- **Acciones**: Navegación temporal, seleccionar día para ver acciones.
- **Filtros**: Rango de fechas.
### 3.6 Reportes Históricos
- **Objetivo**: Análisis de tendencias y exportación de datos.
- **Información**: Gráficas de tendencia de cumplimiento por período.
- **Acciones**: Filtrar por líder/responsable, exportar a PDF y Excel.
- **Filtros**: Responsable, rango de fechas.
- **Métricas**: Tendencia de cumplimiento, acciones por estado.
### 3.7 Centro de Notificaciones
- **Objetivo**: Alertas y comunicaciones del sistema.
- **Información**: Listado de notificaciones con prioridad y tipo.
- **Acciones**: Marcar como leído, filtrar por tipo/prioridad, eliminar.
- **Filtros**: Tipo, prioridad, leído/no leído.
### 3.8 Manual de Operaciones
- **Objetivo**: Documentación interactiva y onboarding.
- **Información**: Guías de uso, tutorial interactivo, chat con asistente IA.
- **Acciones**: Navegar documentación, completar tutorial, consultar asistente.
### 3.9 Administración de Usuarios (pendiente)
- **Objetivo**: Gestión de usuarios del sistema por administradores.
- **Información**: Lista de usuarios con rol, área, estado activo.
- **Acciones**: Crear, editar, activar/desactivar usuarios.
- **Nota**: Este módulo está identificado como pendiente de implementación.
---
## 4. Dashboard Principal — Detalle
### 4.1 Métricas mostradas
| Métrica | Descripción | Cálculo |
|---|---|---|
| Acciones del día | Total de acciones con fecha = hoy | `COUNT(acciones WHERE fecha = today)` |
| Completadas | Acciones en estado Hecho o Verificado | `COUNT(WHERE estado IN ('Hecho', 'Verificado'))` |
| Bloqueadas | Acciones en estado Bloqueado | `COUNT(WHERE estado = 'Bloqueado')` |
| Sin evidencia | Acciones sin evidencia cargada | `COUNT(WHERE evidencia_cargada = false)` |
| Eficiencia operativa | % de acciones completadas vs total | `(completadas / total) × 100` |
| Tiempo restante | Cuenta regresiva a hora límite más próxima | Calculado en cliente cada 60 segundos |
### 4.2 Componentes visuales
| Componente | Descripción |
|---|---|
| **Tarjetas KPI** (`StatCard`) | Muestran métricas numéricas con ícono, valor y tendencia. Incluyen tooltip de ayuda. |
| **Semáforo KPI** (`KPISemaforoCard`) | Indicador visual verde/amarillo/rojo por KPI sagrado basado en umbrales configurados. |
| **Tabla de control** (`AccionesControlTable`) | Lista filtrable de todas las acciones del día con estado, responsable, hora límite y prioridad. |
| **Indicadores de alerta** | Badges de color en acciones bloqueadas, próximas a vencer o sin evidencia. |
| **Burndown Chart** (`BurndownChart`) | Gráfica de progreso de acciones completadas vs pendientes a lo largo del día. |
### 4.3 Filtros disponibles
| Filtro | Tipo de control | Aplica a |
|---|---|---|
| Fecha | Selector de fecha (datepicker) | Todas las vistas |
| Estado | Multi-select (chips) | Tabla de acciones |
| Prioridad | Multi-select | Tabla de acciones |
| Área | Dropdown | Tabla de acciones |
| Responsable | Dropdown (solo admin) | Tabla de acciones, Reportes |
| KPI | Dropdown | Semáforo, Filtros |
| Cliente | Dropdown | Tabla de acciones |
### 4.4 Acciones disponibles desde el Dashboard
| Acción | Rol requerido | Descripción |
|---|---|---|
| Ver detalle de acción | Dueño o admin | Abre modal con información completa, historial y evidencias |
| Crear nueva acción | Todos (autenticados) | Botón "+" abre formulario de creación |
| Cambiar a vista Kanban | Todos | Navega a tablero Kanban personal |
| Exportar reporte | Todos | Genera PDF o Excel con datos filtrados |
| Ver semáforo KPI | Todos | Visualización del estado de KPIs sagrados |
---
## 5. Gestión de Operaciones (Acciones Diarias)
### 5.1 Campos principales
| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| `id` | UUID | Auto | Generado automáticamente |
| `descripcion_accion` | Texto | Sí | Mínimo 10, máximo 500 caracteres |
| `responsable` | UUID (FK → usuarios) | Sí | Usuario válido y activo |
| `fecha` | Date | Sí | Default: fecha actual |
| `hora_limite` | Time | Sí | Formato HH:MM |
| `evidencia_esperada` | Texto | Sí | Mínimo 5 caracteres |
| `estado` | Enum | No | Default: `Pendiente` |
| `prioridad` | Enum | No | Default: `P2_Media` |
| `kpi_afectado` | UUID (FK → kpis) | No | KPI válido |
| `okr_impactado` | UUID (FK → okrs) | No | OKR válido |
| `proceso` | UUID (FK → procesos) | No | Proceso válido |
| `area` | Texto | No | Texto libre |
| `cliente_id` | UUID (FK → clientes) | No | Cliente válido |
| `evidencia_cargada` | Boolean | No | Default: false |
| `evidencia_adjunta` | Texto (URL) | No | URL del archivo |
| `causa_raiz` | Texto | No | Requerido si estado = Bloqueado |
| `responsable_bloqueo` | UUID (FK → usuarios) | No | Usuario asignado para resolver bloqueo |
| `escalado` | Boolean | No | Default: false |
| `fecha_escalamiento` | Timestamp | No | Automático al escalar |
| `notas_escalamiento` | Texto | No | Notas del escalamiento |
| `repeticion` | Boolean | No | Calculado automáticamente por trigger |
| `verificador_dato` | UUID (FK → usuarios) | No | Verificador de integridad de datos |
| `verificador_gobierno` | UUID (FK → usuarios) | No | Verificador de gobierno corporativo |
### 5.2 Estados posibles
| Estado | Código | Descripción | Quién puede asignar |
|---|---|---|---|
| Pendiente | `Pendiente` | Acción registrada, sin iniciar | Sistema (default al crear) |
| Hoy | `Hoy` | Programada para ejecución hoy | Usuario o sistema |
| En Ejecución | `En_Ejecucion` | En progreso activo | Usuario dueño de la acción |
| Bloqueado | `Bloqueado` | Detenida por impedimento externo o interno | Usuario dueño (requiere `causa_raiz`) |
| Hecho | `Hecho` | Completada con evidencia | Usuario dueño (requiere `evidencia_cargada = true`) |
| Verificado | `Verificado` | Validada por autoridad | Solo DG o Sistemas |
### 5.3 Flujo del proceso
```
Pendiente → Hoy → En_Ejecucion → Hecho → Verificado
                        ↓
                    Bloqueado
                        ↓
                  (resolver causa raíz)
                        ↓
                    En_Ejecucion
```
**Reglas del flujo:**
1. Una acción solo puede pasar a `Hecho` si tiene evidencia cargada (`evidencia_cargada = true`).
2. Una acción solo puede pasar a `Verificado` si el usuario tiene rol DG o Sistemas.
3. Al pasar a `Bloqueado`, se requiere completar el campo `causa_raiz`.
4. Si una acción tiene el mismo KPI, proceso y responsable que una anterior, el sistema marca `repeticion = true` automáticamente.
5. Cada cambio de estado genera una entrada en el historial de auditoría.
6. Cada cambio de estado genera una notificación al responsable.
---
## 6. Acciones del Usuario
### 6.1 Crear operación (acción diaria)
- **Qué hace**: Registra una nueva acción diaria en el sistema.
- **Quién puede**: Todos los usuarios autenticados.
- **Campos requeridos**: `descripcion_accion`, `responsable`, `hora_limite`, `evidencia_esperada`.
- **Campos opcionales**: `kpi_afectado`, `okr_impactado`, `proceso`, `area`, `cliente_id`, `prioridad`, áreas adicionales (multi-área).
- **Cambios en el sistema**: Inserta registro en `acciones_diarias`. Genera entrada en `accion_historial` (tipo: creación). Si hay áreas adicionales, crea registros en `accion_areas_asignadas`.
### 6.2 Editar operación
- **Qué hace**: Modifica los datos de una acción existente.
- **Quién puede**: Dueño de la acción o admin.
- **Campos editables**: Todos excepto `id`, `created_at`, `responsable` (solo admin puede reasignar).
- **Cambios en el sistema**: Actualiza registro. Actualiza `updated_at`. Genera entrada en historial si cambia estado.
### 6.3 Cambiar estatus
- **Qué hace**: Mueve la acción entre estados del flujo.
- **Quién puede**: Dueño para la mayoría de estados. Solo DG/Sistemas para `Verificado`.
- **Campos requeridos**: `causa_raiz` (si → Bloqueado), `evidencia_cargada` (si → Hecho).
- **Cambios en el sistema**: Actualiza `estado`. Genera notificación. Genera entrada en historial. Si la acción tiene KPI vinculado, recalcula cumplimiento KPI. Si la acción es bloqueadora de otras, genera notificaciones de cascada.
### 6.4 Subir evidencia
- **Qué hace**: Adjunta un archivo como prueba de ejecución.
- **Quién puede**: Dueño de la acción o admin.
- **Campos requeridos**: Archivo (imagen, PDF, documento).
- **Cambios en el sistema**: Sube archivo a storage (bucket `evidencias`). Crea registro en `accion_evidencias`. Actualiza `evidencia_cargada = true` y `evidencia_adjunta` en la acción. Genera notificación de evidencia.
### 6.5 Agregar dependencia
- **Qué hace**: Vincula una acción como bloqueadora o dependiente de otra.
- **Quién puede**: Todos los usuarios autenticados.
- **Campos requeridos**: `accion_bloqueadora_id`, `accion_dependiente_id`, `tipo_dependencia`.
- **Cambios en el sistema**: Crea registro en `accion_dependencias`. Si la acción bloqueadora se bloquea, notifica a los dueños de acciones dependientes.
### 6.6 Asignar a múltiples áreas
- **Qué hace**: Extiende una acción para que involucre áreas adicionales.
- **Quién puede**: Dueño de la acción o admin.
- **Campos requeridos**: `area`, `usuario_asignado` (opcional), `orden_flujo`.
- **Cambios en el sistema**: Crea registros en `accion_areas_asignadas` con estado `pendiente`. El área asignada puede aceptar o rechazar.
### 6.7 Completar acción (marcar como Hecho)
- **Qué hace**: Indica que la acción fue ejecutada.
- **Quién puede**: Dueño de la acción.
- **Requisito**: `evidencia_cargada` debe ser `true`.
- **Cambios en el sistema**: Cambia estado a `Hecho`. Genera notificación. Si hay acciones dependientes, las desbloquea y notifica.
### 6.8 Verificar acción
- **Qué hace**: Valida que la acción fue correctamente ejecutada.
- **Quién puede**: Solo DG o Sistemas.
- **Cambios en el sistema**: Cambia estado a `Verificado`. Genera notificación. Cierra el ciclo de la acción.
### 6.9 Eliminar acción
- **Qué hace**: Elimina una acción del sistema.
- **Quién puede**: Dueño de la acción o admin.
- **Cambios en el sistema**: Elimina registro de `acciones_diarias`. Las dependencias y evidencias asociadas se eliminan en cascada.
### 6.10 Exportar reporte
- **Qué hace**: Genera un archivo descargable con los datos filtrados.
- **Quién puede**: Todos los usuarios autenticados.
- **Formatos**: PDF (vía jsPDF) y Excel (vía xlsx).
- **Datos exportados**: Acciones filtradas con estado, responsable, fecha, prioridad y KPI.
---
## 7. Historial y Seguimiento
### 7.1 Historial de auditoría (`accion_historial`)
Cada acción mantiene un registro cronológico de todos los cambios relevantes.
| Evento registrado | Trigger | Datos almacenados |
|---|---|---|
| Creación de acción | `log_accion_creation` | Estado inicial, usuario creador |
| Cambio de estado | `log_accion_status_change` | Estado anterior, estado nuevo, descripción |
| Carga de evidencia | `log_accion_status_change` | `evidencia_cargada: false → true` |
| Actualización de causa raíz | `log_accion_status_change` | Valor anterior y nuevo de `causa_raiz` |
### 7.2 Campos del historial
| Campo | Descripción |
|---|---|
| `accion_id` | Acción relacionada |
| `usuario_id` | Usuario que realizó el cambio |
| `campo_modificado` | Nombre del campo que cambió |
| `valor_anterior` | Valor antes del cambio |
| `valor_nuevo` | Valor después del cambio |
| `tipo_cambio` | Categoría: `estado`, `evidencia`, `bloqueo` |
| `descripcion` | Texto descriptivo del cambio |
| `created_at` | Marca temporal del cambio |
### 7.3 Visualización
El historial se presenta de forma cronológica en el componente `AccionTimeline` dentro del diálogo de detalle de cada acción. Muestra iconos y colores diferenciados por tipo de cambio.
---
## 8. Administración de Usuarios
### 8.1 Campos del usuario
| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| `id` | UUID | Auto | Generado automáticamente |
| `user_id` | UUID (FK → auth.users) | Sí | Referencia a autenticación |
| `nombre` | Texto | Sí | Mínimo 2, máximo 100 caracteres |
| `rol` | Enum (`user_role`) | Sí | Default: `Operaciones` |
| `area` | Texto | No | Área funcional |
| `activo` | Boolean | No | Default: `true` |
| `onboarding_completed` | Boolean | No | Default: `false` |
### 8.2 Creación automática de perfil
Al registrarse un usuario vía autenticación, el trigger `handle_new_user` crea automáticamente un registro en la tabla `usuarios` con:
- `nombre`: Extraído de metadata o derivado del email.
- `rol`: Extraído de metadata o default `Operaciones`.
- `activo`: `true`.
- `onboarding_completed`: `false`.
### 8.3 Acciones disponibles (panel de administración — pendiente)
| Acción | Quién puede | Descripción |
|---|---|---|
| Crear usuario | Admin | Registro manual de nuevo usuario |
| Editar usuario | Admin | Modificar nombre, rol, área |
| Activar/desactivar | Admin | Cambiar campo `activo` |
| Ver detalle | Admin, propio usuario | Ver información completa del perfil |
| Gestión de contraseña | Pendiente | No implementado. Requiere flujo de "olvidé mi contraseña" |
| Asignar rol de aplicación | Admin | Crear/modificar registro en `user_roles` |
### 8.4 Estado actual
El panel de administración de usuarios **no está implementado**. Los usuarios se crean automáticamente al registrarse. La gestión manual requiere acceso directo al backend.
---
## 9. Catálogos del Sistema
### 9.1 Roles (`user_role`)
| Valor | Descripción | Uso |
|---|---|---|
| `DG` | Dirección General | Asignación de usuarios, permisos de verificación |
| `Sistemas` | Sistemas y Datos | Asignación de usuarios, permisos de verificación |
| `Operaciones` | Logística | Asignación de usuarios, rol default |
| `Planeacion` | Planeación/Soporte | Asignación de usuarios |
| `Calidad` | Control de Calidad | Asignación de usuarios |
| `Evidencias` | Gestión Documental | Asignación de usuarios |
| `Finanzas` | Finanzas | Asignación de usuarios |
| `Mantenimiento` | Mantenimiento | Asignación de usuarios |
| `RH` | Recursos Humanos | Asignación de usuarios |
| `Comercial` | Comercial | Asignación de usuarios |
**Dónde se usa**: Tabla `usuarios.rol`, tabla `kpis.owner_rol`, tabla `area_onepager_config.rol`, formulario de registro.
### 9.2 Estados de acción (`action_status`)
| Valor | Color asociado | Uso |
|---|---|---|
| `Pendiente` | Gris | Estado inicial |
| `Hoy` | Azul | Programada para hoy |
| `En_Ejecucion` | Púrpura | En progreso |
| `Bloqueado` | Rojo | Impedida |
| `Hecho` | Verde | Completada |
| `Verificado` | Teal | Validada |
**Dónde se usa**: Tabla `acciones_diarias.estado`, columnas del Kanban, filtros, semáforo.
### 9.3 Prioridades (`prioridad_nc`)
| Valor | Etiqueta | Uso |
|---|---|---|
| `P1_Critica` | Crítica | Acciones urgentes que requieren atención inmediata |
| `P2_Media` | Media (default) | Prioridad estándar |
| `P3_Baja` | Baja | Acciones de menor urgencia |
**Dónde se usa**: Tabla `acciones_diarias.prioridad`, filtros, ordenamiento.
### 9.4 Tipos de KPI (`kpi_type`)
| Valor | Nombre legible | Owner | Unidad |
|---|---|---|---|
| `OTIF` | On-Time In-Full | Operaciones | Porcentaje |
| `Incidencias` | Incidencias de Calidad | Calidad | Número |
| `Evidencias_T_mas_cero` | Evidencias T+0 | Evidencias | Porcentaje |
| `DSO` | Days Sales Outstanding | Finanzas | Días |
| `Margen` | Margen de Utilidad | Finanzas | Moneda |
| `NPS` | Net Promoter Score | Comercial | Número |
**Dónde se usa**: Tabla `kpis.nombre_kpi`, semáforo KPI, formulario de creación de acción.
### 9.5 Unidades de KPI (`kpi_unit`)
| Valor | Descripción |
|---|---|
| `porcentaje` | Valores 0-100% |
| `numero` | Valores enteros o decimales |
| `dias` | Días (para DSO) |
| `moneda` | Valores monetarios |
**Dónde se usa**: Tabla `kpis.unidad`, presentación de valores en semáforo.
### 9.6 Roles de aplicación (`app_role`)
| Valor | Descripción |
|---|---|
| `admin` | Acceso total de lectura y escritura |
| `viewer` | Solo lectura |
**Dónde se usa**: Tabla `user_roles.role`, función `has_role()`, función `is_admin()`.
### 9.7 Clientes
| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | Texto | Nombre del cliente |
| `contacto_nombre` | Texto | Nombre del contacto principal |
| `contacto_email` | Texto | Email del contacto |
| `activo` | Boolean | Si el cliente está activo |
| `notas` | Texto | Notas adicionales |
**Dónde se usa**: Tabla `acciones_diarias.cliente_id`, filtros de acciones.
### 9.8 Procesos
| Campo | Tipo | Descripción |
|---|---|---|
| `nombre_proceso` | Texto | Nombre del proceso |
| `owner_usuario` | UUID | Usuario dueño del proceso |
**Dónde se usa**: Tabla `acciones_diarias.proceso`, tabla `okrs.proceso`, detección de reincidencias.
### 9.9 OKRs
| Campo | Tipo | Descripción |
|---|---|---|
| `nombre_okr` | Texto | Nombre del objetivo |
| `descripcion` | Texto | Descripción detallada |
| `proceso` | UUID | Proceso vinculado |
| `owner_usuario` | UUID | Dueño del OKR |
| `periodo` | Texto | Período de evaluación (default: trimestral) |
| `activo` | Boolean | Si el OKR está activo |
**Dónde se usa**: Tabla `acciones_diarias.okr_impactado`, formulario de creación.
---
## 10. KPIs del Sistema
### 10.1 KPIs Sagrados
| KPI | Qué mide | Fórmula conceptual | Periodicidad | Unidad |
|---|---|---|---|---|
| **OTIF** | Entregas a tiempo y completas | `(entregas_correctas / total_entregas) × 100` | Diaria | Porcentaje |
| **Incidencias** | Incidentes de calidad reportados | `COUNT(incidencias del día)` | Diaria | Número |
| **Evidencias T+0** | Evidencia entregada el mismo día | `(evidencias_hoy / total_evidencias_esperadas) × 100` | Diaria | Porcentaje |
| **DSO** | Días promedio de cobro | `(cuentas_por_cobrar / ventas_diarias)` | Diaria | Días |
| **Margen** | Margen de utilidad operativa | `(ingresos - costos) / ingresos × 100` | Diaria | Moneda |
| **NPS** | Satisfacción del cliente | `% promotores - % detractores` | Diaria | Número |
### 10.2 Sistema de semáforo
El cumplimiento de cada KPI se calcula automáticamente y se presenta con código de color:
| Color | Condición | Significado |
|---|---|---|
| 🟢 Verde | `cumplimiento ≥ umbral_alerta` | KPI en meta |
| 🟡 Amarillo | `umbral_critico ≤ cumplimiento < umbral_alerta` | KPI en riesgo |
| 🔴 Rojo | `cumplimiento < umbral_critico` | KPI crítico |
### 10.3 Cálculo de cumplimiento
El cumplimiento se calcula por la función `check_kpi_compliance()`:
1. Para cada KPI con meta activa y período `diario`:
2. Contar acciones del día vinculadas a ese KPI.
3. Contar acciones en estado `Hecho` o `Verificado`.
4. Calcular porcentaje: `(completadas / total) × 100`.
5. Si no hay acciones para el KPI, se considera 100%.
6. Comparar con umbrales para determinar color.
7. Insertar/actualizar medición en `kpi_mediciones`.
8. Si está por debajo de umbrales, generar alertas a usuarios configurados.
### 10.4 Metas configurables (`kpi_metas`)
| Campo | Descripción |
|---|---|
| `meta_valor` | Valor objetivo del KPI |
| `umbral_alerta` | Valor por debajo del cual se activa alerta amarilla |
| `umbral_critico` | Valor por debajo del cual se activa alerta roja |
| `periodo` | Frecuencia de evaluación (default: diario) |
| `notificar_a` | Lista de UUIDs de usuarios a notificar |
| `activo` | Si la meta está activa |
### 10.5 Métricas de disciplina (por usuario/día)
| Métrica | Descripción |
|---|---|
| `acciones_asignadas` | Total de acciones asignadas en el día |
| `acciones_cerradas_en_tiempo` | Completadas antes de la hora límite |
| `porcentaje_cumplimiento` | Porcentaje de cumplimiento |
| `acciones_sin_evidencia` | Acciones marcadas como hechas sin evidencia |
| `reincidencias` | Misma falla en mismo KPI/proceso |
| `dias_consecutivos_en_verde` | Racha de días con >90% cumplimiento |
**Estado actual**: La tabla `medicion_disciplina` existe pero **no se calcula automáticamente**. Requiere implementación de trigger o función programada.
---
## 11. Reglas de Negocio
### Acciones diarias
| # | Regla | Tipo |
|---|---|---|
| 1 | No se puede marcar como "Hecho" sin evidencia cargada | Validación cliente + trigger |
| 2 | Solo DG o Sistemas pueden verificar acciones (estado `Verificado`) | Trigger `validate_accion` |
| 3 | La descripción debe tener entre 10 y 500 caracteres | Trigger `validate_accion` |
| 4 | La evidencia esperada debe tener mínimo 5 caracteres | Trigger `validate_accion` |
| 5 | Si misma combinación de KPI + proceso + responsable ya existió antes, se marca `repeticion = true` | Trigger `check_action_repetition` |
| 6 | Cada acción requiere un responsable obligatorio | Constraint NOT NULL |
| 7 | La fecha default es hoy | Default `CURRENT_DATE` |
| 8 | La prioridad default es `P2_Media` | Default value |
| 9 | Acciones en estado `Verificado` o `Hecho` no deberían ser re-editadas (soft rule) | Lógica de UI |
### KPIs
| # | Regla |
|---|---|
| 10 | El cumplimiento se recalcula automáticamente al cambiar estado de acciones vinculadas a un KPI |
| 11 | Si no hay acciones para un KPI, se considera 100% cumplimiento |
| 12 | Los umbrales de alerta y crítico definen el color del semáforo |
| 13 | Las alertas de KPI se envían a los usuarios configurados en `notificar_a` |
### Usuarios
| # | Regla |
|---|---|
| 14 | El nombre debe tener entre 2 y 100 caracteres |
| 15 | Al registrarse se crea automáticamente un perfil en `usuarios` vía trigger |
| 16 | Si no se especifica rol, se asigna `Operaciones` por defecto |
| 17 | El onboarding se muestra una sola vez (al primer login) |
| 18 | Un usuario inactivo no debería poder ser asignado como responsable |
### Seguridad (RLS)
| # | Regla |
|---|---|
| 19 | Cada usuario solo ve sus propias acciones (excepto admins) |
| 20 | Los admins ven y editan todo |
| 21 | Las notificaciones son privadas por usuario |
| 22 | Los roles de aplicación se almacenan en tabla separada (`user_roles`), nunca en el perfil |
---
## 12. Notificaciones y Alertas
### 12.1 Notificaciones por cambio de estado (trigger `notify_status_change`)
| Evento | Destinatario | Prioridad | Icono |
|---|---|---|---|
| Acción bloqueada | Responsable + responsable de bloqueo | Alta / Urgente | 🚫 / ⚠️ |
| Acción completada (Hecho) | Responsable | Normal | ✅ |
| Acción verificada | Responsable | Normal | ✓ |
| Acción en ejecución | Responsable | Normal | ▶️ |
| Otro cambio de estado | Responsable | Baja | 📋 |
### 12.2 Notificación por evidencia (trigger `notify_evidence_upload`)
| Evento | Destinatario | Prioridad |
|---|---|---|
| Evidencia subida | Responsable de la acción | Normal |
### 12.3 Notificaciones de dependencia
| Evento | Trigger | Destinatario | Prioridad |
|---|---|---|---|
| Acción bloqueadora se bloquea | `notify_dependency_impact` | Dueños de acciones dependientes | Urgente |
| Acción bloqueadora se completa | `notify_dependency_resolved` | Dueños de acciones dependientes | Normal |
### 12.4 Alertas de KPI (función `check_kpi_compliance`)
| Evento | Destinatario | Prioridad |
|---|---|---|
| KPI por debajo de umbral crítico | Usuarios en `notificar_a` | Urgente |
| KPI por debajo de umbral de alerta | Usuarios en `notificar_a` | Alta |
### 12.5 Alertas de proximidad a vencimiento
- Verificación cada 60 segundos en el cliente.
- Alerta 15 minutos antes de la hora límite.
- **Limitación**: Solo funciona con la aplicación abierta (client-side).
---
## 13. Permisos del Sistema
### 13.1 Matriz de permisos por rol
| Acción | DG | Sistemas | Operaciones | Planeación | Calidad | Evidencias | Finanzas | Mantenimiento | RH | Comercial |
|---|---|---|---|---|---|---|---|---|---|---|
| Crear acción | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editar acción propia | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editar cualquier acción | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Verificar acción | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver todas las acciones | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver solo acciones propias | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subir evidencia | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gestionar catálogos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gestionar KPI metas | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Exportar reportes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver reportes históricos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Eliminar acción propia | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Eliminar cualquier acción | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
### 13.2 Permisos por tabla (RLS)
| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `acciones_diarias` | Dueño o admin | Autenticado | Dueño o admin | Dueño o admin |
| `usuarios` | Propio o admin | Propio | Propio | No permitido |
| `notificaciones` | Propio | Autenticado | Propio | Propio |
| `kpis` | Autenticado | Admin | Admin | Admin |
| `okrs` | Autenticado | Admin | Admin | No permitido |
| `procesos` | Autenticado | Admin | Admin | No permitido |
| `clientes` | Autenticado | Admin | Admin | Admin |
| `accion_evidencias` | Autenticado | Dueño o admin | No permitido | Dueño o admin |
| `accion_historial` | Autenticado | Autenticado | No permitido | No permitido |
| `kpi_metas` | Autenticado | Admin | Admin | Admin |
| `kpi_mediciones` | Autenticado | Autenticado | Autenticado | No permitido |
| `user_roles` | Propio o admin | Admin | Admin | Admin |
| `area_onepager_config` | Todos | Admin | Admin | Admin |
| `area_reportes_diarios` | Autenticado | Propio | Propio o admin | Admin |
| `medicion_disciplina` | Propio o admin | Admin | Admin | No permitido |
---
## 14. Vacíos y Decisiones Pendientes
| # | Elemento | Estado | Notas |
|---|---|---|---|
| 1 | **Cálculo automático de `medicion_disciplina`** | ❌ Pendiente | La tabla existe pero no hay trigger ni función que la llene. La vista de disciplina estará vacía sin datos. |
| 2 | **Panel de administración de usuarios** | ❌ Pendiente | No hay pantalla para que admins gestionen usuarios (crear, editar, activar/desactivar). |
| 3 | **Recuperación de contraseña** | ❌ Pendiente | No hay flujo de "olvidé mi contraseña". |
| 4 | **Escalamiento automático** | 🟡 Parcial | Campos `escalado`, `fecha_escalamiento` existen pero no hay lógica automática que escale por tiempo. |
| 5 | **Flujo en cascada entre áreas** | 🟡 Parcial | Tabla `accion_flujo_cascada` existe, se pueden crear flujos, pero la notificación automática entre áreas no está implementada. |
| 6 | **Resumen diario automático** | 🟡 Parcial | Edge function `daily-summary` existe pero no tiene cron job configurado para ejecución periódica. |
| 7 | **Verificador de dato vs verificador de gobierno** | ❓ Ambiguo | Campos existen en `acciones_diarias` pero no hay UI ni lógica que diferencie los dos tipos de verificación. |
| 8 | **Dashboard multi-área (AllAreasOverview)** | 🟡 Parcial | Componente existe pero no se confirma integración en navegación principal. |
| 9 | **Burndown chart** | 🟡 Parcial | Componente creado pero integración en vistas no confirmada. |
| 10 | **Filtros avanzados en tabla de acciones** | 🟡 Parcial | Componente `AccionFilters` existe, integración parcial. |
| 11 | **Definición final de fórmulas KPI** | ❓ Pendiente | Las fórmulas conceptuales están definidas pero las fuentes de datos reales para OTIF, DSO, NPS, Margen no están conectadas. El cálculo actual se basa solo en acciones completadas. |
| 12 | **Reglas de permisos avanzados** | ❓ Pendiente | No hay granularidad para permisos por área (ej. Operaciones solo edita acciones de área Logística). |
| 13 | **Automatización de detección de reincidencias** | 🟡 Parcial | Trigger `check_action_repetition` existe pero no genera notificaciones ni alertas visibles. |
| 14 | **Límite de queries (1000 rows)** | ⚠️ Riesgo | No se maneja explícitamente en consultas. Si hay >1000 acciones en un día, se perderían datos. |
---
## 15. Recomendaciones de Mejora
### Corto plazo (próximo sprint)
| # | Mejora | Impacto |
|---|---|---|
| 1 | Implementar cálculo automático de `medicion_disciplina` vía trigger | Alto — habilita la vista de disciplina |
| 2 | Crear panel de administración de usuarios | Alto — necesario para gestión operativa |
| 3 | Implementar flujo de recuperación de contraseña | Alto — usabilidad básica |
| 4 | Ampliar RLS de `usuarios` para permitir lectura de nombres por usuarios autenticados | Alto — resuelve el problema de ver nombres de responsables en acciones |
### Mediano plazo
| # | Mejora | Impacto |
|---|---|---|
| 5 | Implementar escalamiento automático por tiempo (si acción no avanza en X horas, escalar) | Medio — mejora gestión de bloqueos |
| 6 | Configurar cron job para `daily-summary` edge function | Medio — habilita resúmenes diarios automáticos |
| 7 | Integrar notificaciones por email (operación vencida, bloqueo, KPI crítico) | Medio — mejora comunicación |
| 8 | Implementar dark mode toggle en la UI | Bajo — preferencia de usuario |
| 9 | Agregar confirmación antes de cambiar estado en Kanban (drag & drop) | Bajo — previene cambios accidentales |
### Largo plazo
| # | Mejora | Impacto |
|---|---|---|
| 10 | Integración con Slack para notificaciones | Medio — canal adicional |
| 11 | Dashboards personalizados por usuario | Medio — flexibilidad |
| 12 | Auditoría completa con IP y dispositivo | Bajo — compliance |
| 13 | Modo offline / PWA | Bajo — funcionalidad sin conexión |
| 14 | Tests automatizados para triggers SQL | Medio — previene regresiones |
| 15 | Conectar fuentes de datos reales para KPIs (ERP, CRM) | Alto — KPIs reflejarían datos reales |
---
*Documento generado el 2026-03-13. Versión 2.0.*
