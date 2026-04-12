# KPIs.md — Análisis, mapeo al producto e implementación

Este documento cumple los pasos 1 y 2 del plan de trabajo sobre `docs/KPIs.md`: resume la especificación, la relaciona con el tablero operativo actual y fija qué se implementa en código sin duplicar el modelo de datos.

---

## Paso 1 — Resumen estructurado de la especificación (KPIs.md)

### 1. Objetivo funcional

Definir un sistema de KPIs con metas M3–M18, cumplimiento direccional (maximizar / minimizar), ponderación que suma 100%, score global, semáforo (verde / amarillo / rojo), vínculo 1:1 KPI–Gap, impacto de user stories, alertas, roles, exportación y vistas de dashboard.

### 2. Entidades principales (en el MD)

- **KpiDefinition** (tabla propuesta `kpi_definitions`): código, nombre, unidad, dirección, baseline, metas M3/M6/M12/M18, peso, gap, categoría, fórmula, fuente, frecuencia, owner.
- **KpiMeasurement** (tabla propuesta `kpi_measurements`): valor, fecha, notas, `recorded_by`, unicidad `(kpi_id, measured_at)`.
- **Gap**, **User Story**, estimaciones, sprints (secciones 13–15).

### 3. Módulos o pantallas involucradas (MD)

- Dashboard de KPIs con cards, barra de progreso, score global hero, filtros por categoría, sparklines, export CSV/PDF.

### 4. Flujos de usuario (MD)

- Consultar cumplimiento y score global.
- Registrar medición (`registrarMedicion` sobre `kpi_measurements`).
- Roles: Viewer / Champion / Admin con permisos distintos.
- Revisión por milestones y governance.

### 5. Reglas de negocio (MD)

- Cumplimiento individual con fórmula maximize/minimize y **clamp 0–120%**.
- Score global = Σ (cumplimiento × peso), máximo teórico 120 puntos.
- Semáforo por cumplimiento: verde ≥80%, amarillo 50–79%, rojo &lt;50%.
- Metas activas según “mes del proyecto” (`getActiveMeta`).
- Alertas: peligro &lt;30% tras mes 3, warning, estancamiento 3 mediciones.
- Pesos deben sumar 100% al agregar KPIs.

### 6. Cálculos y validaciones (MD)

- `calculateCumplimiento`, `getSemaphore`, `getActiveMeta`, `interpolateMeta`, rebalanceo de pesos, evaluación por hito.

### 7. Relaciones entre entidades (MD)

- KPI 1:1 Gap; Gap 1:N User Stories; mediciones inmutables por fecha; corrección = nueva fila.

### 8. Dependencias con módulos existentes (proyecto real)

| Concepto MD | Implementación actual |
|-------------|------------------------|
| `kpi_definitions` | Tabla **`catalog_kpis`** (+ columnas O2C: `weight`, `baseline`, `target_m3/m6/m12/m18`, `direction`, `calc_type`, `gap_id`, `in_global_portfolio`, umbrales, etc.) |
| `kpi_measurements` | Tabla **`catalog_kpi_measurements`** (medido_en, valor, notas; no el mismo UNIQUE que el MD) |
| Score global | `deriveGlobalPortfolioFromMetricItems`, `useO2cGlobalScore`, **`useGlobalScoreEvolution`** |
| Vista documento (MD §3–§4) | `deriveMdSpecPortfolio`, **`GlobalScoreMdSpecPanel`** (cumplimiento % 0–120, semáforo 80/50) en paralelo al motor O2C |
| Semáforo | Cumplimiento **0–1** con umbrales por KPI o por defecto (`KPI_COMPLIANCE_*`); la vista MD usa 80/50 sobre cumplimiento % |
| Dashboard | **`KpisDashboardPage`**, **`KpiCard`**, **`GlobalScoreWidget`**, **`GlobalScoreHistoryChart`**, **`GlobalScoreMdSpecPanel`** |
| Registro medición | **`KpiMeasurementDialog`** en **Ajustes → Catálogos → KPIs** (`/settings/catalogs/kpis`) |

### 9. Vacíos, ambigüedades y supuestos

- **No** se crean tablas `kpi_definitions` / `kpi_measurements` del MD: chocarían con `catalog_kpis` y medición existente.
- El MD usa cumplimiento **0–120%** y score **0–120 puntos** en su semáforo; el tablero muestra **además** el motor O2C (**0–1**). La vista alineada al MD está en **`GlobalScoreMdSpecPanel`** y utilidades en `kpiMdSpecCalculations.ts` (conviven ambas lecturas).
- **`target_m3`** está en `catalog_kpis` (migración `20260411200000_catalog_kpis_target_m3.sql`); metas activas tipo `getActiveMeta` usan mes de programa vía **`VITE_O2C_PROGRAM_START`** (`getO2cProgramMonthIndex` en `src/lib/o2cProgramConfig.ts`).
- Catálogo core del MD: migración **`20260415120000_replace_catalog_kpis_with_kpis_md_core.sql`** y tabla de mapeo **[KPIs-doc-catalog-mapping.md](./KPIs-doc-catalog-mapping.md)** (reemplazo del seed O2C por KPI-01…10). Plantillas de captura Fase 1: **`scripts/kpi-capture-phase1/`**; script manual: **`scripts/apply-kpis-md-baseline.sql`**.
- **Roles Champion/Viewer** en el MD no están modelados igual en `usuarios.rol`; RLS real usa `is_app_admin()` para catálogo.
- **PDF** y **snapshot imagen** no se implementan en esta fase (dependencia pesada); se deja CSV exportable.

---

## Paso 2 — Propuesta técnica (qué reutilizar / qué crear)

### Reutilizar

- `useKpisDashboardData`, pipeline O2C, `KpiCard`, cálculos en `kpiCalculations.ts`.
- `catalog_kpis.tipo` como **aproximación** a “categoría” del MD (Operativo, Financiero, etc.) si está poblado en datos.

### Crear

- `docs/KPIs-analysis-and-mapping.md` (este archivo).
- Utilidad **`exportKpiDashboardCsv`**: exportación CSV del estado filtrado del tablero.
- Componente **`KpiSparkline`**: mini serie con últimos valores de medición.
- Ampliaciones en **`KpiCard`** y **`KpisDashboardPage`**: filtro por tipo, alerta de KPIs con cumplimiento &lt; 30%, sparkline, botón exportar.

### Refactorizar

- Mínimo: solo props opcionales en `KpiCard` y filtros adicionales en la página.

### Datos / Supabase

- El modelo sigue siendo **`catalog_kpis`** + **`catalog_kpi_measurements`**. Para alinear definiciones con [KPIs.md](./KPIs.md) existe la migración de reemplazo de portafolio citada arriba (opcional según entorno).

### Estado y queries

- Mismo patrón React Query; sparkline usa `recentById` ya cargado en el pipeline (sin query extra).

---

## Paso 6 (entregable) — Referencia rápida

Tras implementar, el tablero `/dashboard/kpis` incluye:

- Filtro por **tipo** (`catalog_kpis.tipo`) como aproximación a categoría del documento.
- **Alerta** si hay KPIs visibles con cumplimiento **&lt; 30%** (regla tipo “peligro” del MD, sin “mes 3” en BD).
- **Sparkline** de hasta 6 mediciones recientes por tarjeta (`KpiSparkline`).
- **Export CSV** de la lista filtrada/ordenada actual (`Exportar CSV`).
- Badge de **peso** explícito en cada `KpiCard`.

**Pendiente o parcial:** tablas con nombres del MD (`kpi_definitions`/`kpi_measurements`), PDF, roles Champion/Viewer completos. **Hecho en código:** cumplimiento MD 0–120% + panel **`GlobalScoreMdSpecPanel`**; **mes de programa** vía env; catálogo core MD vía migración enlazada en §9.
