import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/uat_analistas";
const outputPath = `${outputDir}/UAT_Rol_Analista_Orden_Sesiones.xlsx`;

const wb = Workbook.create();

function ws(name) {
  return wb.worksheets.items.find((s) => s.name === name) ?? wb.worksheets.add(name);
}

function values(sheet, address, matrix) {
  sheet.getRange(address).values = matrix;
}

function title(sheet, range) {
  const r = sheet.getRange(range);
  r.format.fill = "#1F4E79";
  r.format.font = { bold: true, color: "#FFFFFF", size: 15 };
  r.format.rowHeightPx = 34;
}

function header(sheet, range) {
  const r = sheet.getRange(range);
  r.format.fill = "#2F75B5";
  r.format.font = { bold: true, color: "#FFFFFF" };
  r.format.wrapText = true;
}

function section(sheet, range) {
  const r = sheet.getRange(range);
  r.format.fill = "#D9EAF7";
  r.format.font = { bold: true, color: "#17365D" };
}

function body(sheet, range) {
  const r = sheet.getRange(range);
  r.format.wrapText = true;
  r.format.verticalAlignment = "Top";
}

function widths(sheet, map) {
  for (const [col, width] of Object.entries(map)) {
    sheet.getRange(`${col}:${col}`).format.columnWidthPx = width;
  }
}

function addTable(sheet, range, name) {
  const t = sheet.tables.add(range, true, name);
  t.style = "TableStyleMedium2";
  return t;
}

const modules = [
  "Perfil",
  "Kanban basico",
  "Kanban avanzado",
  "Notificaciones",
  "Calendario",
  "Disciplina",
  "Academia",
];

const moduleSortOrder = new Map(modules.map((module, index) => [module, index]));

const resumen = ws("Resumen");
values(resumen, "A1:H1", [["UAT - Rol Analista - Tablero Operativo", "", "", "", "", "", "", ""]]);
title(resumen, "A1:H1");
values(resumen, "A3:B10", [
  ["Intencion", "Validar que el rol Analista pueda usar los modulos de la primera liberacion en condiciones reales de operacion."],
  ["Rol objetivo", "Analista / Operativo"],
  ["Alcance", modules.join(", ")],
  ["Guia", "El Excel indica que probar, pasos esperados, resultado esperado y donde registrar estatus, evidencia e issues."],
  ["Dinamica", "Sesiones practicas de 45 minutos: explicar modulo, ejecutar casos, resolver dudas y reportar hallazgos dentro del tablero."],
  ["Criterio de salida", "Sin bloqueadores criticos, casos clave aprobados y issues priorizados para cierre o seguimiento."],
  ["Resultado esperado", "Modulo validado para uso diario o ajustes claros antes de liberar."],
  ["Fecha", new Date()],
]);
resumen.getRange("B10").format.numberFormat = "yyyy-mm-dd";
section(resumen, "A3:A10");
body(resumen, "A3:B10");

values(resumen, "D3:H3", [["Indicador", "Meta", "Actual", "Semaforo", "Comentario"]]);
header(resumen, "D3:H3");
const summaryRows = [
  ["UAT total aprobado", ">= 95%", '=IFERROR(COUNTIF(UAT!K2:K200,"Aprobado")/COUNTA(UAT!A2:A200),0)', '=IF(F4>=0.95,"Verde",IF(F4>=0.85,"Amarillo","Rojo"))', "Casos aprobados sobre total ejecutable."],
  ["Bloqueadores", "0", '=COUNTIF(UAT!K2:K200,"Bloqueado")', '=IF(F5=0,"Verde",IF(F5<=2,"Amarillo","Rojo"))', "Casos sin poder ejecutarse."],
  ["Criticos fallidos", "0", '=COUNTIFS(UAT!J2:J200,"Critica",UAT!K2:K200,"Fallido")+COUNTIFS(UAT!J2:J200,"Critica",UAT!K2:K200,"Bloqueado")', '=IF(F6=0,"Verde","Rojo")', "Cualquier critico abierto detiene salida."],
  ["Issues abiertos", "0", '=COUNTIF(Issues!H2:H100,"Abierto")', '=IF(F7=0,"Verde",IF(F7<=3,"Amarillo","Rojo"))', "Issues reportados dentro del tablero."],
  ...modules.map((m, idx) => [
    `Aprobacion ${m}`,
    ">= 95%",
    `=IFERROR(COUNTIFS(UAT!B2:B200,"${m}",UAT!K2:K200,"Aprobado")/COUNTIF(UAT!B2:B200,"${m}"),0)`,
    `=IF(F${8 + idx}>=0.95,"Verde",IF(F${8 + idx}>=0.85,"Amarillo","Rojo"))`,
    `Cobertura del modulo ${m}.`,
  ]),
];
values(resumen, `D4:H${summaryRows.length + 3}`, summaryRows);
body(resumen, `D4:H${summaryRows.length + 3}`);
resumen.getRange(`F4:F${summaryRows.length + 3}`).format.numberFormat = "0%";
widths(resumen, { A: 155, B: 520, D: 190, E: 120, F: 110, G: 100, H: 320 });

const sesiones = ws("Sesiones");
values(sesiones, "A1:F1", [["Sesion", "Duracion", "Modulos", "Casos", "Objetivo", "Estado"]]);
header(sesiones, "A1:F1");
const sessionRows = [
  ["Sesion 1", "45 min", "Perfil + Kanban + Notificaciones", "UAT-PRF, UAT-KAN, UAT-NOT", "Validar acceso personal, operacion de acciones y avisos clave.", "Pendiente"],
  ["Sesion 2", "45 min", "Calendario + Disciplina", "UAT-CAL, UAT-DIS", "Validar seguimiento diario, fechas, recordatorios y vista personal.", "Pendiente"],
  ["Sesion 3", "45 min", "Academia", "UAT-ACA", "Validar contenido, avance y experiencia de aprendizaje.", "Pendiente"],
  ["Sesion 4", "45 min", "Reprueba / casos borde", "Casos fallidos, bloqueados o UAT-XXX-EON", "Cerrar pendientes, errores, permisos y escenarios no cubiertos.", "Pendiente"],
];
values(sesiones, `A2:F${sessionRows.length + 1}`, sessionRows);
body(sesiones, `A2:F${sessionRows.length + 1}`);
addTable(sesiones, `A1:F${sessionRows.length + 1}`, "SesionesUATAnalista");
sesiones.getRange("F2:F100").dataValidation = { rule: { type: "list", values: ["Pendiente", "Programada", "Completada", "Reprogramada"] } };
widths(sesiones, { A: 95, B: 85, C: 250, D: 310, E: 420, F: 130 });

const uat = ws("UAT");
const uatHeaders = [["ID", "Modulo", "Tipo", "Caso de prueba", "Precondicion", "Pasos", "Resultado esperado", "Datos de prueba", "Responsable", "Severidad", "Resultado", "Evidencia / liga", "Issue relacionado", "Observaciones"]];
values(uat, "A1:N1", uatHeaders);
header(uat, "A1:N1");
const cases = [
  ["UAT-KAN-01", "Kanban basico", "Funcional", "Carga de Kanban", "Usuario Analista activo.", "1) Abrir /kanban.", "El tablero carga columnas y acciones sin error.", "Acciones de prueba", "Analista piloto", "Critica"],
  ["UAT-KAN-02", "Kanban basico", "Funcional", "Crear accion", "Catalogos activos.", "1) Clic nueva accion. 2) Capturar titulo, responsable, fecha, prioridad y area. 3) Guardar.", "La accion aparece en el Kanban.", "Accion RUN", "Analista piloto", "Critica"],
  ["UAT-KAN-03", "Kanban basico", "Funcional", "Editar accion", "Accion existente.", "1) Abrir accion. 2) Editar prioridad/responsable. 3) Guardar.", "Los cambios persisten al recargar.", "Accion existente", "Analista piloto", "Critica"],
  ["UAT-KAN-04", "Kanban basico", "Funcional", "Mover accion de estado", "Accion pendiente.", "1) Cambiar estado permitido.", "La accion se mueve a la columna correcta.", "Accion pendiente", "Analista piloto", "Alta"],
  ["UAT-KAN-05", "Kanban basico", "Funcional", "Abrir detalle desde card", "Card visible.", "1) Clic en card.", "El modal abre con informacion completa.", "Card visible", "Analista piloto", "Alta"],
  ["UAT-KAN-06", "Kanban basico", "Funcional", "Buscar y filtrar rapido", "Acciones con titulos y prioridades distintas.", "1) Buscar texto. 2) Filtrar por prioridad. 3) Limpiar filtros.", "Filtra, muestra resultados correctos y limpia la vista.", "Buscar: cierre; prioridad Alta", "Analista piloto", "Alta"],
  ["UAT-KAN-07", "Kanban avanzado", "Funcional", "Vista lista y tablero consistentes", "Varias acciones visibles.", "1) Cambiar a lista. 2) Volver a tablero.", "Ambas vistas muestran el mismo universo filtrado.", "Acciones variadas", "Analista piloto", "Alta"],
  ["UAT-KAN-08", "Kanban avanzado", "Funcional", "Filtros combinados", "Datos variados.", "1) Combinar fecha, estado, area y responsable.", "Los resultados cumplen todos los criterios.", "Filtros combinados", "Analista piloto", "Alta"],
  ["UAT-KAN-09", "Kanban avanzado", "Permisos", "Accion restringida por rol", "Analista sin permisos admin.", "1) Intentar accion no permitida si aparece.", "No se permite y muestra feedback claro.", "Rol Analista", "Scrum Master", "Critica"],
  ["UAT-KAN-10", "Kanban avanzado", "Borde", "Sin resultados o card larga", "Filtro sin coincidencias o accion con texto largo.", "1) Aplicar filtro sin resultados. 2) Revisar card con texto largo si existe.", "Empty state claro y layout legible.", "Filtro extremo / texto largo", "Analista piloto", "Media"],
  ["UAT-ACA-01", "Academia", "Funcional", "Acceso a Academia", "Usuario Analista activo.", "1) Abrir /academia.", "La pagina carga modulos y progreso.", "Usuario Analista", "Analista piloto", "Alta"],
  ["UAT-ACA-02", "Academia", "Funcional", "Ver modulo", "Modulo disponible.", "1) Abrir modulo. 2) Revisar contenido.", "Contenido legible y sin errores.", "Modulo 1", "Analista piloto", "Media"],
  ["UAT-ACA-03", "Academia", "Funcional", "Progreso de aprendizaje", "Modulo con avance.", "1) Completar paso o actividad. 2) Recargar.", "El progreso se conserva.", "Paso de modulo", "Analista piloto", "Alta"],
  ["UAT-DIS-01", "Disciplina", "Funcional", "Acceso a Disciplina", "Usuario Analista activo.", "1) Abrir /disciplina.", "Carga el dia operativo del usuario.", "Usuario Analista", "Analista piloto", "Alta"],
  ["UAT-DIS-02", "Disciplina", "Funcional", "Acciones del dia", "Acciones creadas/asignadas.", "1) Revisar acciones del dia.", "Muestra acciones y conteos correctos.", "Acciones de prueba", "Analista piloto", "Alta"],
  ["UAT-DIS-03", "Disciplina", "Funcional", "Accesos a modulos relacionados", "Disciplina abierta.", "1) Ir a Kanban/Academia/Calendario desde la vista.", "Los enlaces navegan al modulo correcto.", "Links internos", "Analista piloto", "Media"],
  ["UAT-PRF-01", "Perfil", "Funcional", "Acceso a Perfil", "Usuario Analista activo.", "1) Abrir Perfil desde ajustes.", "Muestra datos del usuario.", "Usuario Analista", "Analista piloto", "Alta"],
  ["UAT-PRF-02", "Perfil", "Funcional", "Actualizar datos permitidos", "Perfil abierto.", "1) Editar campo permitido. 2) Guardar.", "Los cambios se guardan sin afectar rol.", "Nombre/telefono", "Analista piloto", "Media"],
  ["UAT-PRF-03", "Perfil", "Funcional", "Cambio de contrasena", "Usuario con sesion activa.", "1) Abrir cambio de contrasena. 2) Validar flujo.", "El flujo responde con mensajes claros.", "Credenciales prueba", "Analista piloto", "Alta"],
  ["UAT-CAL-01", "Calendario", "Funcional", "Acceso a Calendario", "Usuario Analista activo.", "1) Abrir /calendario.", "Calendario carga el mes actual.", "Usuario Analista", "Analista piloto", "Alta"],
  ["UAT-CAL-02", "Calendario", "Funcional", "Navegar meses", "Calendario abierto.", "1) Ir al mes siguiente. 2) Regresar.", "La vista cambia de mes correctamente.", "Vista mensual", "Analista piloto", "Media"],
  ["UAT-CAL-03", "Calendario", "Funcional", "Ver acciones por dia", "Acciones con fecha.", "1) Seleccionar dia con acciones.", "El detalle muestra acciones del dia.", "Dia con acciones", "Analista piloto", "Alta"],
  ["UAT-CAL-04", "Calendario", "Funcional", "Crear recordatorio/minuta", "Dia seleccionado.", "1) Crear recordatorio o minuta. 2) Guardar.", "El elemento aparece en la fecha correcta.", "Recordatorio prueba", "Analista piloto", "Alta"],
  ["UAT-CAL-05", "Calendario", "Funcional", "Editar accion desde calendario", "Accion visible.", "1) Abrir accion desde dia. 2) Editar. 3) Guardar.", "Cambio se refleja en Calendario y Kanban.", "Accion existente", "Analista piloto", "Critica"],
  ["UAT-NOT-01", "Notificaciones", "Funcional", "Centro de notificaciones", "Usuario con notificaciones.", "1) Abrir centro de notificaciones.", "Lista notificaciones y estado leido/no leido.", "Notificaciones prueba", "Analista piloto", "Alta"],
  ["UAT-NOT-02", "Notificaciones", "Funcional", "Marcar como leida", "Notificacion no leida.", "1) Abrir notificacion. 2) Marcar como leida.", "El contador baja y cambia estado.", "Notificacion no leida", "Analista piloto", "Alta"],
  ["UAT-NOT-03", "Notificaciones", "Funcional", "Navegar desde notificacion", "Notificacion con accion asociada.", "1) Clic en notificacion.", "Abre la accion o modulo relacionado.", "Notificacion accion", "Analista piloto", "Media"],
  ["UAT-NOT-E01", "Notificaciones", "Borde", "Sin notificaciones", "Usuario sin notificaciones.", "1) Abrir centro de notificaciones.", "Muestra empty state claro.", "Usuario nuevo", "Analista piloto", "Media"],
];

const sortedCases = [...cases].sort((a, b) => {
  const moduleA = moduleSortOrder.get(a[1]) ?? 999;
  const moduleB = moduleSortOrder.get(b[1]) ?? 999;
  if (moduleA !== moduleB) return moduleA - moduleB;
  return String(a[0]).localeCompare(String(b[0]), "es-MX");
});
const uatRows = sortedCases.map((row) => [...row, "Pendiente", "", "", ""]);
values(uat, `A2:N${uatRows.length + 1}`, uatRows);
body(uat, `A2:N${uatRows.length + 1}`);
addTable(uat, `A1:N${uatRows.length + 1}`, "MatrizUATAnalista");
uat.freezePanes.freezeRows(1);
uat.getRange("J2:J200").dataValidation = { rule: { type: "list", values: ["Critica", "Alta", "Media", "Baja"] } };
uat.getRange("K2:K200").dataValidation = { rule: { type: "list", values: ["Pendiente", "Aprobado", "Fallido", "Bloqueado", "No aplica"] } };
widths(uat, { A: 120, B: 150, C: 100, D: 260, E: 240, F: 360, G: 360, H: 190, I: 150, J: 95, K: 115, L: 210, M: 160, N: 290 });

const guia = ws("Guia");
values(guia, "A1:F1", [["Guia de uso del Excel UAT", "", "", "", "", ""]]);
title(guia, "A1:F1");
values(guia, "A3:F3", [["Bloque", "Que hacer", "Quien", "Cuando", "Salida esperada", "Notas"]]);
header(guia, "A3:F3");
const guideRows = [
  ["Antes de la sesion", "Revisar la pestana Sesiones y confirmar casos del modulo.", "Scrum Master", "Previo a UAT", "Casos claros y usuarios listos.", "No iniciar si faltan accesos."],
  ["Durante la sesion", "Ejecutar los pasos del caso en la pestana UAT.", "Analista", "En sesion", "Resultado actualizado por caso.", "Usar Aprobado, Fallido o Bloqueado."],
  ["Evidencia", "Agregar liga, captura o referencia en Evidencia / liga.", "Analista", "Al probar", "Evidencia trazable.", "No pegar contrasenas."],
  ["Issues", "Si falla, crear issue dentro del tablero y registrar ID en UAT.", "Analista / Scrum Master", "Al detectar falla", "Issue reproducible.", "Usar la plantilla de Issues."],
  ["Cierre", "Revisar Resumen y decidir Go/No-Go por modulo.", "Owner / Scrum Master", "Cierre de sesion", "Ajustes priorizados.", "Criticos fallidos bloquean salida."],
];
values(guia, `A4:F${guideRows.length + 3}`, guideRows);
body(guia, `A4:F${guideRows.length + 3}`);
addTable(guia, `A3:F${guideRows.length + 3}`, "GuiaUsoUAT");
widths(guia, { A: 150, B: 360, C: 180, D: 160, E: 260, F: 260 });

const issues = ws("Issues");
values(issues, "A1:J1", [["ID Issue", "Modulo", "Caso UAT", "Severidad", "Descripcion", "Pasos para reproducir", "Resultado esperado", "Estado", "Responsable", "Notas"]]);
header(issues, "A1:J1");
const issueRows = [
  ["ISS-001", "Kanban basico", "UAT-KAN-01", "Critica", "Ejemplo: Kanban no carga.", "1) Iniciar sesion. 2) Abrir /kanban.", "Kanban carga sin error.", "Abierto", "Equipo tecnico", "Usar como formato de referencia."],
];
values(issues, `A2:J${issueRows.length + 1}`, issueRows);
body(issues, `A2:J${issueRows.length + 1}`);
addTable(issues, `A1:J${issueRows.length + 1}`, "IssuesUATAnalista");
issues.getRange("D2:D100").dataValidation = { rule: { type: "list", values: ["Critica", "Alta", "Media", "Baja"] } };
issues.getRange("H2:H100").dataValidation = { rule: { type: "list", values: ["Abierto", "En revision", "Corregido", "Cerrado", "No aplica"] } };
widths(issues, { A: 100, B: 150, C: 130, D: 95, E: 320, F: 380, G: 320, H: 120, I: 160, J: 260 });

const usuarios = ws("Usuarios y roles");
values(usuarios, "A1:E1", [["Usuario", "Rol", "Acceso / modulos", "Contrasena", "Notas"]]);
header(usuarios, "A1:E1");
values(usuarios, "A2:E4", [
  ["Usuario Analista 1", "Analista", modules.join(", "), "Compartida por separado", "No colocar passwords reales en presentaciones."],
  ["Usuario Analista 2", "Analista", modules.join(", "), "Compartida por separado", ""],
  ["Facilitador", "Scrum Master / soporte", "Guia de sesion y reporte de issues", "No aplica", ""],
]);
body(usuarios, "A2:E4");
addTable(usuarios, "A1:E4", "UsuariosRolesUAT");
widths(usuarios, { A: 190, B: 120, C: 520, D: 190, E: 320 });

for (const sheet of wb.worksheets.items) {
  sheet.showGridLines = false;
  const used = sheet.getUsedRange();
  if (used) {
    used.format.wrapText = true;
    used.format.verticalAlignment = "Top";
  }
}

await fs.mkdir(outputDir, { recursive: true });

console.log((await wb.inspect({
  kind: "table",
  range: "UAT!A1:N12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 14,
})).ndjson);

console.log((await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
})).ndjson);

for (const sheetName of ["Resumen", "Sesiones", "Guia"]) {
  await wb.render({ sheetName, range: "A1:H18", scale: 1 });
}

const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outputPath);
console.log(`SAVED ${outputPath}`);
