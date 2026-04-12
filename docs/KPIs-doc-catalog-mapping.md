# Mapeo docs/KPIs.md ↔ `catalog_kpis` (portafolio core)

Fuente normativa: [KPIs.md](./KPIs.md) secciones 2 y 14.6. La migración [20260415120000_replace_catalog_kpis_with_kpis_md_core.sql](../supabase/migrations/20260415120000_replace_catalog_kpis_with_kpis_md_core.sql) reemplaza el seed O2C por estos diez KPIs **conservando los UUID** de las filas originales.

## Tabla de correspondencia

| Código MD | Nombre en documento | `catalog_kpis.nombre` (final) | Reemplaza seed O2C | `unidad` (app) | Baseline | Metas M3 / M6 / M12 / M18 | Notas |
|-----------|---------------------|--------------------------------|--------------------|----------------|----------|---------------------------|--------|
| KPI-01 | Reasignaciones/día | KPI-01 — Reasignaciones/día | O2C — OTIF | numero | 1.5 | 1.0 / 0.5 / 0.2 / 0 | Conteo/día; minimize |
| KPI-02 | Tiempo Carta Porte | KPI-02 — Tiempo Carta Porte | O2C — OTD (cumplimiento fecha promesa) | numero | 30 min | 10 / 0.5 / 0.25 / 10/60 min | Valores en **minutos** (10 s = 10/60). |
| KPI-03 | Monitoreo manual % | KPI-03 — Monitoreo manual % | O2C — Incidencias de calidad | porcentaje | **40** | 20 / 5 / 2 / 0 | Baseline **operativo** (no 100% del MD); M3 ajustado a 20% para coherencia minimize. |
| KPI-04 | PODs T+0 | KPI-04 — PODs T+0 | O2C — Evidencias T+0 | porcentaje | **65** | 87 / 93 / 97 / 99 | Baseline **operativo**; metas según §14.6. |
| KPI-05 | Gráficas manipuladas | KPI-05 — Gráficas manipuladas | O2C — Exactitud de facturación | numero | 1 | 0 / 0 / 0 / 0 | Conteo de casos; minimize. |
| KPI-06 | Viáticos sin comprobar | KPI-06 — Viáticos sin comprobar | O2C — DSO | porcentaje | 30 | 20 / 10 / 5 / 2 | MD §14.6; minimize. |
| KPI-07 | Días entrega→pago | KPI-07 — Días entrega→pago | O2C — Rotación de cartera | dias | 22.5 | 15 / 10 / 5 / 1.5 | MD §14.6; minimize. Si miden **horas** (p. ej. ciclo evidencias 36 h), acordar conversión a días o cambiar `unidad` vía catálogo. |
| KPI-08 | Clientes con CTS | KPI-08 — Clientes con CTS | O2C — Margen bruto | numero | 0 | 0 / 0 / 3 / 5 | Escala 0–5; maximize. |
| KPI-09 | Fallas mecánicas/mes | KPI-09 — Fallas mecánicas/mes | O2C — NPS | numero | 3.5 | 2.5 / 1.5 / 1.0 / 0.5 | MD §14.6; minimize. |
| KPI-10 | Dashboards activos | KPI-10 — Dashboards activos | O2C — Perfect order rate | numero | 0 | 0 / 1 / 2 / 3 | MD §14.6; maximize. |

**Pesos (`weight`)** en BD: 0.12, 0.10, 0.12, 0.15, 0.08, 0.08, 0.15, 0.08, 0.07, 0.05 (suma 1.0).

**Gaps nuevos:** `GAP-MD-01` … `GAP-MD-10` (un gap por KPI). Los gaps O2C de demostración (`O2C — Pedido y oferta`, etc.) **no** se eliminan; pueden seguir usándose en acciones demo.

## Mediciones previas

La migración **borra** filas de `catalog_kpi_measurements` de los diez `catalog_kpi_id` afectados y pone `current_value` en NULL, porque las definiciones cambian de significado.
