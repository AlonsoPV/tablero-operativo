-- Generado desde C:\Users\alpev\Downloads\KPIs Junta.xlsx, hoja Hoja2.
-- Inserta acciones operativas en public.acciones_diarias.
-- Todas usan evidencia_esperada = 'Default' como texto libre de la opcion Otro especificar.

DO $$
DECLARE
  r record;
  v_responsable uuid;
  v_created_by uuid;
  v_responsable_count integer;
  v_created_by_count integer;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        (DATE '2026-05-26', 'prueba de nomina sin avisar operadores', 'Verde', DATE '2026-06-11', TIME '09:00', 'Seguimiento de la prueba y alinear factor con las areas
Revision con alonso para el calculo de nomina
12 jun: sesion para revision de nomina 13:00
15 jun: Comparativo nomina anterior con nómina actual y envío de Minuta
18 jun Sesión dia jueves 14:00 hrs
18:jun: Envio de kilometrajes a Nancy', 'Pendiente', 'Jorge', NULLIF('', '')),
        (DATE '2026-06-11', 'Operadores continuan llegando tarde', 'Verde', DATE '2026-06-22', TIME '09:00', 'Operadores continuan llegando tarde 
9 jun: Rojo critico - Se solicita un plan integral de acción
12 jun: sesion para revision del plan de accion 11;00
15 jun: Sesión a las 12 con Irhec
17 jun: Propuesta de correr a los operadores que llegan tarde o un bono por puntualidad', 'Pendiente', 'Irhec', NULLIF('Rebeca', '')),
        (DATE '2026-06-13', 'Parabrisas del HINO - Parabrisas que se debe diseñar - Se quedaria 17 días', 'Verde', DATE '2026-06-23', TIME '09:00', 'Parabrisas del HINO - Parabrisas que se debe diseñar - Se quedaria 17 días
Enviar la unidad despues de que salga de su servicio termo
19 jun: La unidad sigue en termo y sale la siguiente semana', 'Pendiente', 'Abraham', NULLIF('Nubia', '')),
        (DATE '2026-06-15', 'Recolección de Placas 21BD2R - Pendiente por recolectar', 'Rojo', DATE '2026-06-15', TIME '09:00', 'Recolección de Placas 21BD2R - Pendiente por recolectar
19 jun: Se requiere solicitar información de la placa', 'Pendiente', 'Abraham', NULLIF('Rebeca', '')),
        (DATE '2026-06-16', 'Calificacion de unidades con Maypo USL y Campus', 'Verde', DATE '2026-06-19', TIME '09:00', 'Calificacion de unidades con Maypo USL y Campus
seguimiento con cliente
USL  11 jun: Revision con paredes para el seguimiento de calificaciones
12 jun contactar a personal de maypo para seguimiento
15 jun: Se tiene que enviar las eviencias de los hallazgos de auditoria', 'Pendiente', 'Itzel', NULLIF('Rebeca', '')),
        (DATE '2026-06-20', 'Instalacion de camaras y bocinas en palmar', 'Amarillo', DATE '2026-06-20', TIME '09:00', 'Instalacion de camaras y bocinas en palmar
revision de la pantalla de planta baja para instalacion de no break

17 Jun: No es posible la instalación debio a falta de cables, se espera la instalación el día viernes
Se necesitario otro no break para la instalación de la pantalla de abajo', 'Pendiente', 'Leslie', NULLIF('Jorge', '')),
        (DATE '2026-06-12', 'Salida Tarde de bernardo damian de resguardo', 'Verde', DATE '2026-06-22', TIME '09:00', 'Salida Tarde de bernardo damian de resguardo
Falta de seguimiento del operador el dia de ayer para su salida de guadalajara
15 jun: Baja de Bernardo Damián', 'Pendiente', 'Damaris', NULLIF('Irhec', '')),
        (DATE '2026-06-13', 'Auditoria de unidades astrazeneca 6384ZP 8127ZP', 'Amarillo', DATE '2026-06-18', TIME '09:00', 'Auditoria de unidades astrazeneca 6384ZP 8127ZP
REVISION DE LAS UNIDADES 
18 jun: Seguimiento', 'Pendiente', 'Nubia', NULLIF('Itzel', '')),
        (DATE '2026-06-15', 'Seguimiento unidad transit 1932', 'Verde', DATE '2026-06-19', TIME '09:00', 'Diagnostico por parte de taller
El taller no puede tener las piezas por costo - Cotización externa por parte de Nubia
19 jun: Reparación costeada en 300 mil - Acercamiento de Nubia con Joge para próximos pasos', 'Pendiente', 'Nubia', NULLIF('Nubia', '')),
        (DATE '2026-06-16', 'Llegada tarde de una hora - operador Israel Leon', 'Rojo', DATE '2026-06-22', TIME '09:00', 'Acta administratia al operador
Comunicación con Norma para aclarar puestos
Cita con el operador en Palmar', 'Pendiente', 'Abraham', NULLIF('Abraham', '')),
        (DATE '2026-06-16', 'Entrega plan de carrera de las 5 personas para revisión el día Lunes', 'Rojo', DATE '2026-06-19', TIME '09:00', 'Entega de Plan de carrera', 'Pendiente', 'Damaris', NULLIF('Damaris', '')),
        (DATE '2026-06-17', 'Parabrisas 8129 alta de reporte con el seguro', 'Rojo', DATE '2026-06-19', TIME '09:00', 'Seguimiento del alta - pendiente por proveedor
18 jun: Unidad va a cambio de parabrisas', 'Pendiente', 'Nubia', NULLIF('Nubia', '')),
        (DATE '2026-06-17', 'Cambio de parabrisas y cristal de la unidad 21BD9P', 'Rojo', DATE '2026-06-18', TIME '09:00', 'Envió a reparación de parabrisas
Referencia con rojo de la placa', 'Pendiente', 'Nubia', NULLIF('Nubia', '')),
        (DATE '2026-06-17', '8128ZP estatus del avance e la unidad', 'Rojo', DATE '2026-06-26', TIME '09:00', 'Se necesita salir de la carrosera para poder validarla', 'Pendiente', 'Nubia', NULLIF('Itzel', '')),
        (DATE '2026-06-17', 'Israel León sale a ruta y se siente mal - por lo que se envía operador y vehiculo nuevo', 'Rojo', DATE '2026-06-22', TIME '09:00', 'Revisión de slud para saber a que rutas mandar', 'Pendiente', 'Damaris', NULLIF('Rebeca', '')),
        (DATE '2026-06-17', 'Estadias en rutas locales - se paga la estadia siempre y cuando los operadores lleguen puntuales a hora de carga', 'Rojo', DATE '2026-06-17', TIME '09:00', 'Revisión con Jhovany y Jorge', 'Pendiente', 'Jorge', NULLIF('Rebeca', '')),
        (DATE '2026-06-18', '13 unidades para sguimiento', 'Rojo', DATE '2026-06-30', TIME '09:00', 'Seguimiento de unidades por reparación
19 jun: 9 pendientes - 4 resueltas', 'Pendiente', 'Nubia', NULLIF('Nubia', '')),
        (DATE '2026-06-18', 'Solicitud de viajes de unidad 8127ZP de Abril 2025 a Abril 2026', 'Rojo', DATE '2026-06-18', TIME '09:00', 'Envió de la información por parte de Héctor
Envió por correo la solicitud', 'Pendiente', 'Héctor', NULLIF('Itzel', '')),
        (DATE '2026-06-19', 'Operador Misael Jimenez, detención por cristal', 'Verde', DATE '2026-06-19', TIME '09:00', 'Resolución - unidad posible envio a retención', 'Pendiente', 'Abraham', NULLIF('Abraham', ''))
    ) AS src(fecha_apertura, titulo_accion, semaforo_kpi, fecha_limite, hora_limite, descripcion_accion, estado, responsable_nombre, asigna_nombre)
  LOOP
    SELECT count(*)
      INTO v_responsable_count
    FROM public.usuarios u
    WHERE u.activo = true
      AND (
        public.normalize_business_role(u.nombre) = public.normalize_business_role(r.responsable_nombre)
        OR public.normalize_business_role(split_part(u.nombre, ' ', 1)) = public.normalize_business_role(r.responsable_nombre)
      );

    IF v_responsable_count = 1 THEN
      SELECT u.id
        INTO v_responsable
      FROM public.usuarios u
      WHERE u.activo = true
        AND (
          public.normalize_business_role(u.nombre) = public.normalize_business_role(r.responsable_nombre)
          OR public.normalize_business_role(split_part(u.nombre, ' ', 1)) = public.normalize_business_role(r.responsable_nombre)
        )
      ORDER BY u.nombre, u.id::text
      LIMIT 1;
    ELSE
      SELECT count(*)
        INTO v_responsable_count
      FROM public.usuarios u
      WHERE r.asigna_nombre IS NOT NULL
        AND u.activo = true
        AND (
          public.normalize_business_role(u.nombre) = public.normalize_business_role(r.asigna_nombre)
          OR public.normalize_business_role(split_part(u.nombre, ' ', 1)) = public.normalize_business_role(r.asigna_nombre)
        );

      IF v_responsable_count = 1 THEN
        SELECT u.id
          INTO v_responsable
        FROM public.usuarios u
        WHERE r.asigna_nombre IS NOT NULL
          AND u.activo = true
          AND (
            public.normalize_business_role(u.nombre) = public.normalize_business_role(r.asigna_nombre)
            OR public.normalize_business_role(split_part(u.nombre, ' ', 1)) = public.normalize_business_role(r.asigna_nombre)
          )
        ORDER BY u.nombre, u.id::text
        LIMIT 1;

        RAISE NOTICE 'Responsable no resuelto o ambiguo: %. Se usa Persona que asigna (%) como responsable.', r.responsable_nombre, r.asigna_nombre;
      ELSE
        RAISE NOTICE 'Fila omitida: responsable no resuelto o ambiguo (%) y sin asignador resoluble.', r.responsable_nombre;
        CONTINUE;
      END IF;
    END IF;

    SELECT count(*)
      INTO v_created_by_count
    FROM public.usuarios u
    WHERE u.activo = true
      AND (
        public.normalize_business_role(u.nombre) = public.normalize_business_role(COALESCE(r.asigna_nombre, r.responsable_nombre))
        OR public.normalize_business_role(split_part(u.nombre, ' ', 1)) = public.normalize_business_role(COALESCE(r.asigna_nombre, r.responsable_nombre))
      );

    IF v_created_by_count = 1 THEN
      SELECT u.id
        INTO v_created_by
      FROM public.usuarios u
      WHERE u.activo = true
        AND (
          public.normalize_business_role(u.nombre) = public.normalize_business_role(COALESCE(r.asigna_nombre, r.responsable_nombre))
          OR public.normalize_business_role(split_part(u.nombre, ' ', 1)) = public.normalize_business_role(COALESCE(r.asigna_nombre, r.responsable_nombre))
        )
      ORDER BY u.nombre, u.id::text
      LIMIT 1;
    ELSE
      v_created_by := v_responsable;
      RAISE NOTICE 'Persona que asigna no resuelta o ambigua: % (% coincidencias). Se usa el responsable como creador.', COALESCE(r.asigna_nombre, r.responsable_nombre), v_created_by_count;
    END IF;

    INSERT INTO public.acciones_diarias (
      fecha, titulo_accion, descripcion_accion, responsable, created_by, updated_by,
      hora_limite, evidencia_esperada, evidencia_cargada, evidencia_adjunta, estado,
      prioridad, tipo_accion, story_points, area, created_at, updated_at
    )
    SELECT
      r.fecha_limite,
      left(r.titulo_accion, 70),
      r.descripcion_accion,
      v_responsable,
      v_created_by,
      v_created_by,
      r.hora_limite,
      'Default',
      false,
      NULL,
      r.estado::public.action_status,
      CASE
        WHEN r.semaforo_kpi ILIKE '%Rojo%' THEN 'Rojo'
        WHEN r.semaforo_kpi ILIKE '%Amarillo%' THEN 'Amarillo'
        ELSE 'Verde'
      END,
      'operativa',
      0,
      NULL,
      r.fecha_apertura::timestamptz,
      now()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.acciones_diarias a
      WHERE a.fecha = r.fecha_limite
        AND a.responsable = v_responsable
        AND a.titulo_accion = left(r.titulo_accion, 70)
    );

    UPDATE public.acciones_diarias a
    SET
      prioridad = CASE
        WHEN r.semaforo_kpi ILIKE '%Rojo%' THEN 'Rojo'
        WHEN r.semaforo_kpi ILIKE '%Amarillo%' THEN 'Amarillo'
        ELSE 'Verde'
      END,
      updated_at = now()
    WHERE a.fecha = r.fecha_limite
      AND a.responsable = v_responsable
      AND a.titulo_accion = left(r.titulo_accion, 70)
      AND a.prioridad IN ('P1_Critica', 'P2_Media', 'P3_Baja');
  END LOOP;
END $$;
