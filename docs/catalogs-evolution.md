# Evolución futura del módulo de Catálogos

Propuesta de siguientes fases para el módulo de Catálogos / Configuración.

---

## 1. Permisos por rol

- **Estado:** Arquitectura preparada (tabla `catalog_roles` con nombre/descripción; no confundir con `user_role` enum ni `user_roles` app_role).
- **Próximos pasos:**
  - Añadir tabla `role_permissions` (role_id, recurso, accion: crear/leer/actualizar/eliminar) o matriz de permisos por pantalla.
  - En el frontend, leer el rol del usuario (desde `user_roles` o perfil) y ocultar/deshabilitar acciones según permisos.
  - Reutilizar `catalog_roles` como catálogo de roles a los que se asignan permisos; vincular usuarios a uno o más de estos roles (por ejemplo en `usuarios` o tabla `usuario_roles`).

---

## 2. Auditoría de cambios de catálogo

- **Estado:** No implementado.
- **Propuesta:**
  - Tablas `catalog_audit_log` (o una por entidad: `roles_audit`, etc.) con: tabla_afectada, registro_id, campo, valor_anterior, valor_nuevo, usuario_id, created_at.
  - Triggers en Supabase `AFTER UPDATE` / `AFTER INSERT` que inserten en la tabla de auditoría.
  - Opcional: pantalla “Historial de cambios” por catálogo o por registro, filtrable por usuario y fecha.

---

## 3. Catálogos dependientes

- **Estado:** No implementado.
- **Casos de uso:** Opciones de un dropdown que dependen de otra (ej. región → ciudad). Áreas que dependen de una “dirección” o proceso.
- **Propuesta:**
  - Añadir en `dropdown_options` (o en una entidad nueva) un campo `parent_option_id` para jerarquía.
  - En `areas` o similares, campo opcional `parent_id` (self-reference) para árbol de áreas.
  - En el frontend, cargar opciones filtradas por padre y actualizar al cambiar el padre.

---

## 4. Fórmulas y motor de KPIs

- **Estado:** Tabla `catalog_kpis` con tipo (manual, calculado, informativo); sin motor de fórmulas.
- **Próximos pasos:**
  - Campo `formula` o `expression` en `catalog_kpis` (por ejemplo expresión o referencia a otra métrica).
  - Backend (Edge Function o job) que evalúe fórmulas con periodicidad configurada y escriba resultados en `kpi_mediciones` o tabla análoga.
  - Definir reglas de qué KPIs son “sagrados” (tabla `kpis` existente) vs configurables (`catalog_kpis`) y cómo se relacionan.

---

## 5. Configuración avanzada por área

- **Estado:** Catálogo `areas` listo para asignación a usuarios y filtros.
- **Evolución:**
  - Parámetros por área: umbrales, responsables, notificaciones (ej. tabla `area_config` o campos en `area_onepager_config`).
  - Dashboards o vistas que filtren por área y usen estos parámetros.
  - Posible relación `catalog_kpis` ↔ área (qué KPIs aplican a cada área).

---

## 6. Automatizaciones futuras

- **Ideas:**
  - Al activar/desactivar un estatus, notificar a responsables de acciones en ese estatus.
  - Al cambiar prioridad de un catálogo, reordenar o reasignar tareas (según reglas de negocio).
  - Sincronización entre `catalog_roles` y permisos en auth (roles de Supabase o custom claims).
  - Importación/exportación masiva de catálogos (CSV/Excel) con validación y preview.

---

## Resumen de tablas creadas (migración 20260313140000)

| Tabla | Uso |
|-------|-----|
| `catalog_roles` | Roles visibles; base para permisos por rol |
| `areas` | Áreas/departamentos; usuarios, filtros, reportes |
| `statuses` | Estatus operativos (orden, color, es_cierre) |
| `priorities` | Prioridades |
| `dropdown_catalogs` | Tipos de listas desplegables (key único) |
| `dropdown_options` | Opciones label/value por catálogo |
| `catalog_kpis` | KPIs configurables (unidad, tipo, meta, periodicidad) |

Evitar hard delete; usar campo `activo` para desactivar. Orden en statuses, priorities, dropdown_options y catalog_kpis preparado para drag-and-drop futuro.

---

## 7. Registro de dependencias entre catálogos

- **Estado:** Implementado en `src/features/catalogs/lib/catalog-registry.ts`.
- **Uso:** Definir qué tablas/módulos dependen de cada catálogo (ej. `usuarios` usa `catalog_roles` y `areas`). Permite en el futuro:
  - Advertir o bloquear desactivación si hay registros dependientes.
  - Mensajes de error claros al intentar eliminar.
- **Escalabilidad:** Añadir nuevas entradas en `CATALOG_DEPENDENCIES` cuando se conecten más módulos a catálogos.
