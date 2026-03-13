# Análisis derivado de lovable-spec.md

Documento generado a partir de la especificación funcional. Base para modelo de datos y estructura del frontend.

---

## 1. Entidades principales

| Entidad | Descripción | Tabla Supabase |
|--------|-------------|-----------------|
| **Usuario** | Perfil extendido (nombre, rol de negocio, área, onboarding) | `usuarios` |
| **Acción diaria** | Tarea del día con responsable, hora límite, evidencia, estado | `acciones_diarias` |
| **KPI** | Indicador sagrado (OTIF, Incidencias, Evidencias T+0, DSO, Margen, NPS) | `kpis` |
| **OKR** | Objetivo trimestral vinculado a proceso | `okrs` |
| **Proceso** | Proceso con owner | `procesos` |
| **Cliente** | Catálogo de clientes | `clientes` |

### Entidades de soporte

- `accion_evidencias` — Archivos de evidencia por acción
- `accion_historial` — Auditoría de cambios
- `accion_dependencias` — Bloquea/depende entre acciones
- `accion_areas_asignadas` — Multi-área
- `accion_flujo_cascada` — Flujo entre áreas (TODO: notificación automática no implementada en spec)
- `kpi_mediciones` — Mediciones diarias por KPI
- `kpi_metas` — Umbrales y alertas
- `medicion_disciplina` — Métricas de disciplina por usuario/día (TODO: spec indica que no hay cálculo automático)
- `notificaciones` — Centro de notificaciones
- `area_onepager_config` — Config one-pager por área
- `area_reportes_diarios` — Reportes diarios de área
- `checklist_items_completados` — Items de checklist
- `user_roles` — admin/viewer

---

## 2. Módulos del sistema (pantallas)

| Módulo | Vista / Ruta | Componentes clave (spec) |
|--------|---------------|---------------------------|
| **Auth** | `/login` | LoginForm, registro con nombre/rol/email |
| **Dashboard** | `/dashboard` | Tarjetas resumen, AccionesControlTable, KPISemaforoCard |
| **Operaciones (Kanban)** | `/kanban` | KanbanBoard, CountdownTimer, drag & drop |
| **Disciplina** | `/disciplina` | DisciplinaCard (cumplimiento, sin evidencia, racha, reincidencias) |
| **Áreas** | `/areas` o por área | AreaPanel, checklist, reporte diario |
| **Calendario** | `/calendario` | CalendarView, acciones por fecha |
| **Reportes** | `/reportes` | HistoricalReports, filtros, export PDF/Excel |
| **Notificaciones** | (header o `/notificaciones`) | NotificationCenter |
| **Manual** | `/manual` | Documentación, onboarding, chat IA |
| **Configuración** | `/settings` | (existente en boilerplate) |

---

## 3. Flujos de usuario (resumen)

1. **Login** → Onboarding (si primera vez) → Dashboard.
2. **Dashboard**: ver resumen, crear acción (+), ver detalle, ir a Kanban.
3. **Kanban**: arrastrar estados, subir evidencia, marcar Hecho (solo con evidencia); DG/Sistemas: Verificado.
4. **Panel de Área**: checklist diario, evidencia por ítem, reporte de métricas.
5. **Reportes**: filtrar por líder/responsable, ver tendencias, exportar PDF/Excel.

---

## 4. Métricas del dashboard (spec)

- Total acciones hoy
- Completadas (Hecho + Verificado)
- Bloqueadas
- Sin evidencia
- Semáforo KPI: verde / amarillo / rojo por KPI (umbrales en `kpi_metas`)
- Disciplina: % cumplimiento, acciones sin evidencia, racha días verde, reincidencias

---

## 5. Operaciones por módulo

- **Dashboard**: ver estadísticas (propias o admin), crear acción, ver detalle, filtrar.
- **Kanban**: mover estado (dueño/admin), subir evidencia, marcar Hecho (con evidencia), Verificar (solo DG/Sistemas).
- **Crear/Editar acción**: campos obligatorios (descripción, responsable, hora límite, evidencia esperada); opcionales KPI, OKR, proceso, área, cliente, prioridad.
- **Panel de Área**: completar checklist, subir evidencia por ítem, editar notas; ver reportes de otras áreas.

---

## 6. Modelo de datos inicial Supabase (resumen)

Basado en §8 y §9 de la spec. Detalle en `docs/supabase-schema-proposal.md` y tipos en `src/types/`.

### Enums

- `user_role`: DG, Sistemas, Operaciones, Planeación, Calidad, Evidencias, Finanzas, Mantenimiento, RH, Comercial
- `action_status`: Pendiente, Hoy, En_Ejecucion, Bloqueado, Hecho, Verificado
- `prioridad_nc`: P1_Critica, P2_Media, P3_Baja
- `nombre_kpi`: OTIF, Incidencias, Evidencias_T_mas_cero, DSO, Margen, NPS
- `app_role`: admin, viewer

### Tablas principales (ya definidas en spec)

- `usuarios`, `acciones_diarias`, `kpis`, `okrs`, `procesos`, `clientes`
- Soporte: ver lista en §1 entidades de soporte.

---

## 7. Estructura de features (frontend)

```
src/features/
  auth          — Login, registro, onboarding (primera vez)
  operations    — Acciones diarias, Kanban, crear/editar acción
  metrics       — KPIs, semáforo, disciplina
  reports       — Reportes históricos, exportación
  areas         — Panel de área, checklist, reportes diarios
  notifications — Centro de notificaciones
  calendar      — Vista calendario
  manual        — Manual de operaciones, tutorial (opcional en v1)
```

---

## 8. TODOs y ambigüedades (spec §16)

- Escalamiento automático: campos existen, lógica automática no.
- Flujo cascada: tabla existe, notificación automática no implementada.
- Resumen diario: edge function existe, cron no configurado.
- Verificador dato vs gobierno: campos en BD, sin UI diferenciada.
- Cálculo automático de `medicion_disciplina`: pendiente en spec.
- Recuperación de contraseña: pendiente.
- Gestión de usuarios (admin): pendiente.
- RLS: spec indica riesgo — solo propio usuario o admins leen `usuarios`; puede impedir ver nombres en acciones (policy de lectura a revisar).
