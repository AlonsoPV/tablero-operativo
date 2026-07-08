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

| Rol | Ver organigrama | Editar jerarquía |
|-----|-----------------|------------------|
| Admin / DG / Sistemas / super_admin (rol negocio) | Todo | Sí |
| Dirección | Todo | Sí |
| **super_admin / admin (app_role en user_roles)** | Todo | Sí |
| Operativo / Analista | Su cadena + equipo visible vía RPC | No |

Helpers: `canEditOrgHierarchyByRole()` en `permissions.ts`.

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
```

Casos cubiertos en `orgHierarchy.test.ts`:

1. Detección de ciclos
2. Subordinados directos
3. Cadena de mando
4. Cadena de escalamiento
5. Construcción del bosque jerárquico
6. Filtro por área

## Despliegue

Aplicar migraciones en Supabase:

```bash
npx supabase db push
```

Incluye `20260708163000_usuarios_org_hierarchy.sql` y `20260708174500_usuarios_update_hierarchy_access.sql` (corrige error PGRST116 al guardar jerarquía).
