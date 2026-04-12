📊 Matriz de Impacto — User Stories O2C
Documento técnico que detalla cómo cada User Story contribuye al Score Global
mediante la relación Story Points ↔ Peso KPI ↔ GAP. 32 historias | 248 puntos totales.

1. Fundamento: ¿Cómo se conectan Story Points con el Score Global?
1.1 Cadena de Valor
Story completada → GAP avanza → KPI mejora → Score Global sube
     (esfuerzo)     (progreso)    (resultado)    (estrategia)
1.2 Lo que miden los Story Points
Los Story Points NO miden impacto directo en el KPI. Miden esfuerzo relativo:

Puntos	Complejidad	Ejemplo
1-2	Trivial	Cambio de configuración, ajuste de parámetro
3	Simple	Reporte nuevo, regla de validación
5	Moderada	Dashboard, integración parcial
8	Compleja	Integración completa, módulo nuevo
13	Muy compleja	API end-to-end, algoritmo, automatización core
1.3 Fórmula de Impacto
Impacto % = (Peso_KPI × Story_Points) / Total_Puntos_GAP
Donde:

Peso_KPI: Peso del KPI vinculado en el Score Global (suma 100%)
Story_Points: Puntos asignados a la historia
Total_Puntos_GAP: Suma de puntos de todas las historias del GAP
Interpretación: Una historia de 13 pts en un GAP de 34 pts vinculado a un KPI de 12% aporta:

(12% × 13) / 34 = 4.59% del Score Global
1.4 Velocidad y Capacidad por Sprint
Parámetro	Valor
Velocidad objetivo	~29 pts/sprint
Distribución Must	60% → ~17 pts
Distribución Should	25% → ~7 pts
Distribución Could	15% → ~4 pts
Sprints estimados	~9 (a 248 pts totales)
2. Resumen por GAP
GAP	Nombre	Stories	Puntos	KPI Principal	Peso KPI
GAP-01	Planificación Manual	4	34	Reasignaciones/día	10%
GAP-02	Carta Porte Manual	3	26	Tiempo generación CP	10%
GAP-03	Monitoreo Manual	3	29	Monitoreo manual %	10%
GAP-04	Evidencias WhatsApp	3	29	PODs T+0	12%
GAP-05	Gráficas Temperatura	3	26	Gráficas manipuladas	8%
GAP-06	Viáticos Manuales	3	18	Depósitos comp./día	8%
GAP-07	Facturación Lenta	3	21	Días entrega→pago	12%
GAP-08	Sin Cost-to-Serve	2	13	Clientes con CTS	8%
GAP-09	Sin Kick-off	2	10	Clientes con kick-off	5%
GAP-10	Mantenimiento Reactivo	3	21	Odómetros auto %	7%
GAP-11	Sin BI Operativo	3	21	Dashboards activos	5%
3. Matriz de Impacto Completa (ordenada por impacto ↓)
#	Story ID	Título	GAP	Pts	Prioridad	MoSCoW	KPI	Peso KPI	Impacto %
1	US-04.1	Escaneo PODs en App con OCR	GAP-04	13	CRITICO	Must	PODs T+0	12%	5.38%
2	US-02.1	Auto-generación Carta Porte desde TMS	GAP-02	13	CRITICO	Must	Tiempo generación CP	10%	5.00%
3	US-08.1	Cálculo Cost-to-Serve por cliente	GAP-08	8	ALTO	Must	Clientes con CTS	8%	4.92%
4	US-07.1	Paquete facturación digital auto	GAP-07	8	ALTO	Must	Días entrega→pago	12%	4.57%
5	US-07.2	Portal ingreso digital clientes	GAP-07	8	ALTO	Should	Días entrega→pago	12%	4.57%
6	US-03.1	Tracking automático Motive-TMS	GAP-03	13	CRITICO	Must	Monitoreo manual %	10%	4.48%
7	US-05.1	Gráficas temperatura inviolables	GAP-05	13	CRITICO	Must	Gráficas manipuladas	8%	4.00%
8	US-01.2	Algoritmo de asignación óptima	GAP-01	13	CRITICO	Must	Tiempo asignación	10%	3.82%
9	US-06.1	Tarifario automático por ruta	GAP-06	8	ALTO	Must	Depósitos comp./día	8%	3.56%
10	US-04.2	PODs auto-vinculadas al viaje	GAP-04	8	CRITICO	Must	PODs perdidas %	12%	3.31%
11	US-02.2	Complementos sin refacturación	GAP-02	8	CRITICO	Must	Refacturaciones/mes	10%	3.08%
12	US-08.2	Rentabilidad por ruta y operador	GAP-08	5	ALTO	Should	Clientes con CTS	8%	3.08%
13	US-07.3	Dashboard cobranza con alertas	GAP-07	5	ALTO	Should	Días entrega→pago	12%	2.86%
14	US-03.2	Portal tracking para clientes	GAP-03	8	CRITICO	Should	Clientes con tracking	10%	2.76%
15	US-03.3	Alertas automáticas incidencias	GAP-03	8	CRITICO	Must	Llegadas tarde	10%	2.76%
16	US-10.1	Odómetro automático Motive	GAP-10	8	ALTO	Must	Odómetros auto %	7%	2.67%
17	US-10.2	Plan mantenimiento preventivo	GAP-10	8	ALTO	Must	Fallas mecánicas %	7%	2.67%
18	US-09.1	Onboarding digital clientes nuevos	GAP-09	5	ALTO	Must	Clientes con kick-off	5%	2.50%
19	US-09.2	Catálogo clientes en TMS	GAP-09	5	ALTO	Should	Clientes con kick-off	5%	2.50%
20	US-05.2	Alertas excursión temperatura	GAP-05	8	CRITICO	Must	Excursiones temp/mes	8%	2.46%
21	US-01.1	Dashboard disponibilidad unidades en tiempo real	GAP-01	8	CRITICO	Must	Reasignaciones/día	10%	2.35%
22	US-01.3	Confirmación operador vía App	GAP-01	8	CRITICO	Must	Reasignaciones/día	10%	2.35%
23	US-05.3	Auto-adjuntar gráfica a POD	GAP-05	5	CRITICO	Must	Días entrega→pago	12%	2.31%
24	US-06.2	Complementos aprobación digital	GAP-06	5	ALTO	Must	Viáticos sin comprobar	8%	2.22%
25	US-06.3	Comprobación obligatoria App	GAP-06	5	ALTO	Should	Viáticos sin comprobar	8%	2.22%
26	US-04.3	Comprobantes gasto vía App OCR	GAP-04	8	CRITICO	Should	Viáticos sin comprobar	8%	2.21%
27	US-02.3	CP digital en App operador	GAP-02	5	CRITICO	Must	Tiempo generación CP	10%	1.92%
28	US-11.1	Dashboard operativo Power BI	GAP-11	8	MEDIO	Must	Dashboards activos	5%	1.90%
29	US-11.3	Integración datos multi-fuente	GAP-11	8	MEDIO	Must	Dashboards activos	5%	1.90%
30	US-10.3	Alertas predictivas	GAP-10	5	ALTO	Should	Paros no programados	7%	1.67%
31	US-01.4	Panel asignaciones coordinadores	GAP-01	5	CRITICO	Should	Reasignaciones/día	10%	1.47%
32	US-11.2	Reportes automáticos semanales	GAP-11	5	MEDIO	Should	Dashboards activos	5%	1.19%
4. Top 10 Historias de Mayor Impacto
Estas son las historias cuya completación aporta más al Score Global:

1. US-04.1 — Escaneo PODs en App con OCR
GAP: GAP-04 (Evidencias WhatsApp)
Puntos: 13 | Prioridad: CRITICO | MoSCoW: Must
KPI: PODs T+0 (peso 12%)
Impacto: 5.38% del Score Global
Cálculo: (12% × 13) / 29 = 5.38%
2. US-02.1 — Auto-generación Carta Porte desde TMS
GAP: GAP-02 (Carta Porte Manual)
Puntos: 13 | Prioridad: CRITICO | MoSCoW: Must
KPI: Tiempo generación CP (peso 10%)
Impacto: 5.00% del Score Global
Cálculo: (10% × 13) / 26 = 5.00%
3. US-08.1 — Cálculo Cost-to-Serve por cliente
GAP: GAP-08 (Sin Cost-to-Serve)
Puntos: 8 | Prioridad: ALTO | MoSCoW: Must
KPI: Clientes con CTS (peso 8%)
Impacto: 4.92% del Score Global
Cálculo: (8% × 8) / 13 = 4.92%
4. US-07.1 — Paquete facturación digital auto
GAP: GAP-07 (Facturación Lenta)
Puntos: 8 | Prioridad: ALTO | MoSCoW: Must
KPI: Días entrega→pago (peso 12%)
Impacto: 4.57% del Score Global
Cálculo: (12% × 8) / 21 = 4.57%
5. US-07.2 — Portal ingreso digital clientes
GAP: GAP-07 (Facturación Lenta)
Puntos: 8 | Prioridad: ALTO | MoSCoW: Should
KPI: Días entrega→pago (peso 12%)
Impacto: 4.57% del Score Global
Cálculo: (12% × 8) / 21 = 4.57%
6. US-03.1 — Tracking automático Motive-TMS
GAP: GAP-03 (Monitoreo Manual)
Puntos: 13 | Prioridad: CRITICO | MoSCoW: Must
KPI: Monitoreo manual % (peso 10%)
Impacto: 4.48% del Score Global
Cálculo: (10% × 13) / 29 = 4.48%
7. US-05.1 — Gráficas temperatura inviolables
GAP: GAP-05 (Gráficas Temperatura)
Puntos: 13 | Prioridad: CRITICO | MoSCoW: Must
KPI: Gráficas manipuladas (peso 8%)
Impacto: 4.00% del Score Global
Cálculo: (8% × 13) / 26 = 4.00%
8. US-01.2 — Algoritmo de asignación óptima
GAP: GAP-01 (Planificación Manual)
Puntos: 13 | Prioridad: CRITICO | MoSCoW: Must
KPI: Tiempo asignación (peso 10%)
Impacto: 3.82% del Score Global
Cálculo: (10% × 13) / 34 = 3.82%
9. US-06.1 — Tarifario automático por ruta
GAP: GAP-06 (Viáticos Manuales)
Puntos: 8 | Prioridad: ALTO | MoSCoW: Must
KPI: Depósitos comp./día (peso 8%)
Impacto: 3.56% del Score Global
Cálculo: (8% × 8) / 18 = 3.56%
10. US-04.2 — PODs auto-vinculadas al viaje
GAP: GAP-04 (Evidencias WhatsApp)
Puntos: 8 | Prioridad: CRITICO | MoSCoW: Must
KPI: PODs perdidas % (peso 12%)
Impacto: 3.31% del Score Global
Cálculo: (12% × 8) / 29 = 3.31%
5. Ejemplo Práctico: Sprint 1
Si seleccionamos las top 4 historias Must para Sprint 1:

Story	Puntos	Impacto
US-04.1 — Escaneo PODs en App con OCR	13	5.38%
US-02.1 — Auto-generación Carta Porte desde TMS	13	5.00%
US-08.1 — Cálculo Cost-to-Serve por cliente	8	4.92%
US-07.1 — Paquete facturación digital auto	8	4.57%
TOTAL	42	19.87%
→ Con solo 4 historias (42 pts), se avanza 19.87% del Score Global.

6. Reglas de Asignación de Story Points
6.1 Criterios de Estimación
┌─────────────────────────────────────────────────────────┐
│  ¿Cuántas integraciones externas requiere?             │
│  ¿Cuántos sistemas se ven afectados?                   │
│  ¿Requiere nuevo esquema de datos?                     │
│  ¿Necesita validación/aprobación del usuario?          │
│  ¿Tiene dependencias de otras historias?               │
└─────────────────────────────────────────────────────────┘
6.2 Tabla de Referencia
Factor	1-2 pts	3 pts	5 pts	8 pts	13 pts
Integraciones	0	1 parcial	1 completa	2+	API compleja
Sistemas	1	1-2	2	2-3	3+
Datos nuevos	No	Config	Tabla	Módulo	Esquema
Validación	Auto	Simple	Moderada	Multi-paso	Flujo complejo
Dependencias	0	0-1	1	1-2	2+
6.3 Generación de Stories Adicionales
Cuando se identifica una nueva necesidad:

Vincular a GAP: Toda story debe pertenecer a un GAP existente
Estimar con Planning Poker: El equipo vota usando Fibonacci
Asignar MoSCoW: Según urgencia y dependencias
Recalcular impacto: Al agregar stories, el Total_Puntos_GAP cambia y se redistribuye el impacto
7. Notas Importantes
Impacto NO es lineal: Completar una story no sube automáticamente el KPI; el KPI sube cuando el proceso mejora operativamente
GAP cerrado ≠ KPI en meta: El GAP cierra cuando todas sus stories están Done, pero el KPI puede necesitar tiempo para reflejar la mejora
Re-estimación: Si una story de 8 pts resulta ser de 13, re-estimar ANTES del sprint
Stories de 13 pts: Considerar descomponer en 2 stories de 5+8 para mejor flujo