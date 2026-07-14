# Kanban por Equipos

## Alcance implementado

Se agrega un segundo nivel operativo independiente del Kanban Corporativo. La entrada `Kanban por Equipos` muestra las areas visibles para el usuario y, al seleccionar una, carga exclusivamente el tablero de esa area.

## Modelo de datos

- `area_lideres`: relacion muchos-a-muchos entre areas y lideres.
- `area_kanban_estados`: flujo configurable por area. Se inicializa con Pendiente, En proceso, Bloqueado, Validacion y Terminado.
- `acciones_equipo`: acciones privadas del equipo, responsable, prioridad, checklist, evidencia requerida, bloqueo y vencimiento.
- `escalamiento_historial`: auditoria inmutable con accion origen/corporativa, area origen/destino, lider, fecha, motivo y prioridad.

La relacion existente `usuario_areas` sigue siendo la fuente de pertenencia muchos-a-muchos y `usuarios.manager_user_id` la jerarquia directa.

Cada accion guarda ademas `lider_id`. Esta dimension evita mezclar equipos cuando varios lideres administran la misma area: la visibilidad se resuelve por area y lider propietario, no solo por el nombre del area.

El liderazgo por area se define al asignar areas (tabla `area_lideres`), no desde el perfil del usuario.

## Permisos

- Operativo: ve dentro de su area solo las acciones asignadas a el o creadas por el; puede crear para si mismo o su jefe directo.
- Lider: ve las acciones cuyo `lider_id` es el propio usuario dentro de las areas registradas en `area_lideres`; solo puede asignar a si mismo o a reportes directos que tambien pertenecen al area seleccionada.
- Administrador/Direccion: acceso a todas las areas.

Las reglas se validan en RPC y tambien mediante RLS. El frontend no es la barrera de seguridad.

Ejemplo: si Alonso lidera Compras y Operaciones, una persona que reporta a Alonso y pertenece a Compras + Mantenimiento participa en el tablero de Compras de Alonso, pero su pertenencia a Mantenimiento no expone acciones de Mantenimiento a Alonso. Esa persona puede abrir por separado los tableros de sus propias areas y solo ve las acciones asignadas o creadas por ella.

## Escalamiento

`team_kanban_escalate` valida que el usuario sea lider del area, crea la accion en `acciones_diarias`, marca la accion origen como escalada y registra el historial en una misma transaccion. Una accion no se duplica si se solicita escalar nuevamente.

## Dashboard

El encabezado del tablero calcula acciones abiertas, vencidas, bloqueadas, aging medio y criticas. La estructura conserva fechas de creacion/cierre para extender lead time e ICC con la definicion corporativa correspondiente.

## Despliegue

1. Aplicar `supabase/migrations/20260712160000_team_kanban_module.sql` en desarrollo.
2. Registrar lideres en `area_lideres` (la pertenencia a areas permanece en `usuario_areas`).
3. Validar con cuentas Operativo, Lider y Administrador antes de promover a produccion.

## Archivos principales

- `src/features/team-kanban/TeamKanbanPage.tsx`: UX, tarjetas, tablero e indicadores.
- `src/features/team-kanban/service.ts`: acceso exclusivo mediante RPC.
- `src/features/team-kanban/types.ts`: contratos del modulo.
- `src/routes/index.tsx`, `src/constants/index.ts`, `src/components/layout/Sidebar.tsx`: ruta y navegacion.
- `src/features/auth/lib/permissions.ts`: acceso del rol operativo al nuevo modulo.
