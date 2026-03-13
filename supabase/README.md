# Supabase — Tablero Operativo

## Migraciones

- **Esquema inicial:** `migrations/20260313120000_initial_schema.sql`
- **Rol super admin:** `migrations/20260313130000_add_super_admin_role.sql` (enum `super_admin`, políticas y funciones para asignarlo).

### Aplicar con Supabase CLI (recomendado)

```bash
# Enlazar proyecto (solo una vez)
npx supabase link --project-ref TU_PROJECT_REF

# Aplicar migraciones pendientes
npx supabase db push
```

### Aplicar manualmente en el Dashboard

1. En [Supabase Dashboard](https://app.supabase.com) → tu proyecto → **SQL Editor**.
2. Copia el contenido de `migrations/20260313120000_initial_schema.sql`.
3. Ejecuta el script.

**Nota:** Si el trigger `on_auth_user_created` en `auth.users` falla por permisos, créalo desde el SQL Editor (ya conectado como owner) o documenta la creación de perfiles en `usuarios` por otro medio (p. ej. Edge Function o desde el backend).

## Contenido del esquema

- **Enums:** `user_role`, `app_role` (admin, super_admin, viewer), `action_status`, `prioridad_nc`, `nombre_kpi`, `kpi_unidad`, `notificacion_prioridad`, `area_asignacion_estado`
- **Tablas principales:** `usuarios`, `procesos`, `clientes`, `kpis`, `okrs`, `acciones_diarias`
- **Tablas de soporte:** `accion_evidencias`, `accion_historial`, `accion_dependencias`, `accion_areas_asignadas`, `accion_flujo_cascada`, `kpi_mediciones`, `kpi_metas`, `medicion_disciplina`, `notificaciones`, `area_onepager_config`, `area_reportes_diarios`, `checklist_items_completados`, `user_roles`
- **Triggers:** `updated_at` en tablas con ese campo; `handle_new_user` al insertar en `auth.users`
- **RLS:** políticas básicas en `usuarios`, `acciones_diarias`, `accion_evidencias`, `accion_historial`, `notificaciones`, `user_roles`, `medicion_disciplina`

### Asignar el primer Super Admin

Solo un **super_admin** puede asignar o quitar roles en `user_roles`. El primero se crea ejecutando una de estas funciones **desde el SQL Editor** (o con la service_role key):

```sql
-- Por UUID del usuario en auth.users
SELECT set_first_super_admin('uuid-del-usuario-auth');

-- Por email (busca en usuarios + auth.users)
SELECT set_first_super_admin_by_email('admin@tudominio.com');
```

Después, ese usuario puede asignar `admin` o `super_admin` a otros desde la app (si implementas la UI de gestión de usuarios).

Detalle en `docs/supabase-schema-proposal.md`.
