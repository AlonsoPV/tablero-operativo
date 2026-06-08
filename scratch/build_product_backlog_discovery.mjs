import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/alpev/OneDrive/Desktop/EnvialoMexico/Plan_UAT_Scrumban.xlsx";
const outputDir = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/product-backlog";
const outputPath = path.join(outputDir, "Plan_UAT_Scrumban_product_backlog.xlsx");

const backlogRows = [
  ["PB-001", "Control operativo", "Transversal", "Como direccion, quiero ver todas las acciones abiertas por estado, prioridad, area y responsable, para saber que esta pendiente y quien debe cerrarlo.", "Visibilidad basica de control operativo.", "Critica", 5, "Sprint 1", "Backlog", "El tablero muestra acciones abiertas, vencidas, bloqueadas y terminadas; permite filtrar por estado, prioridad, area y responsable.", "Catalogos minimos de areas, prioridades y estados.", "Acciones abiertas y vencidas"],
  ["PB-002", "Accountability", "Transversal", "Como lider de area, quiero que cada accion tenga responsable de cumplimiento, fecha limite, prioridad y area obligatoria, para evitar pendientes sin dueno.", "Mayor ownership y menor seguimiento informal.", "Critica", 3, "Sprint 1", "Backlog", "No se puede crear una accion operativa sin responsable, fecha limite, prioridad y area.", "Definir campos obligatorios.", "% acciones sin responsable"],
  ["PB-003", "Gobierno operativo", "Direccion", "Como direccion, quiero declarar el tablero como fuente oficial de seguimiento, para que lo que no este registrado no sea prioridad formal.", "Acelerar adopcion y reducir duplicidad con Excel/WhatsApp.", "Critica", 1, "Sprint 1", "Backlog", "Direccion comunica la regla de uso y los lideres revisan sus juntas desde el tablero.", "Decision directiva.", "% acciones creadas en tablero"],
  ["PB-004", "Ritual Scrumban", "Transversal", "Como Scrum Master, quiero operar la junta semanal desde el tablero, para revisar vencidas, bloqueadas, prioridades y cierres.", "Convertir el tablero en habito operativo.", "Alta", 2, "Sprint 1", "Backlog", "Existe agenda semanal y se actualiza el tablero durante la reunion.", "Respaldo de direccion y lideres.", "Uso semanal del tablero"],
  ["PB-005", "Dependencias entre areas", "Transversal", "Como lider operativo, quiero marcar dependencias entre areas, para que los retrasos no queden ocultos.", "Claridad sobre bloqueos cruzados.", "Alta", 5, "Sprint 1", "Backlog", "Una accion puede indicar area dependiente, responsable del bloqueo y fecha objetivo de desbloqueo.", "Catalogo de areas y usuarios.", "Acciones bloqueadas por area"],
  ["PB-006", "SLA y escalamiento", "Transversal", "Como responsable, quiero que el tablero marque acciones que vencen hoy o ya vencieron, para actuar antes de que escalen.", "Menos sorpresas operativas.", "Alta", 3, "Sprint 2", "Backlog", "Las acciones muestran semaforo: en tiempo, vence hoy, vencida 1 dia, vencida 2+ dias.", "Fecha limite obligatoria.", "Acciones vencidas"],
  ["PB-007", "SLA y escalamiento", "Transversal", "Como direccion, quiero reglas de escalamiento por vencimiento, para que los bloqueos suban al nivel correcto.", "Escalamiento formal y trazable.", "Alta", 5, "Sprint 2", "Backlog", "Vence hoy alerta al responsable; vencido 1 dia al lider; vencido 2+ dias a direccion/comite.", "Definir lider por area.", "% acciones escaladas a tiempo"],
  ["PB-008", "Finanzas operativo", "Finanzas", "Como finanzas, quiero registrar PODs locales y foraneas con fecha compromiso, para controlar recuperacion de evidencias.", "Mejorar trazabilidad de PODs sin convertir Finanzas en el unico foco.", "Alta", 5, "Sprint 2", "Backlog", "Una accion POD distingue local/foranea, calcula vencimiento esperado y muestra estatus.", "Regla POD local 3 dias y foranea 7 dias.", "% PODs en tiempo"],
  ["PB-009", "Finanzas operativo", "Finanzas / Operaciones", "Como finanzas, quiero registrar cuando una evidencia depende de Operaciones, para que el ownership no se diluya.", "Visibilizar dependencias de evidencia.", "Alta", 3, "Sprint 2", "Backlog", "La accion muestra responsable de cumplimiento y area requerida para desbloquear evidencia.", "Flujo Finanzas-Operaciones.", "PODs bloqueadas por Operaciones"],
  ["PB-010", "RH operativo", "RH", "Como RH, quiero registrar solicitudes internas con responsable, fecha limite y estatus, para evitar seguimiento informal.", "Trazabilidad de servicio interno.", "Alta", 3, "Sprint 2", "Backlog", "RH puede crear solicitudes con tipo, solicitante, responsable, fecha y estado.", "Definir tipos de solicitud RH.", "Solicitudes abiertas y vencidas"],
  ["PB-011", "RH operativo", "RH", "Como RH, quiero visualizar vacantes por estatus, para medir cobertura y cuellos de botella.", "Mejor seguimiento de reclutamiento.", "Alta", 5, "Sprint 2", "Backlog", "Una vacante puede pasar por estados definidos y mostrar dias abierta.", "Catalogo de estatus de vacante.", "Vacantes abiertas / tiempo de cobertura"],
  ["PB-012", "Sistemas habilitador", "Sistemas", "Como Sistemas, quiero registrar solicitudes con alcance, prioridad y area solicitante, para evitar trabajo ambiguo o fuera de alcance.", "Mejor intake de proyectos, issues y mejoras.", "Alta", 5, "Sprint 2", "Backlog", "Una solicitud requiere problema, alcance, prioridad, area solicitante y criterio de aceptacion.", "Definir tipos: proyecto, issue, soporte, mejora.", "Solicitudes fuera de alcance"],
  ["PB-013", "Sistemas habilitador", "Sistemas", "Como Sistemas, quiero ver issues e incidentes abiertos por severidad y tiempo de resolucion, para priorizar correctamente.", "Mejor gestion de soporte.", "Media", 5, "Sprint 3", "Backlog", "Issues muestran severidad, responsable, fecha limite y tiempo abierto.", "Definir severidades y SLA.", "Tiempo promedio de resolucion"],
  ["PB-014", "Indicadores por area", "Direccion / Lideres", "Como direccion, quiero definir maximo 5 KPIs por area, para mantener foco ejecutivo.", "Medicion simple y accionable.", "Alta", 3, "Sprint 3", "Backlog", "Finanzas, RH y Sistemas tienen hasta 5 KPIs activos cada uno, con definicion y responsable.", "Aprobacion de direccion y lideres.", "KPIs activos por area"],
  ["PB-015", "Indicadores por area", "Transversal", "Como lider de area, quiero vincular cada accion a un KPI o brecha, para entender que resultado busca mover.", "Acciones conectadas a impacto.", "Alta", 5, "Sprint 3", "Backlog", "Al crear una accion estrategica se puede seleccionar KPI o brecha asociada.", "Catalogo de KPIs y brechas.", "% acciones vinculadas a KPI"],
  ["PB-016", "RH operativo", "RH", "Como RH, quiero dar seguimiento a capacitaciones programadas vs completadas, para mejorar adopcion y cumplimiento.", "Capacitacion verificable.", "Media", 3, "Sprint 3", "Backlog", "Se registran capacitaciones con fecha, participantes, estatus y evidencia de cierre.", "Calendario y responsables.", "% capacitaciones completadas"],
  ["PB-017", "Adopcion", "Sistemas / Direccion", "Como Sistemas, quiero medir adopcion del tablero por area, para saber donde se necesita soporte o capacitacion.", "Reducir riesgo cultural de baja adopcion.", "Media", 3, "Sprint 3", "Backlog", "Se reportan acciones creadas, actualizadas y cerradas por area semanalmente.", "Auditoria de actividad.", "Uso del tablero por area"],
  ["PB-018", "Limpieza de backlog", "Transversal", "Como lider de area, quiero cerrar o redefinir acciones viejas o mal definidas, para limpiar ruido operativo.", "Backlog sano y confiable.", "Media", 3, "Sprint 3", "Backlog", "Acciones sin responsable, fecha o criterio de cierre se depuran o se reescriben.", "Revision por area.", "Acciones obsoletas cerradas"],
  ["PB-019", "Finanzas operativo", "Finanzas", "Como finanzas, quiero dar seguimiento a viaticos pendientes de comprobar, para reducir gastos sin trazabilidad.", "Control de comprobaciones.", "Media", 5, "Sprint 4", "Backlog", "Se registran viaticos pendientes, responsable, fecha limite, monto y evidencia esperada.", "Datos minimos de viaticos.", "Viaticos pendientes de comprobar"],
  ["PB-020", "Clima y comunicacion", "RH", "Como RH, quiero registrar quejas o sugerencias abiertas, para dar seguimiento a clima laboral.", "Mayor visibilidad de temas humanos.", "Baja", 3, "Sprint 4", "Backlog", "Cada queja/sugerencia tiene estado, responsable y fecha objetivo de respuesta.", "Definir confidencialidad y permisos.", "Quejas/sugerencias abiertas"],
];

const sprintRows = [
  ["Sprint 1", "Control operativo y gobierno", "PB-001, PB-002, PB-003, PB-004, PB-005", 16, "Transversal", "El tablero se vuelve fuente oficial y captura pendientes reales por area."],
  ["Sprint 2", "SLA, dependencias y primeros casos por area", "PB-006, PB-007, PB-008, PB-009, PB-010, PB-011, PB-012", 29, "Transversal / Areas", "Se activan reglas de tiempo y casos operativos de Finanzas, RH y Sistemas."],
  ["Sprint 3", "KPIs, adopcion y depuracion", "PB-013, PB-014, PB-015, PB-016, PB-017, PB-018", 24, "Direccion / Lideres", "Las acciones empiezan a conectarse con indicadores y se mide uso real."],
  ["Sprint 4", "Profundizacion por area", "PB-019, PB-020", 8, "Finanzas / RH", "Se agregan controles secundarios sin desplazar el foco transversal."],
];

const kpiRows = [
  ["Transversal", "Acciones abiertas y vencidas", "Acciones no cerradas agrupadas por estado, prioridad, area y responsable."],
  ["Transversal", "% acciones sin responsable", "Acciones sin owner / acciones abiertas."],
  ["Transversal", "Acciones bloqueadas por area", "Bloqueos activos agrupados por area dependiente."],
  ["Transversal", "% acciones dentro de SLA", "Acciones cerradas dentro del plazo / acciones cerradas totales."],
  ["Transversal", "Uso semanal del tablero", "Acciones creadas, actualizadas y cerradas por area cada semana."],
  ["Finanzas", "% PODs en tiempo", "PODs cerradas dentro de SLA / PODs totales."],
  ["Finanzas", "PODs bloqueadas por Operaciones", "PODs detenidas por evidencia o accion requerida de Operaciones."],
  ["Finanzas", "Viaticos pendientes de comprobar", "Numero o monto de comprobaciones abiertas."],
  ["RH", "Solicitudes abiertas y vencidas", "Solicitudes RH no cerradas o fuera de fecha."],
  ["RH", "Vacantes abiertas / tiempo de cobertura", "Vacantes por etapa y dias desde apertura hasta cierre."],
  ["RH", "% capacitaciones completadas", "Capacitaciones completadas / programadas."],
  ["Sistemas", "Solicitudes fuera de alcance", "Solicitudes rechazadas o redefinidas por alcance insuficiente."],
  ["Sistemas", "Tiempo promedio de resolucion", "Dias desde apertura hasta cierre de issues/incidentes."],
  ["Sistemas", "Uso del tablero por area", "Adopcion semanal por area y tipo de movimiento."],
];

const decisionsRows = [
  ["Tablero como fuente oficial", "Direccion", "Evita duplicidad con Excel y WhatsApp."],
  ["Juntas desde el tablero", "Direccion / Lideres", "Convierte la herramienta en ritual operativo."],
  ["Lider responsable por area", "Direccion", "Asegura ownership y escalamiento."],
  ["SLA iniciales por proceso", "Direccion / Lideres", "Permite anticipar riesgos."],
  ["Regla: lo que no este en tablero no es prioridad formal", "Direccion", "Refuerza adopcion y disciplina."],
];

function writeTable(sheet, startCell, title, headers, rows) {
  const titleRange = sheet.getRange(startCell);
  titleRange.values = [[title]];
  titleRange.format = {
    fill: "#153E5C",
    font: { bold: true, color: "#FFFFFF", size: 14 },
    horizontalAlignment: "left",
  };
  const start = sheet.getRange(startCell);
  const row = start.rowIndex;
  const col = start.columnIndex;
  const headerRange = sheet.getRangeByIndexes(row + 2, col, 1, headers.length);
  headerRange.values = [headers];
  headerRange.format = {
    fill: "#D9EAF7",
    font: { bold: true, color: "#102A43" },
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "all", style: "thin", color: "#B7C9D6" },
  };
  const dataRange = sheet.getRangeByIndexes(row + 3, col, rows.length, headers.length);
  dataRange.values = rows;
  dataRange.format = {
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "all", style: "thin", color: "#D6DEE5" },
  };
  return { headerRange, dataRange, row, col };
}

await fs.mkdir(outputDir, { recursive: true });
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

let backlogSheet = workbook.worksheets.getItemOrNullObject?.("Product Backlog");
if (!backlogSheet || backlogSheet.isNullObject) {
  backlogSheet = workbook.worksheets.add("Product Backlog");
} else {
  backlogSheet.getUsedRange()?.clear({ applyTo: "all" });
  backlogSheet.deleteAllDrawings?.();
}

backlogSheet.showGridLines = false;

backlogSheet.getRange("A1:L1").merge();
backlogSheet.getRange("A1").values = [["Product Backlog Scrumban - Discovery por Areas"]];
backlogSheet.getRange("A1").format = {
  fill: "#0F2F45",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "center",
};
backlogSheet.getRange("A2:L2").merge();
backlogSheet.getRange("A2").values = [["Enfoque equilibrado: control operativo transversal, RH, Sistemas, Direccion y Finanzas como un caso relevante pero no dominante."]];
backlogSheet.getRange("A2").format = {
  fill: "#EAF4FB",
  font: { color: "#243B53", italic: true },
  horizontalAlignment: "center",
};

const backlogHeaders = ["ID", "Epica", "Area", "Historia de usuario / Item", "Valor esperado", "Prioridad", "Story points", "Sprint objetivo", "Estado", "Criterios de aceptacion", "Dependencias", "KPI relacionado"];
writeTable(backlogSheet, "A4", "Backlog priorizado", backlogHeaders, backlogRows);

backlogSheet.freezePanes.freezeRows(6);
backlogSheet.getRange("A6:L26").format.borders = { preset: "all", style: "thin", color: "#D6DEE5" };
backlogSheet.getRange("A6:L6").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#102A43" },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#B7C9D6" },
};
backlogSheet.getRange("G7:G26").format.numberFormat = "0";

backlogSheet.getRange("A29:L29").merge();
backlogSheet.getRange("A29").values = [["Sprints sugeridos"]];
backlogSheet.getRange("A29").format = { fill: "#153E5C", font: { bold: true, color: "#FFFFFF", size: 14 } };
backlogSheet.getRange("A31:F31").values = [["Sprint", "Objetivo", "Items sugeridos", "Puntos", "Foco", "Resultado esperado"]];
backlogSheet.getRange("A32:F35").values = sprintRows;
backlogSheet.getRange("A31:F35").format = {
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "all", style: "thin", color: "#D6DEE5" },
};
backlogSheet.getRange("A31:F31").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" }, wrapText: true };

backlogSheet.getRange("H29:L29").merge();
backlogSheet.getRange("H29").values = [["Decisiones requeridas"]];
backlogSheet.getRange("H29").format = { fill: "#153E5C", font: { bold: true, color: "#FFFFFF", size: 14 } };
backlogSheet.getRange("H31:J31").values = [["Decision", "Responsable", "Impacto"]];
backlogSheet.getRange("H32:J36").values = decisionsRows;
backlogSheet.getRange("H31:J36").format = {
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "all", style: "thin", color: "#D6DEE5" },
};
backlogSheet.getRange("H31:J31").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" }, wrapText: true };

backlogSheet.getRange("A38:L38").merge();
backlogSheet.getRange("A38").values = [["KPIs iniciales por area"]];
backlogSheet.getRange("A38").format = { fill: "#153E5C", font: { bold: true, color: "#FFFFFF", size: 14 } };
backlogSheet.getRange("A40:C40").values = [["Area", "KPI", "Definicion inicial"]];
backlogSheet.getRange("A41:C54").values = kpiRows;
backlogSheet.getRange("A40:C54").format = {
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "all", style: "thin", color: "#D6DEE5" },
};
backlogSheet.getRange("A40:C40").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" }, wrapText: true };

backlogSheet.getRange("E40:L40").merge();
backlogSheet.getRange("E40").values = [["Definition of Ready / Done"]];
backlogSheet.getRange("E40").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" } };
backlogSheet.getRange("E41:L48").values = [
  ["Ready", "Tiene area responsable, owner o rol, fecha limite/SLA, prioridad, criterio de cierre, KPI o razon de negocio, y dependencias conocidas.", null, null, null, null, null, null],
  ["Done", "La accion, regla o vista esta disponible en el tablero; usuarios pueden usarla sin Excel externo; lider de area valida; Product Owner acepta.", null, null, null, null, null, null],
  ["Scrumban", "Usar flujo continuo con planning semanal: Backlog, Sprint Backlog, Por hacer, En progreso, Bloqueado, Validacion, Terminado.", null, null, null, null, null, null],
  ["SLA base", "Vence hoy: responsable. Vencido 1 dia: lider de area. Vencido 2+ dias: direccion o comite operativo.", null, null, null, null, null, null],
  ["No foco financiero", "Finanzas queda como caso operativo relevante, pero el backlog prioriza control transversal, RH, Sistemas, Direccion y adopcion.", null, null, null, null, null, null],
  ["Roadmap 30 dias", "Control operativo, gobierno, acciones reales, filtros y juntas desde tablero.", null, null, null, null, null, null],
  ["Roadmap 60 dias", "SLA, escalamiento, dependencias cruzadas y revision semanal de bloqueos.", null, null, null, null, null, null],
  ["Roadmap 90 dias", "KPIs por area, acciones vinculadas a indicadores, medicion de uso y gobierno operativo.", null, null, null, null, null, null],
];
backlogSheet.getRange("E41:L48").format = {
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "all", style: "thin", color: "#D6DEE5" },
};
backlogSheet.getRange("E41:E48").format = { fill: "#F3F7FA", font: { bold: true, color: "#102A43" } };

const widths = [80, 145, 130, 420, 260, 90, 80, 100, 90, 360, 240, 180];
for (let i = 0; i < widths.length; i++) {
  backlogSheet.getRangeByIndexes(0, i, 1, 1).format.columnWidthPx = widths[i];
}
backlogSheet.getRange("A1:L54").format.verticalAlignment = "top";
backlogSheet.getRange("A1:L54").format.font = { name: "Aptos", size: 10 };
backlogSheet.getRange("A1").format.font = { name: "Aptos", bold: true, color: "#FFFFFF", size: 16 };
backlogSheet.getRange("A7:L26").format.rowHeightPx = 62;
backlogSheet.getRange("A31:J36").format.rowHeightPx = 52;
backlogSheet.getRange("A41:L54").format.rowHeightPx = 42;

const priorityRange = backlogSheet.getRange("F7:F26");
priorityRange.conditionalFormats.add("containsText", { text: "Critica", format: { fill: "#FEE2E2", font: { bold: true, color: "#991B1B" } } });
priorityRange.conditionalFormats.add("containsText", { text: "Alta", format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } } });
priorityRange.conditionalFormats.add("containsText", { text: "Media", format: { fill: "#DBEAFE", font: { bold: true, color: "#1E3A8A" } } });
priorityRange.conditionalFormats.add("containsText", { text: "Baja", format: { fill: "#E5E7EB", font: { bold: true, color: "#374151" } } });

const statusRange = backlogSheet.getRange("I7:I26");
statusRange.conditionalFormats.add("containsText", { text: "Backlog", format: { fill: "#F3F7FA", font: { color: "#334E68" } } });

try {
  backlogSheet.tables.add("A6:L26", true, "ProductBacklogTable");
} catch {}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({ sheetName: "Product Backlog", range: "A1:L54", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "product_backlog_preview.png"), new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
