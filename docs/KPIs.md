1. Arquitectura General
1.1 Modelo de datos actual (KpiMetric)
interface KpiMetric {
  name: string;       // Nombre del indicador
  baseline: string;   // Valor inicial (línea base)
  current: string;    // Valor actual medido
  targetM6: string;   // Meta a 6 meses
  targetM18: string;  // Meta a 18 meses
  gap: string;        // Gap asociado (GAP-XX)
  progress: number;   // % de avance (0-100)
}
1.2 Modelo de datos propuesto para persistencia (Supabase)
CREATE TABLE kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,          -- "KPI-01"
  name TEXT NOT NULL,                 -- "PODs T+0"
  description TEXT,                   -- Descripción larga
  unit TEXT NOT NULL,                 -- "%", "min", "días", "count", "ratio"
  direction TEXT NOT NULL,            -- "maximize" | "minimize"
  baseline NUMERIC NOT NULL,          -- Valor línea base numérico
  target_m3 NUMERIC,                 -- Meta 3 meses
  target_m6 NUMERIC NOT NULL,        -- Meta 6 meses
  target_m12 NUMERIC,                -- Meta 12 meses
  target_m18 NUMERIC NOT NULL,       -- Meta 18 meses
  weight NUMERIC NOT NULL DEFAULT 10, -- Peso ponderado (%)
  gap_id TEXT NOT NULL,              -- Gap asociado
  category TEXT,                      -- "operativo" | "financiero" | "calidad" | "compliance"
  formula TEXT,                       -- Fórmula en texto legible
  data_source TEXT,                   -- Origen de datos (TMS, ERP, manual)
  frequency TEXT DEFAULT 'semanal',   -- Frecuencia de medición
  owner TEXT,                         -- Responsable del KPI
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE kpi_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID REFERENCES kpi_definitions(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL,             -- Valor medido
  measured_at DATE NOT NULL,          -- Fecha de medición
  sprint TEXT,                        -- Sprint asociado
  notes TEXT,                         -- Observaciones
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(kpi_id, measured_at)
);
2. Catálogo de 10 KPIs Core
#	Código	Nombre	Unidad	Dirección	Baseline	Meta M6	Meta M18	Peso	Gap	Categoría
1	KPI-01	Reasignaciones/día	count	minimize	1.5	0.5	0	12%	GAP-01	Operativo
2	KPI-02	Tiempo Carta Porte	min	minimize	30	0.5	0.17	10%	GAP-02	Compliance
3	KPI-03	Monitoreo manual %	%	minimize	100	5	0	12%	GAP-03	Operativo
4	KPI-04	PODs T+0	%	maximize	80	93	99	15%	GAP-04	Calidad
5	KPI-05	Gráficas manipuladas	count	minimize	1	0	0	8%	GAP-05	Calidad
6	KPI-06	Viáticos sin comprobar	%	minimize	30	10	2	8%	GAP-06	Financiero
7	KPI-07	Días entrega→pago	días	minimize	22.5	10	1.5	15%	GAP-07	Financiero
8	KPI-08	Clientes con CTS	ratio	maximize	0	0	5	8%	GAP-08	Financiero
9	KPI-09	Fallas mecánicas/mes	count	minimize	3.5	1.5	0.5	7%	GAP-10	Operativo
10	KPI-10	Dashboards activos	count	maximize	0	1	3	5%	GAP-14	Operativo
Suma total de pesos: 100%

3. Fórmulas de Cálculo
3.1 Cumplimiento individual por KPI
SI direction = "maximize":
  cumplimiento = ((actual - baseline) / (meta - baseline)) × 100

SI direction = "minimize":
  cumplimiento = ((baseline - actual) / (baseline - meta)) × 100
Restricción: cumplimiento = CLAMP(0, resultado, 120)

Mínimo: 0% (nunca negativo)
Máximo: 120% (tope para evitar distorsión)
3.2 Ejemplos de cálculo
Ejemplo A — PODs T+0 (maximize)
Baseline: 80% | Meta M18: 99% | Actual: 90%
((90 - 80) / (99 - 80)) × 100 = 52.6%
Ponderado: 52.6% × 0.15 = 7.89 puntos
Ejemplo B — Tiempo Carta Porte (minimize)
Baseline: 30 min | Meta M18: 10 seg (0.17 min) | Actual: 15 min
((30 - 15) / (30 - 0.17)) × 100 = 50.3%
Ponderado: 50.3% × 0.10 = 5.03 puntos
Ejemplo C — Superación de meta (capped)
PODs T+0: Actual: 100% (supera meta de 99%)
((100 - 80) / (99 - 80)) × 100 = 105.3% → se capea a 105.3% (dentro de 120%)
3.3 Score Global
Score Global = Σ (cumplimiento_i × peso_i)
             = Σ para i=1..10
Rango: 0 – 120 puntos (teórico máximo si todos superan metas)

4. Sistema de Semáforo
Color	Rango	Significado	CSS Token
🟢 Verde	≥ 80%	En meta o por encima	text-success
🟡 Amarillo	50% – 79%	En progreso, requiere atención	text-warning / text-medium
🔴 Rojo	< 50%	Crítico, fuera de meta	text-destructive
Implementación en código
function getSemaphore(cumplimiento: number): "green" | "yellow" | "red" {
  if (cumplimiento >= 80) return "green";
  if (cumplimiento >= 50) return "yellow";
  return "red";
}
5. Metas Progresivas (Hitos Temporales)
Cada KPI tiene hasta 4 metas incrementales:

Hito	Mes	Propósito
Meta M3	Mes 3	Quick wins, primeros resultados
Meta M6	Mes 6	Estabilización, fin Fase Foundation
Meta M12	Mes 12	Escala, fin Fase Scale
Meta M18	Mes 18	Optimización, meta final
Selección dinámica de meta activa
function getActiveMeta(kpi: KpiDefinition, currentMonth: number): number {
  if (currentMonth <= 3) return kpi.target_m3 ?? kpi.target_m6;
  if (currentMonth <= 6) return kpi.target_m6;
  if (currentMonth <= 12) return kpi.target_m12 ?? kpi.target_m18;
  return kpi.target_m18;
}
El progress en la barra de avance siempre se calcula contra la meta activa del periodo actual, no contra M18.

6. Relación KPI ↔ Gap ↔ User Stories
KPI ──── 1:1 ──── Gap ──── 1:N ──── User Stories
Reglas de vinculación
Cada KPI está asociado a exactamente un Gap
Cada Gap tiene 2-4 User Stories
El avance del Gap se calcula como: stories_done / stories_total × 100
El KPI se considera "cerrado" cuando:
Todas las stories del Gap están en Done Y
El valor actual del KPI alcanza la meta activa
Impacto de stories en KPI
// Peso de cada story en su KPI asociado
storyImpact = kpi.weight / gap.storiesCount;

// Ejemplo: GAP-04 tiene 3 stories, KPI-04 pesa 15%
// Cada story aporta: 15% / 3 = 5% al Score Global (máximo)
7. Cómo Agregar Nuevos KPIs
7.1 Checklist para un nuevo KPI
Definir parámetros obligatorios:

code: Código único (KPI-11, KPI-12...)
name: Nombre descriptivo corto
unit: Unidad de medida
direction: ¿Se busca subir o bajar?
baseline: Valor actual verificado
Metas: Al menos M6 y M18
Asignar peso:

Rebalancear pesos existentes para que sumen 100%
Criterios de peso:
Impacto financiero directo → peso alto (12-15%)
Impacto operativo → peso medio (8-12%)
Soporte/estructural → peso bajo (5-8%)
Vincular a Gap:

Crear Gap si no existe
Crear User Stories asociadas
Configurar fuente de datos:

Definir data_source (TMS, ERP, manual, API)
Definir frequency de medición
7.2 Rebalanceo de pesos
function rebalanceWeights(kpis: KpiDefinition[], newKpi: KpiDefinition): KpiDefinition[] {
  const totalBeforeNew = kpis.reduce((sum, k) => sum + k.weight, 0);
  const scaleFactor = (100 - newKpi.weight) / totalBeforeNew;
  
  return kpis.map(k => ({
    ...k,
    weight: Math.round(k.weight * scaleFactor * 100) / 100
  }));
}
7.3 Ejemplo: Agregar KPI-11
const nuevoKpi: KpiDefinition = {
  code: "KPI-11",
  name: "Satisfacción del cliente",
  unit: "%",
  direction: "maximize",
  baseline: 65,
  target_m3: 70,
  target_m6: 78,
  target_m12: 85,
  target_m18: 92,
  weight: 8,  // Se redistribuye de los existentes
  gap_id: "GAP-19",
  category: "calidad",
  formula: "(encuestas_positivas / encuestas_totales) × 100",
  data_source: "Encuesta post-servicio",
  frequency: "mensual",
  owner: "Irhec Vázquez"
};
8. Frecuencia y Método de Medición
KPI	Frecuencia	Fuente	Método
KPI-01 Reasignaciones	Diario	TMS	Automático
KPI-02 Carta Porte	Por viaje	SAT/TMS	Automático
KPI-03 Monitoreo	Semanal	GPS/Telemetría	Automático
KPI-04 PODs	Diario	App móvil	Automático
KPI-05 Gráficas temp.	Por viaje	IoT/sensores	Automático
KPI-06 Viáticos	Quincenal	ERP/Contabilidad	Semi-manual
KPI-07 Ciclo cobro	Semanal	ERP/Facturación	Automático
KPI-08 CTS	Mensual	ERP/Finanzas	Manual
KPI-09 Fallas	Mensual	Mantenimiento	Semi-manual
KPI-10 Dashboards	Sprint	Plataforma	Automático
Registro de mediciones
async function registrarMedicion(kpiId: string, valor: number, notas?: string) {
  const { error } = await supabase
    .from('kpi_measurements')
    .upsert({
      kpi_id: kpiId,
      value: valor,
      measured_at: new Date().toISOString().split('T')[0],
      notes: notas,
      recorded_by: (await supabase.auth.getUser()).data.user?.id
    }, { onConflict: 'kpi_id,measured_at' });
  
  if (error) throw error;
}
9. Visualización en UI (Componente actual)
9.1 Estructura actual del KpiDashboard
┌──────────────────────────────────┐
│ [Nombre KPI]          [GAP-XX]  │
│ [Baseline] ──→ [Meta M18]       │
│ ████████░░░░░░░░░ (progress %)  │
│ Meta M6: X        Meta M18: Y   │
└──────────────────────────────────┘
Grid responsive: 1 columna (mobile) → 2 columnas (sm+)
Barra de progreso: bg-primary sobre bg-muted
Baseline en text-destructive, meta en text-success
9.2 Mejoras propuestas para implementación
Mejora	Descripción
Semáforo visual	Cambiar color de barra según cumplimiento
Valor actual	Mostrar current como badge prominente
Tendencia	Icono ↑ ↓ → según última vs penúltima medición
Peso visible	Badge con {weight}% en cada card
Score Global	Card hero al inicio con puntaje ponderado total
Sparkline	Mini gráfica de últimas 6 mediciones
Filtro por categoría	Tabs: Operativo / Financiero / Calidad / Compliance
10. Reglas de Negocio Adicionales
10.1 Alertas automáticas
interface KpiAlert {
  type: "danger" | "warning" | "stagnant";
  kpiCode: string;
  message: string;
  triggeredAt: Date;
}

// Reglas de disparo:
// 1. DANGER: cumplimiento < 30% después del mes 3
// 2. WARNING: cumplimiento < meta del hito actual
// 3. STAGNANT: sin cambio en valor por 3 mediciones consecutivas
10.2 Ownership y permisos
Rol	Puede ver	Puede medir	Puede crear KPI	Puede reponderar
Viewer	✅	❌	❌	❌
Champion	✅ Sus KPIs	✅ Sus KPIs	❌	❌
Admin	✅ Todos	✅ Todos	✅	✅
10.3 Historial y auditoría
Cada medición en kpi_measurements es inmutable. Para correcciones:

Se agrega una nueva medición con la misma fecha y notes explicando la corrección
La UI muestra la última medición por fecha (ORDER BY created_at DESC)
10.4 Exportación
El sistema debe soportar:

CSV: Todas las mediciones con fecha, valor y KPI
PDF: Reporte ejecutivo con Score Global, semáforos y tendencias
Dashboard snapshot: Imagen del estado actual para steering committee
11. Parámetros de Configuración Global
const KPI_CONFIG = {
  MAX_CUMPLIMIENTO: 120,        // Tope máximo de cumplimiento %
  MIN_CUMPLIMIENTO: 0,          // Piso mínimo
  SEMAPHORE_GREEN: 80,          // Umbral verde
  SEMAPHORE_YELLOW: 50,         // Umbral amarillo
  STAGNANT_THRESHOLD: 3,        // Mediciones sin cambio = alerta
  TOTAL_WEIGHT: 100,            // Suma total de pesos debe ser 100
  PROJECT_DURATION_MONTHS: 18,  // Duración del roadmap
  PHASES: {
    foundation: { start: 1, end: 6 },
    scale: { start: 7, end: 12 },
    optimize: { start: 13, end: 18 }
  }
};
12. Resumen de Implementación
Para replicar este sistema necesitas:
Base de datos: 2 tablas (kpi_definitions, kpi_measurements)
RLS: Políticas por rol (viewer/champion/admin)
Lógica de negocio: Funciones de cumplimiento, score global, semáforo
UI: Dashboard con cards, barras, tendencias y score hero
Mediciones: Flujo de captura manual o integración con fuentes
Alertas: Sistema de notificaciones por umbrales
Reportes: Exportación CSV/PDF para governance
Archivos clave a crear/modificar:
Archivo	Propósito
kpi_definitions (migration)	Tabla de definiciones
kpi_measurements (migration)	Tabla de mediciones
src/hooks/useKpis.ts	Hook para CRUD y cálculos
src/components/KpiDashboard.tsx	Dashboard mejorado
src/lib/kpiCalculations.ts	Funciones puras de cálculo
src/data/backlogData.ts	Actualizar interface KpiMetric
Documento generado el 2026-04-10 — Plataforma de Transformación O2C

13. Metodología de Story Points
13.1 Escala de Puntos
El sistema utiliza una escala Fibonacci modificada para estimar esfuerzo:

Puntos	Esfuerzo	Ejemplo típico
1	Trivial (< 2 hrs)	Cambio de configuración
2	Pequeño (2-4 hrs)	Ajuste de regla de negocio
3	Moderado (1-2 días)	Nueva pantalla simple
5	Significativo (3-5 días)	Integración con API externa
8	Grande (1-2 semanas)	Módulo completo nuevo
13	Épico (2-4 semanas)	Sistema end-to-end
13.2 Distribución actual en el backlog
Concepto	Valor
Total de Stories	46
Total de Story Points	~350
Promedio por Story	~7.6 pts
Rango por Gap	8 – 34 pts
Sprints totales	12 (de 4 semanas c/u)
Velocidad objetivo	~29 pts/sprint
13.3 Cómo se asignan puntos
Complejidad técnica: ¿Requiere integración, nueva tabla, lógica compleja?
Incertidumbre: ¿Se conoce bien el requerimiento o hay ambigüedad?
Dependencias: ¿Depende de otro Gap o sistema externo?
Volumen de cambio: ¿Cuántas pantallas, endpoints, o flujos involucra?
// Criterios de estimación
interface EstimationCriteria {
  technicalComplexity: 1 | 2 | 3;  // 1=baja, 3=alta
  uncertainty: 1 | 2 | 3;
  dependencies: 0 | 1 | 2;         // 0=ninguna, 2=críticas
  changeVolume: 1 | 2 | 3;
}

function suggestPoints(c: EstimationCriteria): number {
  const score = c.technicalComplexity + c.uncertainty + c.dependencies + c.changeVolume;
  if (score <= 4) return 2;
  if (score <= 6) return 3;
  if (score <= 8) return 5;
  if (score <= 10) return 8;
  return 13;
}
13.4 Relación puntos → impacto en KPI
Cada story aporta al avance de su Gap y, por extensión, al KPI asociado:

Impacto potencial de 1 Story en Score Global =
  (kpi.weight / gap.storiesCount) × (story.points / gap.totalPoints)
Ejemplo concreto — GAP-04 (Evidencias WhatsApp):

KPI-04 peso: 15%
Stories: 3 | Total puntos: 29
Story de 13 pts:
Impacto = (15% / 3) × (13 / 29) = 5% × 0.45 = 2.24% del Score Global
Story de 8 pts:
Impacto = (15% / 3) × (8 / 29) = 5% × 0.28 = 1.38% del Score Global
14. Sistema de Metas — Metodología Completa
14.1 Estructura de metas por horizonte temporal
                    Fase Foundation    Fase Scale      Fase Optimize
Mes:          1───3───6─────────12─────────────18
              │   │   │          │              │
Meta M3 ──────┘   │   │          │              │
Meta M6 ──────────┘   │          │              │
Meta M12 ─────────────┘          │              │
Meta M18 ────────────────────────┘              │
14.2 Criterios para definir metas
Criterio	Descripción	Ejemplo
Alcanzable	Basado en benchmarks del sector o mejoras incrementales	PODs: 80% → 93% en M6 (mejora de 16%)
Medible	Valor numérico concreto, no ambiguo	"< 30 seg" no "más rápido"
Progresivo	Cada hito es mayor que el anterior	M3 < M6 < M12 < M18
Vinculado a fase	Alineado con la fase del roadmap	Foundation = quick wins
14.3 Reglas de progresión por fase
Fase Foundation (M1-M6)
Objetivo: Eliminar procesos manuales críticos
Meta típica: Reducir 50-70% del gap entre baseline y meta final
KPIs prioritarios: CRITICO (KPI-01 a KPI-05)
Fase Scale (M7-M12)
Objetivo: Escalar soluciones a toda la operación
Meta típica: Alcanzar 70-85% del objetivo final
KPIs prioritarios: ALTO (KPI-06 a KPI-09)
Fase Optimize (M13-M18)
Objetivo: Optimización continua y excelencia operativa
Meta típica: 100% del objetivo final
KPIs prioritarios: Todos al nivel target
14.4 Cálculo de meta intermedia cuando no está definida
Si un KPI no tiene meta M3 o M12 explícita, se interpola linealmente:

function interpolateMeta(
  baseline: number,
  targetM6: number,
  targetM18: number,
  targetMonth: number
): number {
  if (targetMonth <= 6) {
    // Interpolación lineal baseline → M6
    return baseline + (targetM6 - baseline) * (targetMonth / 6);
  }
  // Interpolación lineal M6 → M18
  return targetM6 + (targetM18 - targetM6) * ((targetMonth - 6) / 12);
}

// Ejemplo: KPI-04 PODs, meta en mes 9
// interpolate(80, 93, 99, 9) = 93 + (99 - 93) * (3/12) = 94.5%
14.5 Evaluación de cumplimiento por hito
Al cierre de cada hito temporal se evalúa:

interface MilestoneEvaluation {
  kpiCode: string;
  milestone: "M3" | "M6" | "M12" | "M18";
  targetValue: number;
  actualValue: number;
  cumplimiento: number;      // % calculado con fórmula direction-aware
  semaphore: "green" | "yellow" | "red";
  status: "achieved" | "at_risk" | "missed";
  actionRequired: string;
}

function evaluateMilestone(kpi, actual, milestone): MilestoneEvaluation {
  const target = kpi[`target_${milestone.toLowerCase()}`];
  const cumplimiento = calculateCumplimiento(kpi, actual);
  
  return {
    kpiCode: kpi.code,
    milestone,
    targetValue: target,
    actualValue: actual,
    cumplimiento,
    semaphore: getSemaphore(cumplimiento),
    status: cumplimiento >= 95 ? "achieved" 
           : cumplimiento >= 70 ? "at_risk" 
           : "missed",
    actionRequired: cumplimiento < 70 
      ? "Escalar a steering committee" 
      : cumplimiento < 95 
        ? "Plan de acción correctivo" 
        : "Mantener curso"
  };
}
14.6 Tabla de metas completa por KPI
KPI	Baseline	Meta M3	Meta M6	Meta M12	Meta M18	Tipo progresión
KPI-01 Reasignaciones	1.5	1.0	0.5	0.2	0	Lineal decreciente
KPI-02 Carta Porte	30 min	10 min	30 seg	15 seg	10 seg	Exponencial decreciente
KPI-03 Monitoreo	100%	50%	5%	2%	0%	Escalón (automatización)
KPI-04 PODs	80%	87%	93%	97%	99%	Logarítmica creciente
KPI-05 Gráficas	Ocurre	0	0	0	0	Binaria (0 = éxito)
KPI-06 Viáticos	30%	20%	10%	5%	2%	Lineal decreciente
KPI-07 Ciclo cobro	22.5 días	15	10	5	1.5	Lineal decreciente
KPI-08 CTS	0/5	0/5	0/5	3/5	5/5	Escalón (por cliente)
KPI-09 Fallas	3.5	2.5	1.5	1.0	0.5	Lineal decreciente
KPI-10 Dashboards	0	0	1	2	3	Escalón (por entregable)
14.7 Sprint Planning y velocity
// Capacidad por sprint
const SPRINT_DURATION_WEEKS = 4;
const TEAM_VELOCITY_POINTS = 29;  // Promedio target

// Distribución de puntos por prioridad MoSCoW en sprint
const MOSCOW_ALLOCATION = {
  Must:   0.60,  // 60% de la capacidad → ~17 pts
  Should: 0.25,  // 25% → ~7 pts
  Could:  0.15,  // 15% → ~4 pts
  "Won't": 0     // No se planifica
};

function planSprint(stories: UserStory[], sprintCapacity: number): UserStory[] {
  const sorted = stories
    .filter(s => s.status === "Backlog")
    .sort((a, b) => {
      const moscowOrder = { Must: 0, Should: 1, Could: 2, "Won't": 3 };
      const prioOrder = { CRITICO: 0, ALTO: 1, MEDIO: 2, ESTRUCTURAL: 3 };
      return moscowOrder[a.moscow] - moscowOrder[b.moscow]
          || prioOrder[a.priority] - prioOrder[b.priority];
    });

  let remaining = sprintCapacity;
  return sorted.filter(s => {
    if (s.storyPoints <= remaining) {
      remaining -= s.storyPoints;
      return true;
    }
    return false;
  });
}
15. Governance — Revisión de Metas
15.1 Cadencia de revisión
Reunión	Frecuencia	Participantes	Contenido
Daily Standup	Diaria	Equipo	Blockers, avance stories
Sprint Review	Cada 4 sem	Equipo + Champions	Demo + KPIs del sprint
Steering Committee	Mensual	Dirección + PO	Score Global, semáforos, decisiones
Milestone Review	M3, M6, M12, M18	Todos	Evaluación formal de metas
15.2 Criterios de re-calibración de metas
Una meta puede re-calibrarse si:

Cambio de contexto externo: regulación, mercado, tecnología
Meta inalcanzable demostrada: 3 sprints consecutivos sin progreso significativo
Meta superada anticipadamente: se sube el target al siguiente horizonte
interface MetaRecalibration {
  kpiCode: string;
  originalTarget: number;
  newTarget: number;
  reason: string;
  approvedBy: string;       // Debe ser rol Admin
  effectiveFrom: string;    // Fecha
}
Complemento de metodología de puntos y metas — 2026-04-10