-- =============================================================================
-- SCRUMBAN — Seed Sintético para Demostración Comercial Local (15 min)
-- Exclusivo para Supabase Local (`scrumban-tc-local`). NUNCA ejecutar en DEV/PROD.
-- 100% idempotente y reversible mediante `reset_commercial_demo_local.sql`.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_super_admin uuid;
  v_direccion   uuid;
  v_lider       uuid;
  v_operativo   uuid;
  v_analista    uuid;
  v_okr_risk_id uuid := '11111111-2222-4333-8444-555555550001';
  v_area_ops    uuid;
  v_today       date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  SELECT id INTO v_super_admin FROM public.usuarios WHERE rol = 'super_admin' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_direccion   FROM public.usuarios WHERE rol = 'Direccion'   ORDER BY created_at LIMIT 1;
  SELECT id INTO v_lider       FROM public.usuarios WHERE nombre ILIKE '%Lider%' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_operativo   FROM public.usuarios WHERE nombre = 'QA Operativo' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_analista    FROM public.usuarios WHERE rol = 'Analista'    ORDER BY created_at LIMIT 1;
  SELECT id INTO v_area_ops    FROM public.areas    WHERE nombre = 'Operaciones' LIMIT 1;

  IF v_direccion IS NULL OR v_lider IS NULL OR v_operativo IS NULL OR v_analista IS NULL THEN
    RAISE EXCEPTION 'Faltan identidades sintéticas base en scrumban-tc-local.';
  END IF;

  -- Limpiar ejecuciones previas del demo comercial (idempotencia total)
  DELETE FROM public.acciones_diarias WHERE id IN (
    '22222222-2222-4333-8444-555555550001',
    '22222222-2222-4333-8444-555555550002',
    '22222222-2222-4333-8444-555555550003',
    '22222222-2222-4333-8444-555555550004',
    '22222222-2222-4333-8444-555555550005',
    '22222222-2222-4333-8444-555555550006',
    '22222222-2222-4333-8444-555555550007',
    '22222222-2222-4333-8444-555555550008'
  );
  DELETE FROM public.okr_key_results WHERE okr_id = v_okr_risk_id;
  DELETE FROM public.okrs WHERE id = v_okr_risk_id;
  DELETE FROM public.agent_documents WHERE logical_id IN ('demo-comercial-acta-semanal', 'demo-comercial-politica-bloqueos');
  DELETE FROM public.agent_memory WHERE source_ref IN ('demo-comercial-reunion-1', 'demo-comercial-reunion-2');

  -- 1) OKR Estratégico en Riesgo por Ritmo de Periodo (67% del trimestre transcurrido, 28% avance)
  INSERT INTO public.okrs (
    id, nombre_okr, title, descripcion, owner_usuario, owner_user_id,
    periodo, activo, start_date, end_date, status, scope, area_id
  ) VALUES (
    v_okr_risk_id,
    'Asegurar entregas puntuales a cuentas clave Q4',
    'Asegurar entregas puntuales a cuentas clave Q4',
    'Reducir entregas tardías y bloqueos de suministro en cuentas prioritarias durante el cierre trimestral.',
    v_direccion,
    v_direccion,
    'Q4 2026',
    true,
    v_today - 60,
    v_today + 30,
    'at_risk',
    'company',
    NULL
  );

  INSERT INTO public.okr_key_results (
    okr_id, title, description, metric_type, baseline_value, target_value, current_value,
    unit, direction, display_order, owner_user_id
  ) VALUES
    (v_okr_risk_id, 'Cumplimiento de entregas a tiempo >= 95%', 'Porcentaje de pedidos entregados dentro de SLA.', 'percentage', 78, 95, 83, '%', 'increase', 1, v_lider),
    (v_okr_risk_id, 'Reducir bloqueos abiertos mayores a 48h a 0', 'Resolución temprana de cuellos de botella con proveedores.', 'number', 6, 0, 4, 'bloqueos', 'decrease', 2, v_lider);

  -- 2) 8 Acciones Operativas Sintéticas (historia realista para demostración al dueño)
  INSERT INTO public.acciones_diarias (
    id, fecha, hora_limite, titulo_accion, descripcion_accion, evidencia_esperada,
    responsable, created_by, estado, prioridad, area, tipo_accion, okr_impactado,
    notas_escalamiento, escalado, story_points
  ) VALUES
    -- Bloqueo #1 (crítico, proveedor de empaque)
    (
      '22222222-2222-4333-8444-555555550001',
      v_today - 2, '13:00',
      'Resolver retraso de proveedor de empaque principal',
      'Proveedor de empaque sin confirmación de embarque desde el martes; frena entregas de 3 cuentas clave.',
      'Confirmación escrita de embarque o plan alterno validado.',
      v_lider, v_direccion, 'Bloqueado', 'P1_Alta', 'Operaciones', 'desbloqueo', v_okr_risk_id,
      'Bloqueo activo >48h por proveedor de empaque sin guía confirmada.', true, 3
    ),
    -- Bloqueo #2 (facturación)
    (
      '22222222-2222-4333-8444-555555550002',
      v_today, '16:00',
      'Destrabar validación fiscal de facturación recurrente',
      'Falta complemento de datos fiscales del cliente corporativo para timbrar el lote semanal.',
      'Lote timbrado y acuse registrado en carpeta fiscal.',
      v_operativo, v_lider, 'Bloqueado', 'P1_Alta', 'Operaciones', 'desbloqueo', v_okr_risk_id,
      'En espera de constancia fiscal actualizada del cliente corporativo.', false, 2
    ),
    -- Retraso #1 (conciliación vencida)
    (
      '22222222-2222-4333-8444-555555550003',
      v_today - 3, '12:00',
      'Cerrar conciliación semanal de pedidos pendientes',
      'Conciliar pedidos rezagados de la semana anterior contra inventario disponible en almacén.',
      'Reporte conciliado con fechas compromiso actualizadas.',
      v_lider, v_direccion, 'Retraso', 'P1_Alta', 'Operaciones', 'operativa', v_okr_risk_id,
      NULL, false, 3
    ),
    -- Retraso #2 (tiempos de entrega)
    (
      '22222222-2222-4333-8444-555555550004',
      v_today - 2, '17:00',
      'Actualizar matriz de tiempos de entrega por ruta',
      'Documentar variaciones reales de entrega en rutas metropolitanas y foráneas del último mes.',
      'Tabla comparativa publicada para comité comercial.',
      v_analista, v_direccion, 'Retraso', 'P2_Media', 'Operaciones', 'operativa', v_okr_risk_id,
      NULL, false, 2
    ),
    -- En ejecución
    (
      '22222222-2222-4333-8444-555555550005',
      v_today + 2, '18:00',
      'Preparar presentación de resultados operativos del mes',
      'Consolidar indicadores de entregas, bloqueos resueltos y cumplimiento por área para junta directiva.',
      'Presentación ejecutiva lista para revisión.',
      v_analista, v_direccion, 'En_Ejecucion', 'P2_Media', 'Dirección', 'estrategica', v_okr_risk_id,
      NULL, false, 2
    ),
    -- Pendiente próxima
    (
      '22222222-2222-4333-8444-555555550006',
      v_today + 3, '15:00',
      'Revisar acuerdos de nivel de servicio con logística',
      'Validar penalizaciones y tiempos de respuesta con transportista secundario antes de cierre de mes.',
      'Minuta firmada con SLA actualizado.',
      v_lider, v_direccion, 'Pendiente', 'P2_Media', 'Operaciones', 'operativa', v_okr_risk_id,
      NULL, false, 2
    ),
    -- Hecho pendiente de verificación humana (Hecho ≠ Verificado)
    (
      '22222222-2222-4333-8444-555555550007',
      v_today - 1, '14:00',
      'Auditar inventario crítico de almacén norte',
      'Conteo físico completo de materiales de alta rotación para prevenir quiebres de stock.',
      'Hoja de conteo firmada y diferencias conciliadas.',
      v_operativo, v_lider, 'Hecho', 'P1_Alta', 'Operaciones', 'operativa', v_okr_risk_id,
      NULL, false, 2
    ),
    -- Verificado (resultado cerrado)
    (
      '22222222-2222-4333-8444-555555550008',
      v_today - 4, '11:00',
      'Publicar protocolo de atención a clientes prioritarios',
      'Establecer canal de respuesta en menos de 4 horas para incidencias en cuentas estratégicas.',
      'Protocolo publicado y comunicado a líderes.',
      v_analista, v_direccion, 'Verificado', 'P2_Media', 'Comercial', 'estrategica', v_okr_risk_id,
      NULL, false, 1
    );

  -- 3) Documentos corporativos R3 publicados (recuperación documental con citas)
  INSERT INTO public.agent_documents (
    logical_id, title, body, version, status, access_level, area_id,
    content_hash, source_label, published_at
  ) VALUES
    (
      'demo-comercial-acta-semanal',
      'Acta de Comité Operativo Semanal — Acuerdos Vigentes',
      'Acuerdos de la última reunión ejecutiva: 1) Resolver el bloqueo del proveedor de empaque antes del viernes y evaluar proveedor alterno si no confirma embarque en 24 horas. 2) Cerrar la conciliación de pedidos rezagados antes del cierre semanal. 3) Verificar físicamente el inventario crítico de almacén norte.',
      1, 'published', 'project_read', NULL,
      'demo-doc-hash-acta-semanal-20261124',
      'Comité Operativo',
      now()
    ),
    (
      'demo-comercial-politica-bloqueos',
      'Política Corporativa de Escalamiento de Bloqueos',
      'Todo bloqueo operativo que supere 48 horas sin fecha confirmada de resolución debe escalarse a Dirección General con responsable asignado, impacto en cuentas clave y plan alterno en menos de 24 horas.',
      1, 'published', 'project_read', NULL,
      'demo-doc-hash-politica-bloqueos-2026',
      'Política Operativa',
      now()
    );

  -- 4) Memoria confirmada R3 (compromisos de la última reunión)
  INSERT INTO public.agent_memory (
    usuario_id, area_id, memory_type, body, source_kind, source_ref,
    content_hash, validation_status, access_level, version, confirmed_by, confirmed_at
  ) VALUES
    (
      v_direccion, NULL, 'agreement',
      'Acuerdo de la última reunión: revisar el bloqueo del proveedor de empaque este viernes y activar proveedor alterno si no hay guía confirmada.',
      'session', 'demo-comercial-reunion-1',
      'demo-mem-hash-reunion-empaque-202611',
      'confirmed', 'project_read', 1, v_direccion, now()
    ),
    (
      v_lider, v_area_ops, 'follow_up',
      'Compromiso de Operaciones: auditar inventario norte y verificar cierre de pedidos pendientes de cuentas clave.',
      'session', 'demo-comercial-reunion-2',
      'demo-mem-hash-reunion-ops-2026112400',
      'confirmed', 'area', 1, v_lider, now()
    );
END $$;

COMMIT;
