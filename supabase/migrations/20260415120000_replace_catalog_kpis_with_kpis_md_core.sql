-- =============================================================================
-- Reemplaza el portafolio sembrado O2C (10 KPIs) por los KPI core de docs/KPIs.md
-- (secciones 2 y 14.6), con overrides de baseline operativos donde aplica el plan
-- (PODs 65%, monitoreo manual 40%; resto según MD salvo notas en KPIs-doc-catalog-mapping.md).
-- Preserva UUIDs de catalog_kpis; inserta 10 gaps GAP-MD-*. No borra gaps O2C legacy
-- usados por acciones demo.
-- Idempotente: si ya existe KPI-01 —, no hace nada.
-- =============================================================================

DO $$
DECLARE
  g01 uuid;
  g02 uuid;
  g03 uuid;
  g04 uuid;
  g05 uuid;
  g06 uuid;
  g07 uuid;
  g08 uuid;
  g09 uuid;
  g10 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.catalog_kpis WHERE nombre LIKE 'KPI-01 —%' LIMIT 1) THEN
    RAISE NOTICE 'replace_catalog_kpis_with_kpis_md_core: ya aplicado (KPI-01 —). Skip.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.catalog_kpis WHERE nombre = 'O2C — OTIF' LIMIT 1) THEN
    RAISE NOTICE 'replace_catalog_kpis_with_kpis_md_core: no se encontró seed O2C — OTIF. Skip.';
    RETURN;
  END IF;

  -- Si esta BD no aplicó 20260411200000_catalog_kpis_target_m3.sql, la columna no existe.
  ALTER TABLE public.catalog_kpis ADD COLUMN IF NOT EXISTS target_m3 numeric;
  COMMENT ON COLUMN public.catalog_kpis.target_m3 IS
    'Meta mes 3 (programa O2C). Opcional. Usada por cálculo MD y getActiveMeta.';

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-01 — Reasignaciones/día',
    'Brecha KPI-01: reasignaciones y cambios de asignación vs volumen (docs/KPIs.md).',
    'open',
    'Operativo',
    true
  )
  RETURNING id INTO g01;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-02 — Tiempo Carta Porte',
    'Brecha KPI-02: tiempo solicitud Carta Porte → envío TMS (Compliance).',
    'open',
    'Compliance',
    true
  )
  RETURNING id INTO g02;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-03 — Monitoreo manual',
    'Brecha KPI-03: intervención manual / monitoreo activo (Operativo).',
    'open',
    'Operativo',
    true
  )
  RETURNING id INTO g03;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-04 — PODs T+0',
    'Brecha KPI-04: entregas / PODs en ventana T+0 (Calidad).',
    'open',
    'Calidad',
    true
  )
  RETURNING id INTO g04;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-05 — Gráficas temperatura',
    'Brecha KPI-05: manipulación manual de gráficas vs automáticas (Calidad).',
    'open',
    'Calidad',
    true
  )
  RETURNING id INTO g05;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-06 — Viáticos sin comprobar',
    'Brecha KPI-06: viáticos post-viaje / sin comprobar (Financiero).',
    'open',
    'Financiero',
    true
  )
  RETURNING id INTO g06;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-07 — Ciclo entrega a cobro',
    'Brecha KPI-07: días (o tiempo) desde entrega a cobro (Financiero).',
    'open',
    'Financiero',
    true
  )
  RETURNING id INTO g07;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-08 — Clientes con CTS',
    'Brecha KPI-08: adopción portal / CTS (Financiero).',
    'open',
    'Financiero',
    true
  )
  RETURNING id INTO g08;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-09 — Fallas mecánicas',
    'Brecha KPI-09: eventos de mantenimiento no programado (Operativo).',
    'open',
    'Operativo',
    true
  )
  RETURNING id INTO g09;

  INSERT INTO public.gaps (nombre, descripcion, status, area, activo)
  VALUES (
    'GAP-MD-10 — Dashboards activos',
    'Brecha KPI-10: reportes auto-actualizables (Operativo).',
    'open',
    'Operativo',
    true
  )
  RETURNING id INTO g10;

  -- Metas en minutos para Carta Porte (30 seg = 0.5 min; 15 seg = 0.25; 10 seg = 10/60 min).
  DELETE FROM public.catalog_kpi_measurements
  WHERE catalog_kpi_id IN (
    SELECT id FROM public.catalog_kpis
    WHERE nombre IN (
      'O2C — OTIF',
      'O2C — OTD (cumplimiento fecha promesa)',
      'O2C — Incidencias de calidad',
      'O2C — Evidencias T+0',
      'O2C — Exactitud de facturación',
      'O2C — DSO',
      'O2C — Rotación de cartera',
      'O2C — Margen bruto',
      'O2C — NPS',
      'O2C — Perfect order rate'
    )
  );

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-01 — Reasignaciones/día',
    descripcion = 'Reasignaciones o cambios de unidad por día (menor es mejor). Fuente: TMS / operaciones.',
    unidad = 'numero',
    weight = 0.12,
    baseline = 1.5,
    target_m3 = 1.0,
    target_m6 = 0.5,
    target_m12 = 0.2,
    target_m18 = 0,
    calc_type = 'minimize'::public.catalog_kpi_calc_type,
    direction = 'minimize'::public.catalog_kpi_direction,
    gap_id = g01,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 1
  WHERE nombre = 'O2C — OTIF';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-02 — Tiempo Carta Porte',
    descripcion = 'Tiempo desde solicitud hasta envío al TMS (minutos; menores valores son mejores).',
    unidad = 'numero',
    weight = 0.10,
    baseline = 30,
    target_m3 = 10,
    target_m6 = 0.5,
    target_m12 = 0.25,
    target_m18 = (10::numeric / 60::numeric),
    calc_type = 'minimize'::public.catalog_kpi_calc_type,
    direction = 'minimize'::public.catalog_kpi_direction,
    gap_id = g02,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 2
  WHERE nombre = 'O2C — OTD (cumplimiento fecha promesa)';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-03 — Monitoreo manual %',
    descripcion = 'Porcentaje de viajes u operaciones que requieren intervención manual (menor es mejor).',
    unidad = 'porcentaje',
    weight = 0.12,
    baseline = 40,
    target_m3 = 20,
    target_m6 = 5,
    target_m12 = 2,
    target_m18 = 0,
    calc_type = 'minimize'::public.catalog_kpi_calc_type,
    direction = 'minimize'::public.catalog_kpi_direction,
    gap_id = g03,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 3
  WHERE nombre = 'O2C — Incidencias de calidad';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-04 — PODs T+0',
    descripcion = 'Porcentaje PODs / entregas en ventana T+0 (mayor es mejor).',
    unidad = 'porcentaje',
    weight = 0.15,
    baseline = 65,
    target_m3 = 87,
    target_m6 = 93,
    target_m12 = 97,
    target_m18 = 99,
    calc_type = 'maximize'::public.catalog_kpi_calc_type,
    direction = 'maximize'::public.catalog_kpi_direction,
    gap_id = g04,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 4
  WHERE nombre = 'O2C — Evidencias T+0';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-05 — Gráficas manipuladas',
    descripcion = 'Conteo de viajes con gráfica de temperatura editada manualmente vs automática (menor es mejor).',
    unidad = 'numero',
    weight = 0.08,
    baseline = 1,
    target_m3 = 0,
    target_m6 = 0,
    target_m12 = 0,
    target_m18 = 0,
    calc_type = 'minimize'::public.catalog_kpi_calc_type,
    direction = 'minimize'::public.catalog_kpi_direction,
    gap_id = g05,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 5
  WHERE nombre = 'O2C — Exactitud de facturación';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-06 — Viáticos sin comprobar',
    descripcion = 'Porcentaje de viajes con viático pendiente de comprobación (menor es mejor).',
    unidad = 'porcentaje',
    weight = 0.08,
    baseline = 30,
    target_m3 = 20,
    target_m6 = 10,
    target_m12 = 5,
    target_m18 = 2,
    calc_type = 'minimize'::public.catalog_kpi_calc_type,
    direction = 'minimize'::public.catalog_kpi_direction,
    gap_id = g06,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 6
  WHERE nombre = 'O2C — DSO';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-07 — Días entrega→pago',
    descripcion = 'Días desde entrega a cliente hasta cobro (menor es mejor). Metas según docs/KPIs.md §14.6.',
    unidad = 'dias',
    weight = 0.15,
    baseline = 22.5,
    target_m3 = 15,
    target_m6 = 10,
    target_m12 = 5,
    target_m18 = 1.5,
    calc_type = 'minimize'::public.catalog_kpi_calc_type,
    direction = 'minimize'::public.catalog_kpi_direction,
    gap_id = g07,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 7
  WHERE nombre = 'O2C — Rotación de cartera';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-08 — Clientes con CTS',
    descripcion = 'Escala 0–5: clientes con portal / CTS activo (mayor es mejor).',
    unidad = 'numero',
    weight = 0.08,
    baseline = 0,
    target_m3 = 0,
    target_m6 = 0,
    target_m12 = 3,
    target_m18 = 5,
    calc_type = 'maximize'::public.catalog_kpi_calc_type,
    direction = 'maximize'::public.catalog_kpi_direction,
    gap_id = g08,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 8
  WHERE nombre = 'O2C — Margen bruto';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-09 — Fallas mecánicas/mes',
    descripcion = 'Eventos de mantenimiento no programado por mes vs flota (menor es mejor).',
    unidad = 'numero',
    weight = 0.07,
    baseline = 3.5,
    target_m3 = 2.5,
    target_m6 = 1.5,
    target_m12 = 1.0,
    target_m18 = 0.5,
    calc_type = 'minimize'::public.catalog_kpi_calc_type,
    direction = 'minimize'::public.catalog_kpi_direction,
    gap_id = g09,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 9
  WHERE nombre = 'O2C — NPS';

  UPDATE public.catalog_kpis SET
    nombre = 'KPI-10 — Dashboards activos',
    descripcion = 'Conteo de reportes o dashboards auto-actualizables operativos (mayor es mejor).',
    unidad = 'numero',
    weight = 0.05,
    baseline = 0,
    target_m3 = 0,
    target_m6 = 1,
    target_m12 = 2,
    target_m18 = 3,
    calc_type = 'maximize'::public.catalog_kpi_calc_type,
    direction = 'maximize'::public.catalog_kpi_direction,
    gap_id = g10,
    current_value = NULL,
    threshold_green = 0.85,
    threshold_yellow = 0.65,
    orden = 10
  WHERE nombre = 'O2C — Perfect order rate';

  RAISE NOTICE 'replace_catalog_kpis_with_kpis_md_core: 10 KPIs actualizados a KPI-XX — (docs/KPIs.md).';
END $$;
