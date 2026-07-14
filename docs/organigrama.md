# Módulo Organigrama

Documentación del módulo de jerarquía organizacional en Tablero Operativo.

## Cambios de base de datos

Migración: `supabase/migrations/20260708163000_usuarios_org_hierarchy.sql`

### Columna nueva

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `manager_user_id` | `uuid` nullable | FK → `usuarios(id)` ON DELETE SET NULL |

### Reglas en base de datos

- `CHECK`: un usuario no puede ser su propio jefe (`usuarios_manager_not_self`).
- Trigger `trg_usuarios_validate_manager`:
  - Rechaza jefe inactivo en asignaciones nuevas.
  - Rechaza ciclos jerárquicos (`would_create_hierarchy_cycle`).
- Índice: `idx_usuarios_manager_user_id`.

### RPCs

| Función | Uso |
|---------|-----|
| `org_chart_list()` | Listado visible según permisos |
| `org_chart_command_chain(p_user_id)` | Cadena de mando ascendente |
| `settings_users_list()` / `settings_users_get()` | Incluyen `manager_user_id` |

## Componentes creados

```
src/features/org-chart/
├── pages/OrgChartPage.tsx          # Vista principal del organigrama
├── components/
│   ├── OrgChartTree.tsx            # Árbol visual
│   ├── OrgChartFiltersBar.tsx      # Filtros (área, rol, usuario, activos)
│   └── OrgChartUserPanel.tsx       # Ficha individual con acciones
├── hooks/useOrgChart.ts
├── services/orgChart.service.ts
├── utils/orgHierarchy.ts           # Árbol, ciclos, escalamiento
└── types/orgChart.types.ts

src/features/users/components/UserHierarchySection.tsx  # Detalle de usuario
```

## Rutas y navegación

- Ruta: `/organigrama` (`ROUTES.ORG_CHART`)
- Sidebar: **Organigrama**
- Catálogos → Organización → **Organigrama**
- Administración de jerarquía: `/settings/users/:id` (campo **Reporta a**)

## Validaciones aplicadas

| Validación | Cliente | Servidor |
|------------|---------|----------|
| No reportarse a sí mismo | Sí | Sí (CHECK + trigger) |
| No ciclos jerárquicos | Sí | Sí (`would_create_hierarchy_cycle`) |
| Jefe activo al asignar | Sí (dropdown) | Sí (trigger) |
| Sin jefe → “Sin responsable superior” | Sí | — |
| Sin subordinados → estado vacío claro | Sí | — |

## Permisos

| Rol / condición | Ver organigrama | Editar jerarquía de cualquiera | Editar la propia (perfil) |
|-----|-----------------|------------------|---------------------------|
| **Operativo** | Sí | No | **Sí** |
| **Dirección** | Sí | No | **Sí** |
| **Analista** | Sí | No | **No** |
| **Super Admin** | **Sí** (no aparece en el árbol) | **Sí** (admin vía usuarios/RH) | **No** (no participa) |
| Área **RH** | Sí | **Sí** | Sí |

Helpers FE:
- `canEditOwnOrgProfileByRole` → Operativo / Dirección
- `canEditOrgHierarchyByRole` → RH o Super Admin
- `canEditOrgUserHierarchy` → RH/Super Admin o propia ficha (si el rol puede)
- `isExcludedFromOrgChartByRole` → Super Admin

SQL:
- `org_chart_list()` → excluye Super Admin; Super Admin no puede consultar el módulo
- `can_edit_own_org_profile(rol)` / `can_edit_any_org_hierarchy()` (RH o Super Admin)
- `settings_users_update_org_hierarchy` → valida roles, ciclos, inactivos y audita

### Multi-área

- `usuarios.area` = área **principal** (compatibilidad).
- `usuario_areas` = membresías (una marcada `is_primary`).
- RPC `settings_users_set_areas` (propio o org managers).
- Filtros de organigrama matchean principal **o** adicionales.

### Jerarquía desde perfil

- `settings_users_update_manager`: org managers o el propio usuario.
- `settings_users_set_direct_reports`: org managers (cualquier reporte) o self (solo sin líder / ya reportan a mí).
- `settings_users_hierarchy_peers`: candidatos para el editor de perfil.

## Uso de `manager_user_id`

- **Organigrama:** construye el árbol padre → hijos.
- **Reporta a / Le reportan:** relación directa 1:N.
- **Cadena de mando:** recorrido ascendente con `buildCommandChainRows()` o RPC `org_chart_command_chain`.
- **Escalamientos futuros:** `buildEscalationChain(userId, users)` devuelve `[responsable, jefe, jefe del jefe, ...]` para reglas como *acción roja vencida → responsable → jefe directo → dirección*.

Ejemplo (futuro):

```typescript
import { buildEscalationChain } from '@/features/org-chart/utils/orgHierarchy'

const chain = buildEscalationChain(responsableId, users)
const nextEscalationTarget = chain[1] ?? null // jefe directo
```

## Pruebas

```bash
npm test -- src/features/org-chart/utils/orgHierarchy.test.ts
npm test -- src/features/users/utils/userFormMappers.test.ts
npm test -- src/features/auth/lib/permissions.test.ts
```

Casos cubiertos en `orgHierarchy.test.ts`:

1. Detección de ciclos
2. Subordinados directos
3. Cadena de mando
4. Cadena de escalamiento
5. Construcción del bosque jerárquico
6. Filtro por área (principal o adicionales)

## Puntuacion por completar el organigrama

Migracion: `supabase/migrations/20260714123000_org_chart_governance_gamification.sql`
(reemplaza el modelo +4/+4 de `20260713190000_org_chart_profile_points.sql`).

Actividad unica: **Perfil organizacional completado**.

| Estado | Puntos |
|--------|--------|
| Completo (Reporta a, o root con Supervisa a) | **+15** |
| Incompleto tras haber estado completo | **-15** |
| Nunca completado | **0** |

- Una sola fila por usuario en `user_org_chart_scores` (`profile_complete_points`, `ever_completed`).
- UPSERT: editar varias veces no multiplica puntos.
- `org_hierarchy_audit` registra editor, fecha, valores previos/nuevos y delta de puntos.
- RPC `org_chart_governance_stats()` y util FE `buildOrgGovernanceStats` preparan indicadores de dashboard.
- Super Admin no acumula estos puntos ni forma parte del organigrama.

## Despliegue

Aplicar migraciones en Supabase:

```bash
npx supabase db push
```

Incluye:

- `20260708163000_usuarios_org_hierarchy.sql`
- `20260708174500_usuarios_update_hierarchy_access.sql`
- `20260712120000_usuario_areas_and_self_hierarchy.sql` (multi-área + self hierarchy + RH)
- `20260713163000_org_chart_visibility_and_rh_edit.sql` (todos ven; solo RH edita a terceros)
- `20260713190000_org_chart_profile_points.sql` (puntaje legacy 0/+4 por bloque)
- `20260714123000_org_chart_governance_gamification.sql` (+15/-15, auditoria, Super Admin fuera)
