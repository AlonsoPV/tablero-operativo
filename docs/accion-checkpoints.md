# Checklist de validacion (accion_checkpoints)

## Decision de producto

- **Accion sin puntos:** permitido. Si no hay filas en `accion_checkpoints` para esa accion, no se exige checklist para pasar a **Hecho**.
- **Accion con puntos:** todos los registros **activos** deben tener `completado = true` para permitir **Hecho**.
- **Cierre automatico:** al marcar el ultimo punto pendiente, la accion pasa automaticamente a **Hecho**.
- **Evidencia:** la carga de evidencia queda como dato de seguimiento, pero no bloquea pasar a **Hecho** ni el cierre automatico por checklist.
- **Trazabilidad:** un punto ya **completado** no se puede eliminar ni editar en la UI; solo se puede desmarcar el check (se limpian `checked_at` / `checked_by`).
- **Campo `obligatorio`:** existe en BD para escalar reglas distintas; hoy todos los checkpoints activos no completados bloquean **Hecho** por igual.

## Base de datos

- Tabla: `accion_checkpoints` (migracion `20260313400000_accion_checkpoints.sql`).
- Trigger en `acciones_diarias`: antes de pasar a `Hecho`, si existe algun checkpoint `activo` y `completado = false`, se lanza error y se revierte el cambio.
- RPC `try_set_accion_hecho`: valida permisos y checklist completo en una transaccion. No exige evidencia.
- RPC `set_accion_checkpoint_completado`: marca/desmarca un punto y cierra automaticamente cuando ya no quedan checkpoints activos pendientes.
- RLS: lectura para autenticados; escritura si el usuario es responsable de la accion o admin, alineado con actualizacion de acciones.

## Frontend

- **Crear:** seccion *Puntos a validar* en el dialogo; se persisten con `insertMany` tras crear la accion.
- **Editar / seguimiento:** bloque *Checklist de validacion* con barra de avance, checkboxes y auditoria basica (`checked_by` / `checked_at` en tooltip y texto).
- **Validacion unica al pasar a Hecho:** `assertCanCloseAccion` / `assertCanCloseAccionFromAccion` en `src/services/accionCloseValidation.service.ts` valida checkpoints pendientes segun la regla actual.
- **Progreso en listas:** `useChecklistProgressByAccionIds` + `AccionChecklistProgressBadge` en tarjetas Kanban y tablas.
- **Mapa "pendiente bloquea Hecho":** `useCheckpointsPendingByAccionIds` reutiliza la misma query de progreso en cache.

## Mensaje unificado

Texto al bloquear por checkpoints:

`No puedes marcar esta accion como Hecha porque aun existen puntos de validacion pendientes.`

## Evolucion: solo checks obligatorios

- En servicio: `hasPendingBlockingHecho` / `pendingBlockingHechoByAccionIds` y `assertCanCloseAccion*` aceptan opcion `onlyObligatorio` / `onlyObligatorioBlocking` para una fase futura en la que solo `obligatorio = true` bloquee **Hecho**.
- Hoy no activar esa opcion en produccion si debe mantenerse el comportamiento actual (todos los activos incompletos bloquean).
