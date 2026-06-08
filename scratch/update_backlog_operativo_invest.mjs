import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/alpev/OneDrive/Desktop/EnvialoMexico/Plan_UAT_Scrumban.xlsx";
const outputDir = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/product-backlog";
const outputPath = path.join(outputDir, "Plan_UAT_Scrumban_product_backlog_operativo.xlsx");

const rows = [
  ["PB-001", "Control operativo transversal", "Visualizar acciones abiertas", "Director operativo", "Como director operativo, quiero ver todas las acciones abiertas por estado, prioridad, area y responsable, para poder tomar decisiones oportunas sobre atrasos, bloqueos y prioridades.", "Visibilidad ejecutiva de pendientes reales.", "Critica", 5, "Sprint 1", "El tablero muestra acciones abiertas, vencidas, bloqueadas, en validacion y terminadas.", "El usuario puede filtrar por estado, prioridad, area, responsable y fecha limite.", "I,N,V,E,S,T"],
  ["PB-002", "Control operativo transversal", "Capturar acciones con owner claro", "Lider de area", "Como lider de area, quiero que cada accion tenga responsable de cumplimiento, fecha limite, prioridad y area, para poder evitar pendientes sin dueno o sin siguiente paso.", "Mayor accountability entre areas.", "Critica", 3, "Sprint 1", "No se puede crear una accion operativa sin responsable, fecha limite, prioridad y area.", "La tarjeta muestra responsable de cumplimiento, area involucrada y fecha compromiso.", "I,N,V,E,S,T"],
  ["PB-003", "Gobierno y adopcion", "Declarar tablero oficial", "Director general", "Como director general, quiero declarar el tablero como fuente oficial de seguimiento, para poder reducir duplicidad con Excel, WhatsApp y juntas informales.", "Alineacion organizacional y adopcion.", "Critica", 1, "Sprint 1", "Existe una regla comunicada: lo que no este en tablero no es prioridad formal.", "Los lideres de area usan el tablero como base de sus reuniones semanales.", "I,N,V,E,S,T"],
  ["PB-004", "Ritual Scrumban", "Revisar avance semanal", "Scrum Master operativo", "Como Scrum Master operativo, quiero conducir la junta semanal desde el tablero, para poder revisar vencidas, bloqueadas, prioridades y cierres con una sola fuente de verdad.", "Disciplina operativa y cadencia de seguimiento.", "Alta", 2, "Sprint 1", "La junta semanal incluye revision de vencidas, bloqueadas, acciones criticas y cierres.", "Durante la junta se actualizan estados, responsables o fechas directamente en el tablero.", "I,N,V,E,S,T"],
  ["PB-005", "Dependencias entre areas", "Registrar bloqueos cruzados", "Lider operativo", "Como lider operativo, quiero marcar dependencias entre areas, para poder identificar donde se detiene el trabajo y quien debe desbloquearlo.", "Menos retrasos invisibles entre areas.", "Alta", 5, "Sprint 1", "Una accion puede marcarse como bloqueada con area dependiente y responsable del bloqueo.", "La accion bloqueada muestra fecha objetivo de desbloqueo y comentario obligatorio.", "I,N,V,E,S,T"],
  ["PB-006", "SLA y escalamiento", "Alertar vencimientos", "Responsable operativo", "Como responsable operativo, quiero que el tablero me muestre acciones que vencen hoy o ya vencieron, para poder actuar antes de que escalen.", "Anticipacion de riesgos operativos.", "Alta", 3, "Sprint 2", "Las acciones muestran semaforo: en tiempo, vence hoy, vencida 1 dia y vencida 2+ dias.", "El responsable puede identificar rapidamente sus acciones proximas a vencer.", "I,N,V,E,S,T"],
  ["PB-007", "SLA y escalamiento", "Escalar atrasos", "Director operativo", "Como director operativo, quiero reglas de escalamiento por vencimiento, para poder intervenir solo cuando un atraso requiera liderazgo o decision.", "Escalamiento formal y menos dependencia informal.", "Alta", 5, "Sprint 2", "Vence hoy notifica o destaca al responsable de cumplimiento.", "Vencido 1 dia escala al lider de area y vencido 2+ dias a direccion o comite.", "I,N,V,E,S,T"],
  ["PB-008", "Operacion y evidencias", "Dar seguimiento a evidencias operativas", "Coordinador de operaciones", "Como coordinador de operaciones, quiero registrar evidencias pendientes con responsable y fecha compromiso, para poder cerrar entregables que dependen de pruebas, documentos o confirmaciones.", "Trazabilidad de evidencias sin depender de mensajes dispersos.", "Alta", 5, "Sprint 2", "La accion permite indicar evidencia esperada y responsable de cargarla o validarla.", "La accion no puede cerrarse si requiere evidencia y esta no fue registrada o validada.", "I,N,V,E,S,T"],
  ["PB-009", "Operacion y finanzas", "Visibilizar dependencias de evidencias", "Analista financiero-operativo", "Como analista financiero-operativo, quiero saber cuando una evidencia depende de Operaciones, para poder dar seguimiento sin perder ownership entre areas.", "Claridad en cruces Finanzas-Operaciones.", "Media", 3, "Sprint 2", "La accion muestra responsable de cumplimiento y area requerida para desbloquear la evidencia.", "El tablero permite filtrar evidencias bloqueadas por area dependiente.", "I,N,V,E,S,T"],
  ["PB-010", "RH operativo", "Gestionar solicitudes internas", "Generalista de RH", "Como generalista de RH, quiero registrar solicitudes internas con tipo, responsable, fecha limite y estatus, para poder dar seguimiento transparente al servicio interno.", "Trazabilidad de solicitudes RH.", "Alta", 3, "Sprint 2", "RH puede crear solicitudes con tipo, solicitante, responsable, fecha compromiso y estado.", "El tablero muestra solicitudes abiertas, vencidas y terminadas por responsable o area solicitante.", "I,N,V,E,S,T"],
  ["PB-011", "RH operativo", "Controlar vacantes por estatus", "Responsable de reclutamiento", "Como responsable de reclutamiento, quiero visualizar vacantes por estatus y dias abiertas, para poder detectar cuellos de botella en contratacion.", "Mejor seguimiento de reclutamiento.", "Alta", 5, "Sprint 2", "Cada vacante tiene estatus, responsable, fecha de apertura y fecha objetivo.", "La vista muestra vacantes abiertas por etapa y tiempo transcurrido.", "I,N,V,E,S,T"],
  ["PB-012", "Sistemas habilitador", "Definir alcance de solicitudes", "Lider de Sistemas", "Como lider de Sistemas, quiero recibir solicitudes con alcance, prioridad, area solicitante y criterio de aceptacion, para poder evitar trabajo ambiguo o fuera de alcance.", "Mejor intake de proyectos, issues y mejoras.", "Alta", 5, "Sprint 2", "Toda solicitud de Sistemas incluye problema, alcance esperado, prioridad y area solicitante.", "La solicitud tiene al menos un criterio de aceptacion antes de entrar a ejecucion.", "I,N,V,E,S,T"],
  ["PB-013", "Sistemas habilitador", "Priorizar incidentes por severidad", "Analista de soporte", "Como analista de soporte, quiero ver issues e incidentes por severidad y tiempo abierto, para poder priorizar correctamente la resolucion.", "Mejor gestion de soporte.", "Media", 5, "Sprint 3", "Cada issue tiene severidad, responsable, fecha limite y estado.", "El tablero muestra tiempo abierto y permite filtrar por severidad.", "I,N,V,E,S,T"],
  ["PB-014", "Indicadores por area", "Definir KPIs por area", "Director de area", "Como director de area, quiero definir maximo cinco KPIs operativos para mi area, para poder mantener foco en los resultados mas importantes.", "Medicion simple y accionable.", "Alta", 3, "Sprint 3", "Cada area tiene maximo cinco KPIs activos con definicion y responsable.", "Los KPIs aprobados se muestran como opciones para vincular acciones.", "I,N,V,E,S,T"],
  ["PB-015", "Indicadores por area", "Vincular acciones a KPIs", "Lider de area", "Como lider de area, quiero vincular cada accion relevante a un KPI o brecha, para poder explicar que resultado busca mover el trabajo del equipo.", "Acciones conectadas a impacto.", "Alta", 5, "Sprint 3", "Al crear o editar una accion se puede seleccionar KPI o brecha asociada.", "El tablero permite consultar acciones agrupadas por KPI o brecha.", "I,N,V,E,S,T"],
  ["PB-016", "RH operativo", "Dar seguimiento a capacitaciones", "Coordinador de capacitacion", "Como coordinador de capacitacion, quiero dar seguimiento a capacitaciones programadas y completadas, para poder asegurar adopcion y cumplimiento.", "Capacitacion verificable.", "Media", 3, "Sprint 3", "Cada capacitacion tiene fecha, responsable, participantes, estatus y evidencia de cierre.", "La vista muestra capacitaciones programadas, completadas y vencidas.", "I,N,V,E,S,T"],
  ["PB-017", "Adopcion y gobierno", "Medir uso del tablero", "Responsable de mejora continua", "Como responsable de mejora continua, quiero medir el uso del tablero por area, para poder identificar donde se requiere soporte, capacitacion o refuerzo directivo.", "Reducir riesgo de baja adopcion.", "Media", 3, "Sprint 3", "Se reportan acciones creadas, actualizadas, cerradas y vencidas por area semanalmente.", "El reporte identifica areas con bajo uso o acciones sin movimiento reciente.", "I,N,V,E,S,T"],
  ["PB-018", "Limpieza de backlog", "Depurar acciones mal definidas", "Lider de area", "Como lider de area, quiero cerrar o redefinir acciones viejas, duplicadas o mal definidas, para poder mantener un backlog confiable.", "Menos ruido operativo y mejor planeacion.", "Media", 3, "Sprint 3", "Las acciones sin responsable, fecha o criterio de cierre se marcan para depuracion.", "Cada accion depurada queda cerrada, fusionada o reescrita con informacion minima completa.", "I,N,V,E,S,T"],
  ["PB-019", "Control de gastos operativos", "Controlar comprobaciones pendientes", "Responsable administrativo", "Como responsable administrativo, quiero dar seguimiento a comprobaciones pendientes con monto, responsable y fecha limite, para poder reducir gastos sin trazabilidad.", "Control administrativo sin desplazar el foco general del tablero.", "Media", 5, "Sprint 4", "Se registran comprobaciones pendientes con monto, responsable, fecha y evidencia esperada.", "El tablero muestra comprobaciones abiertas, vencidas y cerradas por responsable.", "I,N,V,E,S,T"],
  ["PB-020", "Clima y comunicacion", "Gestionar quejas y sugerencias", "Lider de RH", "Como lider de RH, quiero registrar quejas o sugerencias abiertas con responsable y fecha objetivo, para poder dar seguimiento a temas de clima laboral.", "Mejor visibilidad de temas humanos.", "Baja", 3, "Sprint 4", "Cada queja o sugerencia tiene estado, responsable y fecha objetivo de respuesta.", "La informacion sensible respeta permisos o nivel de confidencialidad definido.", "I,N,V,E,S,T"],
];

const investLegend = [
  ["I", "Independiente", "La historia puede completarse sin depender fuertemente de otra historia."],
  ["N", "Negociable", "El equipo puede discutir la mejor solucion sin cambiar la necesidad."],
  ["V", "Valiosa", "Entrega valor claro al rol operativo o al cliente interno."],
  ["E", "Estimable", "Tiene alcance y criterios suficientes para estimar."],
  ["S", "Pequena", "Puede completarse dentro de un sprint razonable."],
  ["T", "Comprobable", "Sus criterios de aceptacion permiten validar si esta terminada."],
];

const sprintRows = [
  ["Sprint 1", "Control operativo y gobierno", "PB-001, PB-002, PB-003, PB-004, PB-005", 16, "Transversal", "Tablero oficial con acciones reales, owners claros y dependencias visibles."],
  ["Sprint 2", "SLA y casos operativos por area", "PB-006, PB-007, PB-008, PB-009, PB-010, PB-011, PB-012", 29, "Transversal / Areas", "Semaforos, escalamiento y primeros flujos para Operaciones, RH, Sistemas y Finanzas."],
  ["Sprint 3", "KPIs, adopcion y backlog sano", "PB-013, PB-014, PB-015, PB-016, PB-017, PB-018", 24, "Direccion / Lideres", "Acciones vinculadas a indicadores, uso medido y depuracion activa."],
  ["Sprint 4", "Profundizacion operativa", "PB-019, PB-020", 8, "Administracion / RH", "Controles secundarios para comprobaciones y clima laboral."],
];

await fs.mkdir(outputDir, { recursive: true });
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

let sheet = workbook.worksheets.getItemOrNullObject?.("Product Backlog");
if (!sheet || sheet.isNullObject) {
  sheet = workbook.worksheets.add("Product Backlog");
} else {
  const used = sheet.getUsedRange();
  if (used) used.clear({ applyTo: "all" });
  sheet.deleteAllDrawings?.();
}

sheet.showGridLines = false;
sheet.getRange("A1:L1").merge();
sheet.getRange("A1").values = [["Product Backlog Scrumban - Historias Operativas"]];
sheet.getRange("A1").format = { fill: "#0F2F45", font: { bold: true, color: "#FFFFFF", size: 16 }, horizontalAlignment: "center" };
sheet.getRange("A2:L2").merge();
sheet.getRange("A2").values = [["Formato validado: Como <rol operativo> quiero <accion> para poder <valor>. Incluye criterios de aceptacion e INVEST por historia."]];
sheet.getRange("A2").format = { fill: "#EAF4FB", font: { italic: true, color: "#243B53" }, horizontalAlignment: "center" };

const headers = ["ID", "Epica", "Titulo", "Rol operativo", "Historia de usuario", "Valor", "Prioridad", "Story points", "Sprint", "Criterio aceptacion 1", "Criterio aceptacion 2", "INVEST"];
sheet.getRange("A4").values = [["Backlog priorizado"]];
sheet.getRange("A4:L4").merge();
sheet.getRange("A4").format = { fill: "#153E5C", font: { bold: true, color: "#FFFFFF", size: 14 } };
sheet.getRange("A6:L6").values = [headers];
sheet.getRange("A7:L26").values = rows;

sheet.getRange("A6:L26").format = {
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "all", style: "thin", color: "#D6DEE5" },
};
sheet.getRange("A6:L6").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#102A43" },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#B7C9D6" },
};
sheet.getRange("H7:H26").format.numberFormat = "0";
sheet.freezePanes.freezeRows(6);

sheet.getRange("A29:F29").merge();
sheet.getRange("A29").values = [["Sprints sugeridos"]];
sheet.getRange("A29").format = { fill: "#153E5C", font: { bold: true, color: "#FFFFFF", size: 14 } };
sheet.getRange("A31:F31").values = [["Sprint", "Objetivo", "Items sugeridos", "Puntos", "Foco", "Resultado esperado"]];
sheet.getRange("A32:F35").values = sprintRows;
sheet.getRange("A31:F35").format = { wrapText: true, verticalAlignment: "top", borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
sheet.getRange("A31:F31").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" }, wrapText: true };

sheet.getRange("H29:L29").merge();
sheet.getRange("H29").values = [["Leyenda INVEST"]];
sheet.getRange("H29").format = { fill: "#153E5C", font: { bold: true, color: "#FFFFFF", size: 14 } };
sheet.getRange("H31:J31").values = [["Letra", "Criterio", "Validacion usada"]];
sheet.getRange("H32:J37").values = investLegend;
sheet.getRange("H31:J37").format = { wrapText: true, verticalAlignment: "top", borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
sheet.getRange("H31:J31").format = { fill: "#D9EAF7", font: { bold: true, color: "#102A43" }, wrapText: true };

sheet.getRange("A39:L39").merge();
sheet.getRange("A39").values = [["Notas de validacion"]];
sheet.getRange("A39").format = { fill: "#153E5C", font: { bold: true, color: "#FFFFFF", size: 14 } };
sheet.getRange("A41:L45").values = [
  ["1", "Las historias fueron reescritas para roles operativos reales: direccion, lideres de area, Scrum Master operativo, responsables de RH, Sistemas, Operaciones y administracion.", null, null, null, null, null, null, null, null, null, null],
  ["2", "Cada historia expresa una necesidad accionable y verificable del cliente interno que usara o gobernara el tablero.", null, null, null, null, null, null, null, null, null, null],
  ["3", "Cada historia tiene al menos dos criterios de aceptacion para apoyar la Definition of Ready y la Definition of Done.", null, null, null, null, null, null, null, null, null, null],
  ["4", "Finanzas queda representada solo como parte del flujo operativo, no como foco principal del backlog.", null, null, null, null, null, null, null, null, null, null],
  ["5", "Las historias marcadas con INVEST completo cumplen al menos independencia razonable, valor claro, estimabilidad, tamano de sprint y comprobabilidad.", null, null, null, null, null, null, null, null, null, null],
];
sheet.getRange("A41:L45").format = { wrapText: true, verticalAlignment: "top", borders: { preset: "all", style: "thin", color: "#D6DEE5" } };
sheet.getRange("A41:A45").format = { fill: "#F3F7FA", font: { bold: true, color: "#102A43" } };

const widths = [76, 150, 175, 155, 445, 230, 90, 80, 90, 330, 330, 90];
for (let i = 0; i < widths.length; i++) {
  sheet.getRangeByIndexes(0, i, 1, 1).format.columnWidthPx = widths[i];
}
sheet.getRange("A1:L45").format.font = { name: "Aptos", size: 10 };
sheet.getRange("A1").format.font = { name: "Aptos", bold: true, color: "#FFFFFF", size: 16 };
sheet.getRange("A7:L26").format.rowHeightPx = 78;
sheet.getRange("A31:J37").format.rowHeightPx = 46;
sheet.getRange("A41:L45").format.rowHeightPx = 38;

const priorityRange = sheet.getRange("G7:G26");
priorityRange.conditionalFormats.add("containsText", { text: "Critica", format: { fill: "#FEE2E2", font: { bold: true, color: "#991B1B" } } });
priorityRange.conditionalFormats.add("containsText", { text: "Alta", format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } } });
priorityRange.conditionalFormats.add("containsText", { text: "Media", format: { fill: "#DBEAFE", font: { bold: true, color: "#1E3A8A" } } });
priorityRange.conditionalFormats.add("containsText", { text: "Baja", format: { fill: "#E5E7EB", font: { bold: true, color: "#374151" } } });

try {
  sheet.tables.add("A6:L26", true, "ProductBacklogOperativoTable");
} catch {}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({ sheetName: "Product Backlog", range: "A1:L45", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "product_backlog_operativo_preview.png"), new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
