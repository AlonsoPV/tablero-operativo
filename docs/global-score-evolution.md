# Evolución del score global O2C

Este documento describe cómo se calcula el score global, cómo se persiste el historial, la escala en BD vs UI, y las reglas de negocio relevantes para dirección y operación.

## Escala

| Capa | Valor |
|------|--------|
| Base de datos (`global_score_snapshots.score`, funciones de cálculo) | **0–1** (fracción de cumplimiento ponderado) |
| UI (widget, gráficas, deltas) | **Porcentaje** (puntos), típicamente un decimal (p. ej. `64.3%`, `+2.1 pts`) |

El CHECK en `global_score_snapshots` fuerza `score` entre 0 y 1.

## Cálculo del score “vivo”

1. Se cargan KPIs O2C **activos** con última medición por KPI (`catalog_kpi_measurements`).
2. Se construye la métrica y el cumplimiento por fila (`computeCatalogKpiMetricItem` / pipeline de métricas).
3. Se filtra al **portafolio global**: KPI con `activo`, `gap_id` no nulo e `in_global_portfolio`.
4. El score global es la suma ponderada de cumplimientos sobre ese subconjunto (`deriveGlobalPortfolioFromMetricItems`), alineado con `DEFAULT_O2C_TARGET_HORIZON`.

Respeta `calc_type` (minimize / maximize / binary), umbrales por KPI y pesos del catálogo.

## Historial: snapshots

- Tabla: `global_score_snapshots` (`score`, `metadata` jsonb opcional, `created_at`).
- Tras registrar una **medición de catálogo**, la app recalcula el mismo score global y llama a la función RPC **`record_global_score_snapshot`** (SECURITY DEFINER) para insertar una fila sin depender de ser administrador en la tabla.
- Cada fila representa el estado del programa **en el momento del evento** (últimas mediciones vigentes), no un agregado “última medición dentro del periodo calendario” (eso sería una evolución posible en fase 2).

### Metadata típica

Incluye cobertura y trazabilidad, por ejemplo: `source`, `catalog_kpi_id`, `portfolio_kpis`, `eligible_kpis`, pesos elegibles, etc.

## Variación y tendencia (UI)

- **Variación vs punto anterior:** diferencia en puntos porcentuales entre el snapshot más reciente y el inmediatamente anterior en el tiempo (`(s_last - s_prev) * 100`).
- **Tendencia:** se clasifica como sube / baja / estable según un umbral mínimo en puntos para no marcar ruido.
- Si hay **menos de dos** snapshots, no hay variación ni tendencia comparativa.

## Reglas de negocio

| Situación | Comportamiento |
|-----------|----------------|
| Faltan mediciones en algunos KPIs | El score usa solo KPIs “elegibles” según la misma lógica que el widget (cobertura de peso). |
| KPI inactivo | No entra (`activo: true` en listados). |
| Cambios de pesos o catálogo en el tiempo | Los snapshots reflejan el cálculo **al momento** de cada evento; no reescriben el pasado. |
| Deduplicación al guardar | Si ya existe un snapshot el **mismo día UTC** con el **mismo score** (dentro de tolerancia), no se inserta otra fila (reduce ruido en la gráfica). |

## Fase 2 sugerida

- Snapshots por `period_type` / `period_date` o job diario cerrado.
- Reconstrucción histórica desde mediciones por ventana (última medición por KPI en el periodo).
- Backfill de series antiguas.

Ver también [dashboard-y-kpis.md](./dashboard-y-kpis.md) para el contexto de dashboards.

## Implementación en la app (resumen)

| Pieza | Ubicación |
|-------|-----------|
| Cálculo vivo + serie | [`useGlobalScoreEvolution`](../src/features/kpi/hooks/useGlobalScoreEvolution.ts) (combina `useO2cGlobalScore` + `useGlobalScoreSnapshots`) |
| Variación / tendencia / textos | [`globalScoreEvolution.ts`](../src/features/kpi/utils/globalScoreEvolution.ts) |
| Persistencia tras medición | RPC `record_global_score_snapshot` — ver migración `20260411120000_record_global_score_snapshot_rpc.sql` |
| UI | [`GlobalScoreWidget`](../src/features/kpi/components/GlobalScoreWidget.tsx), [`GlobalScoreHistoryChart`](../src/features/kpi/components/GlobalScoreHistoryChart.tsx) |

- **Variación vs anterior:** diferencia en puntos porcentuales entre los dos snapshots más recientes (serie ordenada por tiempo).
- **Tendencia:** clasificación sube / baja / estable con umbral en puntos (`GLOBAL_SCORE_TREND_EPSILON_PCT`).
- **Ventana en gráfica:** 7 / 30 / 90 días o “Todo”; texto de variación neta opcional según la ventana seleccionada.
