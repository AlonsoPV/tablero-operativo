# Hotfix crítico de usuarios · 2026-11-19

Rama local `hotfix/usuarios-guard` sobre `main`. Contiene sólo:

- `20261119135000_guard_usuarios_privileges.sql` y su rollback, copiados sin cambios de `r1/agente-confiable`;
- `20261119136000_guard_privileged_area_membership.sql` y su rollback;
- el runner `scripts/test-hotfix-usuarios-guard.mjs`.

No incluye R0 ni R1, ni archivos ajenos. No se hizo push, merge ni ningún cambio remoto.

## Incidente: aplicación manual sin registro

Fuentes, todas de sólo lectura: logs de Postgres, `pg_stat_statements` y el catálogo de DEV y PROD.

| Hora UTC (DEV / PROD) | Archivo ejecutado completo, como `postgres` |
| --- | --- |
| 17:34:27 / 17:34:31 | R0 `20261118150000_direction_executive_scope.sql` |
| — / 17:34:38 y 17:36:16 | `20261119120000_assistant_op_log_read_audit.sql` (dos veces) |
| 17:36:29 / 17:36:34 | `20261119135000_guard_usuarios_privileges.sql` |
| 17:36:45 / 17:36:42 | A `20261119140000_r1_transversal_access.sql` |
| 17:36:55 / 17:37:02 | RC-05 `20261119150000_inactive_users_rls.sql` |
| 17:44:17 / 17:44:13 | Script B `apply_r1_revoke_legacy_okrs_area.sql` (PROD: `legacy_okrs_area_grants()` = false) |

Lo que indica la evidencia:

- **Origen manual.** Cada archivo se ejecutó entero, con finales de línea Windows, y DEV y PROD con segundos de diferencia: es el patrón del editor SQL. No hay rastro en las terminales ni en las transcripciones de agentes.
- **Código local.** Las 12 funciones de seguridad son idénticas en DEV y PROD, y el guard coincide con el archivo local.
- **Sin errores ni registro.** No hubo errores en la ventana 17:30–17:50 y el historial de migraciones no registra nada (DEV `20260819234939`, PROD `20260821055806`).
- **Sin indicios de explotación.** Ningún perfil cambió después de la carga masiva (PROD 2026-11-18 02:43 UTC, DEV 2026-10-28). RH tiene sólo sus miembros conocidos: en PROD Kanban (Dirección), Damaris y Alonso (Super Admin); en DEV Damaris.

**Pendiente del responsable:** confirmar quién ejecutó los archivos y si la aplicación de R0, A, RC-05, B y `20261119120000` fue intencional. Hasta entonces no se reconcilia el historial.

## Revisión de 135000 (activo en DEV y PROD)

- Funciones: `is_explicit_privilege_admin` es `SECURITY DEFINER`, pertenece a `postgres`, tiene `search_path = pg_catalog, public, pg_temp` y exige fila activa más Super Admin, admin de app, DG o Sistemas. No usa `can_manage_catalogs`, que antes de R0 incluía a Dirección.
- Trigger: `guard_usuarios_privileges` es invoker y sólo restringe sesiones `authenticated`/`anon`. Bloquea `id`, `user_id`, `rol` y `activo`.
- Grants: revoca el UPDATE de `anon`. `anon` no tiene EXECUTE sobre el helper.
- Las dependencias (`is_current_user_super_admin`, `is_app_admin`, `has_business_role`) pertenecen a `postgres` y tienen `search_path` fijo.
- **Hueco que no cubre (alto):** la pertenencia al área RH (texto `usuarios.area` o el RPC `settings_users_set_areas`) da `can_manage_org_hierarchy()` y `can_edit_any_org_hierarchy()`. Con eso se pueden listar usuarios con correo, editar áreas y jerarquía ajenas y, con A, asignarse OKRS (lectura transversal). `'RH'` es el único literal de área usado en autorización.

## 136000: cierre de la vía RH

- **Helpers.** `is_privileged_area_name(text)` contiene la lista fija `rh`. `can_grant_privileged_area(text)` es definer y devuelve true para un administrador explícito o un miembro activo de esa área (se conserva RC-02).
- **Triggers.** Son definer y deciden por el rol del JWT (`auth.role()`), así que cubren los RPC definer llamados por usuarios. `service_role` y las sesiones sin JWT no se restringen.
  - `usuario_areas`: al borrar una pertenencia privilegiada se anota en la transacción (`scrumban.privileged_area_released`). Insertar o mover a un área privilegiada exige `can_grant_privileged_area` o reinsertar exactamente lo que se borró en la misma transacción, que es como `settings_users_set_areas` reescribe las áreas. PostgREST no permite fijar ese GUC.
  - `usuarios.area`: entrar a RH exige `can_grant_privileged_area`, o que el texto refleje una pertenencia relacional ya aceptada (lo que hace la sincronización del área principal).
- **Grants.** Revoca de `anon` INSERT, DELETE, TRUNCATE, REFERENCES y TRIGGER en `usuarios`, y de `usuario_areas` además UPDATE. Revoca TRUNCATE de `authenticated` en ambas tablas.
- **Preámbulo.** Rechaza aplicarse sin 135000, con CREATE en `public` para `authenticated` o `anon`, o con funciones de roles no confiables.
- **Dependencias.** Sólo usa funciones anteriores a R0 (`normalize_business_role`, `user_belongs_to_area_name`) y la de 135000. No usa `system_key`, `can_manage_catalogs` ni objetos de R1. Es compatible con R0 y A desplegados (lo prueba la segunda pasada).

## Matriz de permisos

Columnas: «Antes» es PROD al iniciar el día; «Hoy» es lo desplegado (135000, R0, A, RC-05 y B); «Con 136000» es tras aplicar el hotfix nuevo.

| Actor | Operación | Antes | Hoy | Con 136000 |
| --- | --- | --- | --- | --- |
| Usuario ordinario (Operativo, Analista, Líder) | Cambiar su propio rol o activo | Sí (escalamiento) | No | No |
| | Cambiar su `user_id` o `id` | Sí | No | No |
| | Entrar a RH (texto o RPC) | Sí | **Sí** | No |
| | Nombre, áreas normales, propia jerarquía | Sí | Sí | Sí |
| Anónimo | UPDATE en `usuarios` (RLS lo dejaba sin filas) | Grant sí | No | No |
| | INSERT, DELETE o TRUNCATE en `usuarios` y `usuario_areas` | Grant sí | Grant sí | No |
| Inactivo (incluido Super Admin inactivo) | Reactivarse o cambiar su rol | Sí | No | No |
| | Entrar a RH | Sí | Sí | No |
| Dirección | Cambiar rol o activo ajeno | Sí (antes de R0) | No | No |
| | Asignar RH | Sí (antes de R0) | No (R0) | No |
| Miembro de RH (Kanban) | Editar áreas y jerarquía ajenas, asignar RH | Sí | Sí | Sí |
| | Cambiar rol o activo ajeno | Sí | No | No |
| Super Admin, admin de app, DG o Sistemas (activos) | Rol y activo ajenos; asignar RH | Sí | Sí | Sí |
| `service_role` o propietario | Todo | Sí | Sí | Sí |

## Evidencia de pruebas

Todo es local, en PGlite. Los usuarios se simulan con roles `authenticated` o `anon` y claims JWT, nunca con `service_role`.

- `scripts/test-hotfix-usuarios-guard.mjs`: **31/31**.
  - Reproduce antes del hotfix el autoescalamiento a super_admin, la entrada a RH por texto y por RPC, y los grants de `anon`.
  - 136000 se niega sin 135000; ambas migraciones rechazan un esquema inseguro y son idempotentes.
  - Batería por actor sobre el esquema anterior a R0 y R1, y otra vez con las definiciones de R0 y A del branch `r1/agente-confiable`. Cubre ordinarios, anónimo, inactivos, autoasignación de `app_role`, de rol de catálogo y de perfiles nuevos, los cinco tipos de administrador, el miembro de RH (asigna RH y edita sus propias áreas), salir de RH y no poder volver sin administrador, y `service_role`.
  - Dirección no asigna RH, ni antes ni después de R0.
  - El rollback reabre la vía y la reaplicación la cierra.
- Regresiones en `r1/agente-confiable`: runner R0 aprobado, R1 47/47, `npx vitest run` 763/763. El hotfix no toca TypeScript.

## Consecuencias

**Si la vía RH sigue abierta**, cualquier usuario activo puede hacerse administrador de organigrama:

- ver todos los usuarios y sus correos;
- reasignar jefes y reportes;
- asignar áreas a otros;
- con A, darse OKRS y leer todas las acciones de la empresa.

No requiere herramientas especiales: basta el perfil o una llamada REST con su propio token.

**Al aplicar 136000:**

- Quien no administra y escribe RH en su perfil recibe un error 42501 y debe pedirlo a un administrador o a un miembro de RH.
- Un miembro de RH que se quita RH no puede volver solo.
- Dirección ya no asigna RH. Antes de R0 podía; hoy R0 ya se lo impide.
- `anon` pierde grants que no usaba.
- No cambia el acceso de administradores, miembros de RH ni `service_role`.

**Riesgos residuales que no se corrigen aquí:**

- `settings_users_set_direct_reports` deja tomar como reportes a usuarios sin jefe. Hay que revisar si `team_kanban_*` da visibilidad por jerarquía.
- `can_edit_any_org_hierarchy` y varios `settings_users_*` usan `search_path = public` sin `pg_temp` explícito. Califican los objetos con `public.`, así que el riesgo es bajo.

## Procedimiento de aplicación (no ejecutado; requiere autorización por entorno)

Orden: DEV, verificación en DEV, y después PROD. Nunca `supabase db push`: empujaría R0 y R1. La CLI local está enlazada a PROD.

1. **Precheck de sólo lectura** en el entorno:
   ```sql
   select md5(pg_get_functiondef('public.guard_usuarios_privileges()'::regprocedure)) = '1acf5bb750f1ce3c99bf4deb847ebacc' as guard_ok,
          has_schema_privilege('authenticated','public','CREATE') or has_schema_privilege('anon','public','CREATE') as unsafe_schema,
          (select string_agg(distinct r.rolname, ',') from pg_proc p join pg_roles r on r.oid = p.proowner
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('is_explicit_privilege_admin','user_belongs_to_area_name','normalize_business_role')) as owners;
   ```
   Esperado: `guard_ok = true`, `unsafe_schema = false`, `owners = postgres`.
2. **Aplicar sólo** `supabase/migrations/20261119136000_guard_privileged_area_membership.sql` en una ejecución, por el editor SQL o con `psql "<URL del entorno>" -v ON_ERROR_STOP=1 -f <archivo>`. El archivo tiene su propio `begin`/`commit`.
3. **Registrar la versión** `20261119136000` en el historial después de cerrar el incidente, en el mismo paso de reconciliación que 135000, R0, A y RC-05, con `supabase migration repair --status applied <versión>` y `--db-url` para DEV.

## Verificación posterior

- Catálogo: existen los triggers `guard_privileged_area_membership` (sobre `usuario_areas`) y `guard_privileged_area_text` (sobre `usuarios`).
- Funciones: los cuatro helpers pertenecen a `postgres`, tienen `search_path` fijo y `anon` no tiene EXECUTE.
- Grants: `has_table_privilege('anon','public.usuarios','INSERT')`, `has_table_privilege('anon','public.usuario_areas','INSERT')` y `has_table_privilege('authenticated','public.usuarios','TRUNCATE')` devuelven false.
- Funcional, sólo en DEV y con autorización para crear cuentas sintéticas: sesiones JWT reales (ordinario, miembro de RH, DG, inactivo y anónimo) que repiten los casos del runner contra la API REST.
- Durante 24 h, revisar en los logs de Postgres los errores `Privileged area membership requires an administrator` para detectar flujos legítimos bloqueados.

## Recuperación

- **Inmediata**, sin borrar objetos:
  ```sql
  alter table public.usuario_areas disable trigger guard_privileged_area_membership;
  alter table public.usuarios disable trigger guard_privileged_area_text;
  ```
- **Completa:** `supabase/scripts/rollback_guard_privileged_area_membership.sql`. No restaura los grants revocados a `anon`.
- **No revertir 135000** salvo un bloqueo crítico verificado: su rollback reabre el autoescalamiento a super_admin.

## Recomendación

- **135000: GO para mantenerlo.** Ya está activo, es correcto y no se revierte.
- **136000 en DEV: GO** con autorización expresa, sin esperar al cierre del incidente.
- **136000 en PROD: GO condicionado** a la verificación en DEV y a una autorización expresa aparte.
- **Reconciliar el historial: NO-GO** hasta que el responsable confirme la aplicación manual de R0, A, RC-05, B y `20261119120000`.
