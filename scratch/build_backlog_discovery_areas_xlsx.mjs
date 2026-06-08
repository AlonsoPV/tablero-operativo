import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/product-backlog";
const outputPath = path.join(outputDir, "Product_Backlog_Discovery_Areas.xlsx");

const productObjectives = [
  ["Centralizar pendientes operativos", "Todo pendiente relevante vive en el tablero.", "% acciones registradas en tablero vs. seguimiento externo"],
  ["Clarificar ownership", "Cada accion tiene responsable de cumplimiento y area involucrada.", "% acciones sin responsable claro"],
  ["Reducir retrasos invisibles", "El tablero alerta vencimientos, bloqueos y dependencias.", "Acciones vencidas y bloqueadas por area"],
  ["Instalar SLA y escalamiento", "Cada proceso critico tiene regla de tiempo y escalamiento.", "% acciones dentro de SLA"],
  ["Conectar tareas con KPIs", "Las acciones impactan indicadores por area.", "% acciones vinculadas a KPI o brecha"],
  ["Mejorar adopcion", "Las juntas operan desde el tablero, no desde Excel/WhatsApp.", "Uso semanal: acciones creadas, movidas y cerradas"],
];

const epics = [
  ["EP-01", "Control operativo basico", "Acciones abiertas sin claridad de responsable, fecha, prioridad o estado.", "Transversal", "Critica"],
  ["EP-02", "Finanzas piloto", "PODs, cobranza, viaticos y evidencias sin trazabilidad suficiente.", "Finanzas", "Critica"],
  ["EP-03", "SLAs y escalamiento", "La operacion se entera tarde y escala de forma informal.", "Transversal", "Alta"],
  ["EP-04", "Dependencias entre areas", "Cuando una accion cruza areas se diluye la responsabilidad.", "Transversal", "Alta"],
  ["EP-05", "Indicadores por area", "El tablero debe medir operacion, no solo listar pendientes.", "Finanzas, RH, Sistemas", "Alta"],
  ["EP-06", "RH operativo", "Solicitudes, vacantes, capacitacion y clima sin seguimiento visible.", "RH", "Media"],
  ["EP-07", "Sistemas como habilitador", "Proyectos, issues, prioridades y alcance sin definicion consistente.", "Sistemas", "Media"],
  ["EP-08", "Adopcion y gobierno", "Riesgo de que el tablero se vuelva otro Excel si no hay ritual.", "Direccion / Lideres", "Alta"],
];

const backlog = [
  ["PB-001", "EP-01", "Como direccion, quiero ver todas las acciones abiertas por estado, prioridad, area y responsable, para saber que esta pendiente y quien debe cerrarlo.", "Visibilidad basica de control operativo.", "Critica", 5, "Transversal", "Sprint 1", "Backlog", "El tablero muestra acciones abiertas, vencidas, bloqueadas y terminadas; permite filtrar por estado, prioridad, area y responsable.", "Catalogos minimos de areas, prioridades y estados.", "Acciones abiertas / vencidas"],
  ["PB-002", "EP-01", "Como lider de area, quiero que cada accion tenga responsable de cumplimiento, fecha limite y prioridad obligatoria, para evitar pendientes sin dueno.", "Mayor accountability.", "Critica", 3, "Transversal", "Sprint 1", "Backlog", "No se puede crear una accion operativa sin responsable, fecha limite, prioridad y area.", "Definir campos obligatorios.", "% acciones sin responsable"],
  ["PB-003", "EP-02", "Como finanzas, quiero registrar y dar seguimiento a PODs locales y foraneas con fecha compromiso, para controlar recuperacion de evidencias.", "Menos PODs vencidas y mejor cobranza.", "Critica", 5, "Finanzas", "Sprint 1", "Backlog", "Una accion POD distingue local/foranea, calcula vencimiento esperado y muestra estatus.", "Definir regla POD local 3 dias y foranea 7 dias.", "% PODs en tiempo"],
  ["PB-004", "EP-02", "Como finanzas, quiero ver PODs vencidas por cliente, ruta u operador, para detectar donde se acumulan rechazos o retrasos.", "Priorizacion de recuperacion de evidencia.", "Alta", 5, "Finanzas", "Sprint 1", "Backlog", "Existe vista o filtro de PODs vencidas por cliente/ruta/operador y responsable.", "Datos minimos de cliente/ruta/operador.", "PODs vencidas por cliente"],
  ["PB-005", "EP-02", "Como finanzas, quiero registrar monto pendiente de cobranza y vincularlo a acciones, para dar seguimiento a impacto financiero.", "Cobranza conectada con accion operativa.", "Alta", 5, "Finanzas", "Sprint 1", "Backlog", "Una accion puede incluir monto pendiente y cliente; el tablero permite ver total abierto.", "Definir formato de monto y cliente.", "Monto pendiente de cobranza / DSO"],
  ["PB-006", "EP-03", "Como responsable, quiero que el tablero marque acciones que vencen hoy o ya vencieron, para actuar antes de que escalen.", "Menos sorpresas operativas.", "Alta", 3, "Transversal", "Sprint 2", "Backlog", "Las acciones muestran semaforo: en tiempo, vence hoy, vencida 1 dia, vencida 2+ dias.", "Fecha limite obligatoria.", "Acciones vencidas"],
  ["PB-007", "EP-03", "Como direccion, quiero reglas de escalamiento por vencimiento, para que los bloqueos suban al nivel correcto.", "Escalamiento formal y trazable.", "Alta", 5, "Transversal", "Sprint 2", "Backlog", "Vence hoy asigna alerta al responsable; vencido 1 dia al lider de area; vencido 2+ dias a direccion/comite.", "Definir lider por area.", "% acciones escaladas a tiempo"],
  ["PB-008", "EP-04", "Como lider operativo, quiero marcar dependencias entre areas, para que los retrasos no queden ocultos.", "Claridad de bloqueos cruzados.", "Alta", 5, "Transversal", "Sprint 2", "Backlog", "Una accion puede indicar area dependiente, responsable del bloqueo y fecha objetivo de desbloqueo.", "Catalogo de areas y usuarios.", "Acciones bloqueadas por area"],
  ["PB-009", "EP-04", "Como finanzas, quiero registrar cuando una evidencia depende de Operaciones, para que el ownership no se diluya.", "Menos friccion entre Finanzas y Operaciones.", "Alta", 3, "Finanzas / Operaciones", "Sprint 2", "Backlog", "La accion muestra responsable de cumplimiento y area requerida para desbloquear evidencia.", "Definir flujo Finanzas-Operaciones.", "PODs bloqueadas por Operaciones"],
  ["PB-010", "EP-02", "Como finanzas, quiero dar seguimiento a viaticos pendientes de comprobar, para reducir gastos sin trazabilidad.", "Control de comprobaciones.", "Alta", 5, "Finanzas", "Sprint 2", "Backlog", "Se pueden registrar viaticos pendientes, responsable, fecha limite, monto y evidencia esperada.", "Definir datos minimos de viaticos.", "Viaticos pendientes de comprobar"],
  ["PB-011", "EP-02", "Como auditor financiero, quiero marcar evidencias rechazadas por cliente, ruta u operador, para identificar causas recurrentes.", "Aprendizaje sobre errores repetidos.", "Media", 5, "Finanzas", "Sprint 3", "Backlog", "Las evidencias pueden quedar como aceptadas/rechazadas con motivo y comentario.", "Catalogo de motivos de rechazo.", "Evidencias rechazadas"],
  ["PB-012", "EP-06", "Como RH, quiero registrar solicitudes internas con responsable, fecha limite y estatus, para evitar seguimiento informal.", "Trazabilidad de solicitudes RH.", "Media", 3, "RH", "Sprint 3", "Backlog", "RH puede crear solicitudes con tipo, solicitante, responsable, fecha y estado.", "Definir tipos de solicitud RH.", "Solicitudes abiertas y vencidas"],
  ["PB-013", "EP-06", "Como RH, quiero visualizar vacantes por estatus, para medir cobertura y cuellos de botella.", "Mejor seguimiento de reclutamiento.", "Media", 5, "RH", "Sprint 3", "Backlog", "Una vacante puede pasar por estados definidos y mostrar dias abierta.", "Catalogo de estatus de vacante.", "Vacantes abiertas / tiempo de cobertura"],
  ["PB-014", "EP-06", "Como RH, quiero dar seguimiento a capacitaciones programadas vs completadas, para mejorar adopcion y cumplimiento.", "Capacitacion verificable.", "Media", 3, "RH", "Sprint 4", "Backlog", "Se registran capacitaciones con fecha, participantes, estatus y evidencia de cierre.", "Definir calendario y responsables.", "% capacitaciones completadas"],
  ["PB-015", "EP-07", "Como Sistemas, quiero registrar solicitudes con alcance, prioridad y area solicitante, para evitar trabajo ambiguo o fuera de alcance.", "Mejor intake de proyectos/issues.", "Media", 5, "Sistemas", "Sprint 3", "Backlog", "Una solicitud de Sistemas requiere problema, alcance, prioridad, area solicitante y criterio de aceptacion.", "Definir tipos: proyecto, issue, soporte, mejora.", "Solicitudes fuera de alcance"],
  ["PB-016", "EP-07", "Como Sistemas, quiero ver issues/incidentes abiertos por severidad y tiempo de resolucion, para priorizar correctamente.", "Mejor gestion de soporte.", "Media", 5, "Sistemas", "Sprint 4", "Backlog", "Issues muestran severidad, responsable, fecha limite y tiempo abierto.", "Definir severidades y SLA.", "Tiempo promedio de resolucion"],
  ["PB-017", "EP-05", "Como direccion, quiero un maximo de 5 KPIs por area, para mantener foco ejecutivo.", "Medicion simple y accionable.", "Alta", 3, "Direccion", "Sprint 4", "Backlog", "Finanzas, RH y Sistemas tienen hasta 5 KPIs activos cada uno, con definicion y responsable.", "Aprobacion de direccion y lideres.", "KPIs activos por area"],
  ["PB-018", "EP-05", "Como lider de area, quiero vincular cada accion a un KPI o brecha, para entender que resultado busca mover.", "Acciones conectadas a impacto.", "Alta", 5, "Transversal", "Sprint 4", "Backlog", "Al crear una accion estrategica se puede seleccionar KPI/brecha asociada.", "Catalogo de KPIs y brechas.", "% acciones vinculadas a KPI"],
  ["PB-019", "EP-08", "Como Scrum Master, quiero operar juntas semanales desde el tablero, para sustituir seguimiento por Excel y WhatsApp.", "Ritual operativo consistente.", "Alta", 2, "Transversal", "Sprint 1", "Backlog", "Existe agenda semanal: revisar vencidas, bloqueadas, prioridades y cierres.", "Respaldo de direccion.", "Uso semanal del tablero"],
  ["PB-020", "EP-08", "Como direccion, quiero declarar el tablero como fuente oficial de seguimiento, para que lo que no este registrado no sea prioridad formal.", "Adopcion organizacional.", "Critica", 1, "Direccion", "Sprint 1", "Backlog", "Direccion comunica regla de uso y lideres de area la aplican en juntas.", "Decision directiva.", "% acciones creadas en tablero"],
  ["PB-021", "EP-08", "Como lider de area, quiero cerrar o redefinir acciones viejas o mal definidas, para limpiar ruido operativo.", "Backlog sano y confiable.", "Media", 3, "Transversal", "Sprint 2", "Backlog", "Acciones sin responsable, fecha o criterio de cierre se depuran o se reescriben.", "Revision por area.", "Acciones obsoletas cerradas"],
  ["PB-022", "EP-03", "Como direccion, quiero revisar semanalmente bloqueos por area, para resolver dependencias antes de que afecten clientes.", "Mejor respuesta transversal.", "Alta", 3, "Transversal", "Sprint 2", "Backlog", "La junta semanal muestra top bloqueos por area, responsable y antiguedad.", "Uso consistente de estado Bloqueado.", "Bloqueos abiertos por area"],
  ["PB-023", "EP-02", "Como finanzas, quiero registrar gastos auditados y pendientes de auditoria, para dar visibilidad a control financiero.", "Mayor trazabilidad de gastos.", "Media", 5, "Finanzas", "Sprint 4", "Backlog", "El tablero muestra % gastos auditados y pendientes con responsable.", "Definir criterios de auditoria.", "% gastos auditados"],
  ["PB-024", "EP-06", "Como RH, quiero registrar quejas o sugerencias abiertas, para dar seguimiento a clima laboral.", "Mejor visibilidad de temas humanos.", "Baja", 3, "RH", "Sprint 5", "Backlog", "Cada queja/sugerencia tiene estado, responsable y fecha objetivo de respuesta.", "Definir confidencialidad y permisos.", "Quejas/sugerencias abiertas"],
  ["PB-025", "EP-07", "Como Sistemas, quiero medir adopcion del tablero por area, para saber donde se necesita soporte o capacitacion.", "Mejor implementacion cultural.", "Media", 3, "Sistemas / Direccion", "Sprint 5", "Backlog", "Se reportan acciones creadas, actualizadas y cerradas por area semanalmente.", "Auditoria de actividad.", "Uso del tablero por area"],
];

const sprint1 = [
  ["PB-020", "Tablero como fuente oficial de seguimiento", "Sin decision directiva, la adopcion queda debil.", 1],
  ["PB-001", "Vista de acciones por estado, prioridad, area y responsable", "Crea visibilidad inmediata.", 5],
  ["PB-002", "Campos obligatorios minimos", "Evita acciones sin dueno o fecha.", 3],
  ["PB-003", "Seguimiento de PODs local/foranea", "Piloto de Finanzas con impacto claro.", 5],
  ["PB-004", "PODs vencidas por cliente/ruta/operador", "Permite priorizar recuperacion de evidencias.", 5],
  ["PB-005", "Cobranza vinculada a acciones", "Conecta pendiente operativo con impacto financiero.", 5],
  ["PB-019", "Junta semanal desde tablero", "Instala ritual desde el inicio.", 2],
];

const kpis = [
  ["Finanzas", "% PODs recuperadas en tiempo", "PODs cerradas dentro de SLA / PODs totales.", "Medir cumplimiento de evidencia."],
  ["Finanzas", "PODs vencidas por cliente", "PODs fuera de SLA agrupadas por cliente.", "Priorizar clientes con riesgo."],
  ["Finanzas", "DSO", "Dias promedio de cobranza.", "Conectar cobranza con evidencia pendiente."],
  ["Finanzas", "Viaticos pendientes de comprobar", "Monto o numero de comprobaciones abiertas.", "Controlar gastos sin soporte."],
  ["Finanzas", "Evidencias rechazadas", "Evidencias rechazadas por cliente/ruta/operador.", "Identificar causas recurrentes."],
  ["RH", "Vacantes abiertas por estatus", "Vacantes en proceso por etapa.", "Gestionar reclutamiento."],
  ["RH", "Tiempo promedio de cobertura", "Dias desde apertura hasta contratacion.", "Medir velocidad de reclutamiento."],
  ["RH", "Rotacion semanal/mensual", "Bajas del periodo / plantilla.", "Identificar riesgo de talento."],
  ["RH", "Solicitudes abiertas y vencidas", "Solicitudes RH no cerradas o fuera de fecha.", "Controlar servicio interno."],
  ["RH", "Capacitaciones completadas", "Completadas / programadas.", "Medir adopcion y cumplimiento."],
  ["Sistemas", "Proyectos abiertos por estatus", "Proyectos activos agrupados por estado.", "Priorizar portafolio."],
  ["Sistemas", "Issues/incidentes abiertos", "Tickets activos por severidad.", "Controlar soporte."],
  ["Sistemas", "Acciones bloqueadas por dependencia externa", "Acciones detenidas por otra area.", "Gestionar cuellos de botella."],
  ["Sistemas", "Tiempo promedio de resolucion", "Dias desde apertura hasta cierre.", "Medir respuesta."],
  ["Sistemas", "Solicitudes fuera de alcance", "Solicitudes rechazadas o redefinidas por alcance.", "Mejorar intake y definicion."],
];

const sla = [
  ["POD local", "3 dias", "Vence hoy: responsable; vencido 1 dia: lider de area; vencido 2+ dias: direccion/comite."],
  ["POD foranea", "7 dias", "Vence hoy: responsable; vencido 1 dia: lider de area; vencido 2+ dias: direccion/comite."],
  ["Solicitudes RH", "Por tipo de solicitud", "Misma regla base, ajustada por criticidad."],
  ["Issues Sistemas", "Por severidad", "Critico escala el mismo dia; menor sigue regla base."],
  ["Dependencias entre areas", "Fecha objetivo por bloqueo", "Responsable del bloqueo debe actualizar avance antes de la junta semanal."],
];

const decisions = [
  ["Confirmar que el tablero sera fuente oficial de seguimiento.", "Evita duplicidad con Excel y WhatsApp."],
  ["Respaldar que las juntas se hagan desde el tablero.", "Convierte el tablero en ritual operativo."],
  ["Nombrar lider responsable por area.", "Aclara accountability y escalamiento."],
  ["Aprobar SLA iniciales y reglas de escalamiento.", "Permite anticipar riesgos y reducir sorpresas."],
  ["Aceptar que lo que no este en tablero no sera prioridad formal.", "Refuerza adopcion y disciplina operativa."],
];

const ready = [
  ["Tiene area responsable.", ""],
  ["Tiene responsable de cumplimiento o rol responsable.", ""],
  ["Tiene fecha limite o regla de SLA.", ""],
  ["Tiene prioridad definida.", ""],
  ["Tiene criterio de cierre verificable.", ""],
  ["Tiene KPI, brecha o razon de negocio asociada.", ""],
  ["Sus dependencias estan identificadas.", ""],
];

const done = [
  ["La accion, vista, regla o proceso esta disponible en el tablero.", ""],
  ["Los usuarios responsables pueden usarlo sin depender de Excel externo.", ""],
  ["El item fue validado por el lider del area correspondiente.", ""],
  ["Existen criterios de cierre y evidencia cuando aplique.", ""],
  ["Los datos pueden filtrarse por area, estado, prioridad y responsable.", ""],
  ["El Product Owner acepta el resultado.", ""],
];

const roadmap = [
  ["30 dias", "Control operativo", "Acciones reales cargadas, Finanzas piloto, campos minimos, filtros, juntas desde tablero."],
  ["60 dias", "SLA y escalamiento", "Semaforos, reglas de vencimiento, bloqueos por area, dependencias cruzadas, revision semanal."],
  ["90 dias", "KPIs y adopcion", "Maximo 5 KPIs por area, acciones vinculadas a KPIs, medicion de uso, gobierno operativo."],
];

const priorityOrder = ["Critica", "Alta", "Media", "Baja"];
const prioritySummary = priorityOrder.map((p) => [p, backlog.filter((r) => r[4] === p).length]);
const areaNames = [...new Set(backlog.map((r) => r[6]))].sort();
const areaSummary = areaNames.map((a) => [a, backlog.filter((r) => r[6] === a).length]);
const sprintNames = [...new Set(backlog.map((r) => r[7]))].sort();
const sprintSummary = sprintNames.map((s) => [s, backlog.filter((r) => r[7] === s).length, backlog.filter((r) => r[7] === s).reduce((sum, r) => sum + r[5], 0)]);

function title(sheet, text, subtitle = "") {
  sheet.showGridLines = false;
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [[text]];
  sheet.getRange("A1").format = {
    fill: "#0F2F45",
    font: { name: "Aptos", bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "center",
  };
  if (subtitle) {
    sheet.getRange("A2:H2").merge();
    sheet.getRange("A2").values = [[subtitle]];
    sheet.getRange("A2").format = {
      fill: "#EAF4FB",
      font: { name: "Aptos", italic: true, color: "#243B53", size: 10 },
      horizontalAlignment: "center",
    };
  }
}

function addTable(sheet, startRow, headers, rows, name) {
  const colCount = headers.length;
  sheet.getRangeByIndexes(startRow, 0, 1, colCount).values = [headers];
  sheet.getRangeByIndexes(startRow + 1, 0, rows.length, colCount).values = rows;
  const rng = sheet.getRangeByIndexes(startRow, 0, rows.length + 1, colCount);
  rng.format = {
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "all", style: "thin", color: "#D6DEE5" },
  };
  sheet.getRangeByIndexes(startRow, 0, 1, colCount).format = {
    fill: "#D9EAF7",
    font: { bold: true, color: "#102A43" },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#B7C9D6" },
  };
  try {
    sheet.tables.add(rng.address, true, name);
  } catch {}
  return rng;
}

function setWidths(sheet, widths) {
  widths.forEach((w, i) => sheet.getRangeByIndexes(0, i, 1, 1).format.columnWidthPx = w);
}

function applyPriorityCf(sheet, rangeAddress) {
  const range = sheet.getRange(rangeAddress);
  range.conditionalFormats.add("containsText", { text: "Critica", format: { fill: "#FEE2E2", font: { bold: true, color: "#991B1B" } } });
  range.conditionalFormats.add("containsText", { text: "Alta", format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } } });
  range.conditionalFormats.add("containsText", { text: "Media", format: { fill: "#DBEAFE", font: { bold: true, color: "#1E3A8A" } } });
  range.conditionalFormats.add("containsText", { text: "Baja", format: { fill: "#E5E7EB", font: { bold: true, color: "#374151" } } });
}

await fs.mkdir(outputDir, { recursive: true });
const workbook = Workbook.create();

const resumen = workbook.worksheets.add("Resumen");
title(resumen, "Product Backlog Basado en Discovery por Areas", "Resumen ejecutivo para uso operativo y planeacion Scrumban.");
resumen.getRange("A4:B8").values = [
  ["Items de backlog", backlog.length],
  ["Epicas", epics.length],
  ["Story points totales", backlog.reduce((sum, r) => sum + r[5], 0)],
  ["Sprints objetivo", sprintNames.length],
  ["Areas / grupos", areaNames.length],
];
resumen.getRange("A4:B8").format = { borders: { preset: "all", style: "thin", color: "#D6DEE5" }, wrapText: true };
resumen.getRange("A4:A8").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" } };
resumen.getRange("D4:E4").values = [["Prioridad", "Items"]];
resumen.getRange("D5:E8").values = prioritySummary;
resumen.getRange("D4:E8").format = { borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
resumen.getRange("D4:E4").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" } };
const chart = resumen.charts.add("bar", resumen.getRange("D4:E8"));
chart.title = "Items por prioridad";
chart.hasLegend = false;
chart.setPosition("G4", "L18");
resumen.getRange("A11:C11").values = [["Sprint", "Items", "Puntos"]];
resumen.getRange("A12:C16").values = sprintSummary;
resumen.getRange("A11:C16").format = { borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
resumen.getRange("A11:C11").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" } };
resumen.getRange("A19:B19").values = [["Area / grupo", "Items"]];
resumen.getRangeByIndexes(19, 0, areaSummary.length, 2).values = areaSummary;
resumen.getRangeByIndexes(18, 0, areaSummary.length + 1, 2).format = { borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
resumen.getRange("A19:B19").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" } };
setWidths(resumen, [190, 90, 90, 120, 90, 30, 180, 150, 150, 150, 150, 150]);

const enfoque = workbook.worksheets.add("Enfoque");
title(enfoque, "Enfoque del Backlog", "Lectura ejecutiva convertida a criterios operativos.");
enfoque.getRange("A4:H4").merge();
enfoque.getRange("A4").values = [["El discovery muestra que la empresa no tiene principalmente un problema de esfuerzo, sino de visibilidad, seguimiento, ownership y cierre. El backlog debe implementar el tablero primero como sistema de control operativo: cada pendiente relevante debe tener responsable, fecha limite, prioridad, area, estado, dependencia y evidencia."]];
enfoque.getRange("A6:H6").merge();
enfoque.getRange("A6").values = [["Recomendacion de implementacion: iniciar con Finanzas como piloto de alto impacto, porque tiene dolores claros, KPIs concretos y un caso real de urgencia relacionado con PODs, cobranza y evidencias. RH y Sistemas deben incorporarse en paralelo con solicitudes, proyectos, dependencias y adopcion."]];
enfoque.getRange("A4:H6").format = { wrapText: true, verticalAlignment: "top", borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
enfoque.getRange("A4:H4").format.rowHeightPx = 70;
enfoque.getRange("A6:H6").format.rowHeightPx = 70;
setWidths(enfoque, [160, 160, 160, 160, 160, 160, 160, 160]);

const objetivos = workbook.worksheets.add("Objetivos");
title(objetivos, "Objetivos del Producto");
addTable(objetivos, 3, ["Objetivo", "Resultado esperado", "Indicador de exito"], productObjectives, "ObjetivosTable");
setWidths(objetivos, [260, 340, 300]);

const epicas = workbook.worksheets.add("Epicas");
title(epicas, "Epicas");
addTable(epicas, 3, ["ID", "Epica", "Problema que resuelve", "Area principal", "Prioridad"], epics, "EpicasTable");
applyPriorityCf(epicas, "E5:E12");
setWidths(epicas, [80, 220, 430, 190, 100]);

const backlogSheet = workbook.worksheets.add("Product Backlog");
title(backlogSheet, "Product Backlog Priorizado", "Historias derivadas del discovery por areas.");
addTable(backlogSheet, 3, ["ID", "Epica", "Historia de usuario / Item", "Valor esperado", "Prioridad", "Story points", "Area", "Sprint objetivo", "Estado", "Criterios de aceptacion", "Dependencias", "KPI relacionado"], backlog, "ProductBacklogTable");
backlogSheet.freezePanes.freezeRows(4);
applyPriorityCf(backlogSheet, "E5:E29");
backlogSheet.getRange("F5:F29").format.numberFormat = "0";
backlogSheet.getRange("A5:L29").format.rowHeightPx = 62;
setWidths(backlogSheet, [80, 80, 420, 260, 100, 80, 150, 110, 100, 360, 260, 220]);

const sprintSheet = workbook.worksheets.add("Sprint 1");
title(sprintSheet, "Sprint 1 Propuesto: Control Operativo Basico", "Objetivo: que todo pendiente relevante de Finanzas, RH y Sistemas viva en el tablero con responsable, fecha, prioridad, area, estado y evidencia esperada.");
addTable(sprintSheet, 3, ["ID", "Item", "Motivo de inclusion", "Puntos"], sprint1, "Sprint1Table");
sprintSheet.getRange("A13:D13").values = [["Total sugerido", "", "Si la capacidad del equipo es menor, dejar PB-005 para Sprint 2.", 26]];
sprintSheet.getRange("A13:D13").format = { fill: "#F3F7FA", font: { bold: true, color: "#102A43" }, borders: { preset: "all", style: "thin", color: "#D6DEE5" }, wrapText: true };
setWidths(sprintSheet, [90, 330, 430, 90]);

const kpiSheet = workbook.worksheets.add("KPIs por Area");
title(kpiSheet, "KPIs Iniciales Por Area");
addTable(kpiSheet, 3, ["Area", "KPI", "Definicion inicial", "Uso en tablero"], kpis, "KpisTable");
setWidths(kpiSheet, [140, 280, 360, 300]);

const slaSheet = workbook.worksheets.add("SLA Escalamiento");
title(slaSheet, "Reglas Minimas de SLA y Escalamiento");
addTable(slaSheet, 3, ["Proceso", "SLA inicial", "Escalamiento"], sla, "SlaTable");
setWidths(slaSheet, [210, 180, 560]);

const decSheet = workbook.worksheets.add("Decisiones");
title(decSheet, "Decisiones Requeridas de Direccion");
addTable(decSheet, 3, ["Decision", "Impacto si se aprueba"], decisions, "DecisionesTable");
setWidths(decSheet, [450, 420]);

const rdSheet = workbook.worksheets.add("Ready Done");
title(rdSheet, "Definition of Ready / Definition of Done");
rdSheet.getRange("A4:B4").values = [["Definition of Ready", "Cumple"]];
rdSheet.getRange("A5:B11").values = ready;
rdSheet.getRange("D4:E4").values = [["Definition of Done", "Cumple"]];
rdSheet.getRange("D5:E10").values = done;
rdSheet.getRange("A4:B11").format = { wrapText: true, borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
rdSheet.getRange("D4:E10").format = { wrapText: true, borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
rdSheet.getRange("A4:B4").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" } };
rdSheet.getRange("D4:E4").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" } };
setWidths(rdSheet, [460, 90, 40, 520, 90]);

const roadSheet = workbook.worksheets.add("Roadmap");
title(roadSheet, "Roadmap 30-60-90 Dias");
addTable(roadSheet, 3, ["Horizonte", "Foco", "Entregables"], roadmap, "RoadmapTable");
setWidths(roadSheet, [140, 220, 580]);

for (const ws of workbook.worksheets.items) {
  const used = ws.getUsedRange();
  if (used) used.format.font = { name: "Aptos", size: 10 };
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

for (const name of ["Resumen", "Product Backlog", "KPIs por Area", "Ready Done", "Roadmap"]) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `preview_${name.replaceAll(" ", "_")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
