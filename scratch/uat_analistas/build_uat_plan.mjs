import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/uat_analistas";
const outputPath = `${outputDir}/Plan_Implementacion_UAT_Tablero_Analistas.xlsx`;

const wb = Workbook.create();
const defaultSheet = wb.worksheets.items?.[0];
if (defaultSheet) defaultSheet.name = "Resumen";

function ws(name) {
  return wb.worksheets.items.find((s) => s.name === name) ?? wb.worksheets.add(name);
}

function setValues(sheet, address, values) {
  sheet.getRange(address).values = values;
}

function styleTitle(sheet, range = "A1:H1") {
  const r = sheet.getRange(range);
  r.format.fill = "#1F4E79";
  r.format.font = { bold: true, color: "#FFFFFF", size: 16 };
  r.format.rowHeightPx = 34;
}

function styleSection(sheet, range) {
  const r = sheet.getRange(range);
  r.format.fill = "#D9EAF7";
  r.format.font = { bold: true, color: "#17365D" };
}

function styleHeader(sheet, range) {
  const r = sheet.getRange(range);
  r.format.fill = "#2F75B5";
  r.format.font = { bold: true, color: "#FFFFFF" };
  r.format.wrapText = true;
}

function styleBody(sheet, range) {
  const r = sheet.getRange(range);
  r.format.wrapText = true;
  r.format.verticalAlignment = "Top";
}

function setWidths(sheet, widths) {
  for (const [col, width] of Object.entries(widths)) {
    sheet.getRange(`${col}:${col}`).format.columnWidthPx = width;
  }
}

function addTable(sheet, range, name) {
  const table = sheet.tables.add(range, true, name);
  table.style = "TableStyleMedium2";
  return table;
}

const resumen = ws("Resumen");
setValues(resumen, "A1:H1", [["Plan de Implementacion y UAT - Tablero Operativo v1 - Rol Analista", "", "", "", "", "", "", ""]]);
styleTitle(resumen);
setValues(resumen, "A3:B10", [
  ["Objetivo", "Validar que los usuarios con rol Analista puedan operar la primera version del tablero con claridad, visibilidad y seguimiento basico de acciones."],
  ["Alcance funcional", "Dashboard / Vision general, Pulso operativo, Resumen de acciones, Priorizacion sin enlaces a matriz, Operacion, filtros y acciones RUN."],
  ["Rol objetivo", "Analista"],
  ["Enfoque Scrum Master", "Acompanar adopcion, levantar impedimentos, medir uso real y cerrar aprendizajes antes de escalar a mas areas."],
  ["Duracion sugerida", "3 semanas"],
  ["Criterio de salida", "UAT >= 95% aprobado, 0 bloqueadores abiertos, usuarios clave capacitados y protocolo de seguimiento aceptado."],
  ["Version", "Primera version operativa"],
  ["Fecha de preparacion", new Date()],
]);
resumen.getRange("B10").format.numberFormat = "yyyy-mm-dd";
styleSection(resumen, "A3:A10");
styleBody(resumen, "A3:B10");
setValues(resumen, "D3:H3", [["Indicador", "Formula / Meta", "Actual", "Semaforo", "Comentario"]]);
styleHeader(resumen, "D3:H3");
setValues(resumen, "D4:H16", [
  ["Avance de plan", ">= 90%", '=IFERROR(COUNTIF(Plan!H2:H100,"Hecho")/COUNTA(Plan!A2:A100),0)', '=IF(F4>=0.9,"Verde",IF(F4>=0.7,"Amarillo","Rojo"))', "Actividades de implementacion terminadas"],
  ["UAT aprobado", ">= 95%", '=IFERROR(COUNTIF(UAT!J2:J200,"Aprobado")/COUNTA(UAT!A2:A200),0)', '=IF(F5>=0.95,"Verde",IF(F5>=0.85,"Amarillo","Rojo"))', "Casos de prueba aprobados"],
  ["Bloqueadores abiertos", "0", '=COUNTIF(Riesgos!G2:G100,"Abierto")', '=IF(F6=0,"Verde",IF(F6<=2,"Amarillo","Rojo"))', "Riesgos o impedimentos activos"],
  ["Usuarios capacitados", "100%", '=IFERROR(COUNTIF(Sesiones!G2:G100,"Completada")/COUNTA(Sesiones!A2:A100),0)', '=IF(F7>=1,"Verde",IF(F7>=0.8,"Amarillo","Rojo"))', "Sesiones ejecutadas"],
  ["Defectos criticos", "0", '=COUNTIFS(UAT!L2:L200,"Critica",UAT!J2:J200,"<>Aprobado")', '=IF(F8=0,"Verde","Rojo")', "Incidencias criticas pendientes"],
  ["UAT Dashboard aprobado", ">= 95%", '=IFERROR(COUNTIFS(UAT!B2:B200,"Dashboard",UAT!J2:J200,"Aprobado")/COUNTIF(UAT!B2:B200,"Dashboard"),0)', '=IF(F9>=0.95,"Verde",IF(F9>=0.85,"Amarillo","Rojo"))', "Cobertura funcional del dashboard analista"],
  ["UAT Kanban aprobado", ">= 95%", '=IFERROR(COUNTIFS(UAT!B2:B200,"Kanban",UAT!J2:J200,"Aprobado")/COUNTIF(UAT!B2:B200,"Kanban"),0)', '=IF(F10>=0.95,"Verde",IF(F10>=0.85,"Amarillo","Rojo"))', "Cobertura de acciones, estados y filtros"],
  ["UAT Academia aprobado", ">= 95%", '=IFERROR(COUNTIFS(UAT!B2:B200,"Academia",UAT!J2:J200,"Aprobado")/COUNTIF(UAT!B2:B200,"Academia"),0)', '=IF(F11>=0.95,"Verde",IF(F11>=0.85,"Amarillo","Rojo"))', "Cobertura de progreso, modulos y quiz"],
  ["UAT Calendario aprobado", ">= 95%", '=IFERROR(COUNTIFS(UAT!B2:B200,"Calendario",UAT!J2:J200,"Aprobado")/COUNTIF(UAT!B2:B200,"Calendario"),0)', '=IF(F12>=0.95,"Verde",IF(F12>=0.85,"Amarillo","Rojo"))', "Cobertura de calendario, recordatorios y minutas"],
  ["UAT Disciplina aprobado", ">= 95%", '=IFERROR(COUNTIFS(UAT!B2:B200,"Disciplina",UAT!J2:J200,"Aprobado")/COUNTIF(UAT!B2:B200,"Disciplina"),0)', '=IF(F13>=0.95,"Verde",IF(F13>=0.85,"Amarillo","Rojo"))', "Cobertura del home operativo personal"],
  ["Bloqueadores por modulo", "0", '=COUNTIF(UAT!J2:J200,"Bloqueado")', '=IF(F14=0,"Verde",IF(F14<=2,"Amarillo","Rojo"))', "Casos UAT bloqueados por modulo"],
  ["Adopcion inicial", ">= 80%", "", "", "Medir con acciones creadas / actualizadas por analistas"],
  ["Decision Go/No-Go", "Go si cumple criterios", "", "", "Actualizar al cierre de UAT"],
]);
resumen.getRange("F4:F5").format.numberFormat = "0%";
resumen.getRange("F7:F7").format.numberFormat = "0%";
resumen.getRange("F9:F13").format.numberFormat = "0%";
styleBody(resumen, "D4:H16");
setWidths(resumen, { A: 165, B: 470, D: 170, E: 140, F: 120, G: 110, H: 330 });

const guia = ws("Guia del workbook");
setValues(guia, "A1:F1", [["Guia del workbook - Como usar este plan", "", "", "", "", ""]]);
styleTitle(guia, "A1:F1");
setValues(guia, "A3:F3", [["Pestana", "Porque existe", "Como usarla", "Quien la actualiza", "Frecuencia", "Decision que habilita"]]);
styleHeader(guia, "A3:F3");
setValues(guia, "A4:F13", [
  ["Resumen", "Concentra salud general, avance UAT por modulo y semaforos ejecutivos.", "Revisar al inicio de cada seguimiento para saber si el piloto va hacia Go o No-Go.", "Scrum Master", "Cada sesion UAT", "Priorizar bloqueadores y decidir salida."],
  ["Plan", "Ordena las actividades generales de implementacion por fase y semana.", "Actualizar estado de preparacion, capacitacion, UAT, ajustes y salida.", "Scrum Master", "2 veces por semana", "Saber si el plan de adopcion esta avanzando."],
  ["Plan por modulo", "Baja la implementacion a actividades especificas para Dashboard, Kanban, Academia, Calendario y Disciplina.", "Usar como checklist operativo por modulo antes de ejecutar UAT.", "Scrum Master", "Antes y durante UAT", "Confirmar que cada modulo esta listo para prueba."],
  ["UAT", "Es la matriz ejecutable de pruebas; evita validaciones ambiguas.", "Registrar resultado, evidencia, severidad y observaciones por caso.", "Analistas piloto / Scrum Master", "Durante UAT", "Aceptar o rechazar funcionalidad por modulo."],
  ["Sesiones", "Organiza capacitaciones y sesiones guiadas por modulo.", "Marcar sesiones programadas/completadas y adjuntar evidencia.", "Scrum Master", "Segun agenda", "Confirmar preparacion de usuarios."],
  ["Riesgos", "Controla impedimentos y riesgos que pueden bloquear salida.", "Registrar riesgo, mitigacion, responsable y estado.", "Scrum Master / Owner", "Cada seguimiento", "Escalar bloqueadores reales."],
  ["Checklist salida", "Resume criterios transversales para liberar la primera version.", "Marcar Cumple/No cumple antes de Go/No-Go final.", "Owner / Scrum Master", "Cierre UAT", "Tomar decision final de liberacion."],
  ["Checklist por modulo", "Permite Go/No-Go separado por modulo sin mezclar resultados.", "Revisar % aprobado, bloqueadores y estado por modulo.", "Scrum Master", "Cierre de cada modulo", "Liberar modulo o enviarlo a ajustes."],
  ["Protocolo operativo", "Define reglas de uso para que el tablero no dependa de seguimiento manual.", "Usarlo como acuerdo de operacion en juntas y seguimiento.", "Scrum Master / Lideres", "Al arranque y ajustes", "Alinear comportamiento esperado."],
  ["Optimizacion sugerida", "Mantiene el archivo usable y evita duplicidad.", "Actualizar UAT y estados; dejar formulas y tablas como fuente de resumen.", "Scrum Master", "Continuo", "Evitar versiones paralelas o archivos sueltos."],
]);
styleBody(guia, "A4:F13");
setWidths(guia, { A: 170, B: 360, C: 360, D: 190, E: 150, F: 260 });

const plan = ws("Plan");
const planHeaders = [["ID", "Fase", "Semana", "Actividad", "Objetivo", "Responsable", "Entregable", "Estado", "Criterio de cierre", "Notas"]];
const planRows = [
  ["P01", "Preparacion", "Semana 1", "Confirmar alcance de rol Analista", "Alinear lo que ve y opera el analista en v1", "Scrum Master / Owner", "Alcance firmado", "Pendiente", "Permisos y modulos confirmados", ""],
  ["P02", "Preparacion", "Semana 1", "Definir usuarios piloto por area", "Seleccionar muestra representativa", "Scrum Master", "Lista de usuarios", "Pendiente", "Usuarios nominados y agenda aceptada", ""],
  ["P03", "Preparacion", "Semana 1", "Preparar datos iniciales", "Evitar UAT con tablero vacio", "Admin / Operaciones", "Datos semilla", "Pendiente", "Acciones, areas y prioridades disponibles", ""],
  ["P04", "Capacitacion", "Semana 1", "Sesion de introduccion al tablero", "Explicar objetivo, flujo y responsabilidades", "Scrum Master", "Sesion ejecutada", "Pendiente", "Asistencia registrada", ""],
  ["P05", "Capacitacion", "Semana 1", "Capacitacion practica de acciones RUN", "Que el analista capture, edite y filtre acciones", "Scrum Master", "Ejercicio guiado", "Pendiente", "Cada usuario completa 2 acciones de prueba", ""],
  ["P06", "UAT", "Semana 2", "Ejecutar pruebas de dashboard", "Validar Vision general y Pulso operativo", "Analistas piloto", "Evidencia UAT", "Pendiente", "Casos DSH aprobados", ""],
  ["P07", "UAT", "Semana 2", "Ejecutar pruebas de acciones", "Validar creacion, edicion y cierre de acciones", "Analistas piloto", "Evidencia UAT", "Pendiente", "Casos ACC aprobados", ""],
  ["P08", "UAT", "Semana 2", "Ejecutar pruebas de filtros", "Validar filtros por fecha, estado, prioridad, area, creador y responsable", "Analistas piloto", "Evidencia UAT", "Pendiente", "Casos FIL aprobados", ""],
  ["P09", "UAT", "Semana 2", "Levantar defectos y mejoras", "Separar bloqueadores de mejoras futuras", "Scrum Master", "Backlog de UAT", "Pendiente", "Defectos clasificados por severidad", ""],
  ["P10", "Ajustes", "Semana 3", "Corregir bloqueadores", "Eliminar impedimentos para salida", "Equipo tecnico", "Correcciones", "Pendiente", "0 bloqueadores abiertos", ""],
  ["P11", "Ajustes", "Semana 3", "Reprueba dirigida", "Confirmar que correcciones no rompen flujo", "Analistas piloto", "UAT actualizado", "Pendiente", "Casos fallidos reaprobados", ""],
  ["P12", "Salida", "Semana 3", "Cierre Go/No-Go", "Decidir liberacion a analistas", "Owner / Scrum Master", "Acta de cierre", "Pendiente", "Criterios de salida cumplidos", ""],
  ["P13", "Salida", "Semana 3", "Comunicacion de arranque", "Informar reglas de uso y soporte", "Scrum Master", "Comunicado", "Pendiente", "Usuarios informados", ""],
  ["P14", "Operacion", "Semana 3", "Primer seguimiento operativo", "Asegurar que el tablero se use en juntas", "Scrum Master", "Minuta de seguimiento", "Pendiente", "Hallazgos y siguientes acciones registrados", ""],
];
setValues(plan, "A1:J1", planHeaders);
setValues(plan, `A2:J${planRows.length + 1}`, planRows);
styleHeader(plan, "A1:J1");
styleBody(plan, `A2:J${planRows.length + 1}`);
addTable(plan, `A1:J${planRows.length + 1}`, "PlanImplementacion");
plan.freezePanes.freezeRows(1);
plan.getRange("H2:H100").dataValidation = { rule: { type: "list", values: ["Pendiente", "En progreso", "Hecho", "Bloqueado"] } };
setWidths(plan, { A: 65, B: 115, C: 95, D: 230, E: 290, F: 170, G: 160, H: 115, I: 280, J: 230 });

const planModulo = ws("Plan por modulo");
const planModuloHeaders = [["ID", "Modulo", "Semana", "Actividad", "Objetivo funcional", "Audiencia", "Responsable", "Entregable", "Estado", "Criterio de cierre"]];
const planModuloRows = [
  ["PM-D01", "Dashboard", "Semana 1", "Validar acceso de Analista a /dashboard", "Confirmar que la entrada principal del rol es Vision general.", "Analistas piloto", "Scrum Master", "Acceso validado", "Pendiente", "Usuario analista entra sin error y queda en dashboard."],
  ["PM-D02", "Dashboard", "Semana 1", "Explicar lectura de Pulso operativo", "Asegurar que el usuario entiende conteos, estados y resumen de acciones.", "Analistas piloto", "Scrum Master", "Guia rapida", "Pendiente", "Usuario interpreta correctamente 3 indicadores."],
  ["PM-D03", "Dashboard", "Semana 1", "Practicar filtros desde dashboard", "Usar busqueda, fechas, estado, prioridad, area, creada por y responsable.", "Analistas piloto", "Scrum Master", "Ejercicio completado", "Pendiente", "Filtro aplicado y resultado explicado por usuario."],
  ["PM-D04", "Dashboard", "Semana 2", "Validar visibilidad limitada", "Confirmar que no aparecen exportar, O2C ni enlaces a matriz restringidos.", "Analistas piloto", "Scrum Master / Tecnico", "Evidencia UAT", "Pendiente", "0 elementos restringidos visibles para Analista."],
  ["PM-K01", "Kanban", "Semana 1", "Capacitar creacion de accion RUN", "Capturar accion con responsable, fecha/hora, prioridad, area y story points.", "Analistas piloto", "Scrum Master", "Acciones de prueba", "Pendiente", "Cada usuario crea minimo 2 acciones completas."],
  ["PM-K02", "Kanban", "Semana 1", "Practicar edicion de acciones", "Editar prioridad, responsable, fecha y descripcion sin perder datos.", "Analistas piloto", "Scrum Master", "Acciones editadas", "Pendiente", "Cambios persisten al recargar."],
  ["PM-K03", "Kanban", "Semana 2", "Validar estados y tablero/lista", "Mover acciones y alternar vistas para seguimiento operativo.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Estados y vistas reflejan la misma informacion."],
  ["PM-K04", "Kanban", "Semana 2", "Validar filtros operativos", "Probar texto, rango de fechas, estado, prioridad, area, creada por y responsable.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Cada filtro devuelve resultados esperados."],
  ["PM-A01", "Academia", "Semana 1", "Introducir ruta de aprendizaje", "Explicar progreso, modulos, pasos y quiz.", "Analistas piloto", "Scrum Master", "Sesion completada", "Pendiente", "Usuario entiende como avanzar y que se guarda por persona."],
  ["PM-A02", "Academia", "Semana 2", "Validar progreso por usuario", "Marcar pasos, completar quiz y confirmar persistencia.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Progreso se conserva despues de recargar o volver a entrar."],
  ["PM-A03", "Academia", "Semana 2", "Validar desbloqueo progresivo", "Confirmar que modulos bloqueados no se completan antes de aprobar quiz previo.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Modulo siguiente se desbloquea solo con quiz aprobado."],
  ["PM-C01", "Calendario", "Semana 1", "Explicar vista mensual", "Navegar meses y seleccionar dias para revisar elementos.", "Analistas piloto", "Scrum Master", "Sesion completada", "Pendiente", "Usuario navega y selecciona dia sin ayuda."],
  ["PM-C02", "Calendario", "Semana 2", "Validar filtros del calendario", "Filtrar acciones, recordatorios, minutas, area, responsable y estado.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Filtros muestran solo elementos esperados."],
  ["PM-C03", "Calendario", "Semana 2", "Validar captura de recordatorios y minutas", "Crear informacion de seguimiento desde el dia seleccionado.", "Analistas piloto", "Scrum Master", "Recordatorio/minuta", "Pendiente", "Elemento creado aparece en el dia correcto."],
  ["PM-C04", "Calendario", "Semana 2", "Validar edicion de acciones desde calendario", "Abrir accion del dia y editarla sin salir del flujo.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Accion editada conserva cambios en calendario y kanban."],
  ["PM-DI01", "Disciplina", "Semana 1", "Explicar uso diario de Disciplina", "Usar Disciplina como home personal para ver acciones, formacion y calendario reciente.", "Analistas piloto", "Scrum Master", "Sesion completada", "Pendiente", "Usuario entiende que Disciplina consolida su trabajo personal."],
  ["PM-DI02", "Disciplina", "Semana 2", "Validar acciones visibles del dia", "Confirmar acciones creadas, asignadas y etiquetadas por comentarios.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Las categorias muestran acciones correctas para el usuario."],
  ["PM-DI03", "Disciplina", "Semana 2", "Validar accesos a Kanban, Academia y Calendario", "Abrir los modulos relacionados desde Disciplina sin perder contexto operativo.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Los enlaces llevan al modulo correcto y con fecha/contexto cuando aplica."],
  ["PM-DI04", "Disciplina", "Semana 2", "Validar indicadores personales 90 dias", "Revisar creadas, asignadas, cerradas en tiempo, comentarios y etiquetado.", "Analistas piloto", "Scrum Master", "Evidencia UAT", "Pendiente", "Indicadores se muestran sin error y son entendibles para el usuario."],
];
setValues(planModulo, "A1:J1", planModuloHeaders);
setValues(planModulo, `A2:J${planModuloRows.length + 1}`, planModuloRows);
styleHeader(planModulo, "A1:J1");
styleBody(planModulo, `A2:J${planModuloRows.length + 1}`);
addTable(planModulo, `A1:J${planModuloRows.length + 1}`, "PlanPorModulo");
planModulo.freezePanes.freezeRows(1);
planModulo.getRange("I2:I100").dataValidation = { rule: { type: "list", values: ["Pendiente", "En progreso", "Hecho", "Bloqueado"] } };
setWidths(planModulo, { A: 75, B: 120, C: 95, D: 250, E: 330, F: 170, G: 170, H: 180, I: 120, J: 320 });

const uat = ws("UAT");
const uatHeaders = [["ID Caso", "Modulo", "Historia / Necesidad", "Precondicion", "Pasos de prueba", "Resultado esperado", "Datos de prueba", "Responsable", "Fecha planeada", "Resultado", "Evidencia / URL", "Severidad", "Defecto / Observacion", "Reprueba"]];
const uatRows = [
  ["DSH-01", "Dashboard", "Como analista quiero entrar al dashboard para revisar la operacion.", "Usuario con rol Analista activo.", "1) Iniciar sesion como Analista. 2) Abrir /dashboard. 3) Esperar carga completa.", "El dashboard carga en Vision general sin error y muestra contenido operativo.", "Usuario analista", "Analista piloto", "", "Pendiente", "", "Critica", "", ""],
  ["DSH-02", "Dashboard", "Como analista no debo ver funciones restringidas.", "Sesion de Analista en /dashboard.", "1) Revisar encabezado. 2) Buscar boton Exportar. 3) Revisar secciones O2C ejecutivas y enlaces a matriz.", "No aparece Exportar, O2C restringido ni enlaces a matriz de impacto.", "Usuario analista", "Scrum Master", "", "Pendiente", "", "Critica", "", ""],
  ["DSH-03", "Dashboard", "Como analista quiero ver Pulso operativo y resumen de acciones.", "Existen acciones de prueba.", "1) Abrir dashboard. 2) Ubicar Pulso operativo. 3) Revisar Resumen de acciones.", "Los conteos se muestran y son consistentes con las acciones visibles.", "Acciones en varios estados", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["DSH-04", "Dashboard", "Como analista quiero filtrar el dashboard por texto.", "Existen acciones con titulos distintos.", "1) Escribir un termino en busqueda. 2) Comparar resultados antes/despues.", "El resumen cambia y solo muestra acciones relacionadas con el termino.", "Buscar: reporte", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["DSH-05", "Dashboard", "Como analista quiero filtrar por rango de fechas.", "Existen acciones con fechas limite distintas.", "1) Seleccionar fecha Desde. 2) Seleccionar fecha Hasta. 3) Revisar tarjetas/resumen.", "Los resultados quedan dentro del rango de fecha limite seleccionado.", "Rango semanal", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["DSH-06", "Dashboard", "Como analista quiero aplicar filtros avanzados.", "Existen acciones con diferentes estados, prioridades, areas y responsables.", "1) Expandir filtros. 2) Seleccionar estado, prioridad, area, creada por y responsable. 3) Limpiar filtros.", "Cada filtro reduce resultados correctamente y Limpiar restablece la vista.", "Catalogos activos", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["DSH-07", "Dashboard", "Como analista quiero abrir una accion desde el dashboard.", "Existe accion visible en Resumen de acciones.", "1) Seleccionar una accion. 2) Revisar modal/formulario. 3) Cerrar sin guardar.", "La accion abre con sus datos y puede cerrarse sin alterar informacion.", "Accion existente", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["KAN-01", "Kanban", "Como analista quiero crear una accion RUN completa.", "Catalogos activos: usuarios, areas y prioridades.", "1) Abrir /kanban. 2) Clic Nueva accion. 3) Capturar titulo, responsable, dia/hora limite, prioridad, area y story points. 4) Guardar.", "La accion se guarda y aparece en tablero/lista con la informacion capturada.", "Titulo: Validar reporte semanal", "Analista piloto", "", "Pendiente", "", "Critica", "", ""],
  ["KAN-02", "Kanban", "Como analista quiero editar una accion existente.", "Accion RUN existente visible.", "1) Abrir accion. 2) Cambiar prioridad o responsable. 3) Guardar. 4) Recargar vista.", "Los cambios persisten y se reflejan en la tarjeta/lista.", "Accion KAN-01", "Analista piloto", "", "Pendiente", "", "Critica", "", ""],
  ["KAN-03", "Kanban", "Como analista quiero cambiar estado de seguimiento.", "Accion pendiente visible.", "1) Mover o actualizar accion a En ejecucion. 2) Cambiar a Hecho si aplica.", "El estado se actualiza y la accion aparece en la columna/lista correcta.", "Accion pendiente", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["KAN-04", "Kanban", "Como analista quiero alternar tablero y lista.", "Existen varias acciones visibles.", "1) Abrir Kanban. 2) Cambiar a vista lista. 3) Volver a tablero.", "Ambas vistas muestran el mismo universo de acciones y permiten abrir detalle.", "Acciones de prueba", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["KAN-05", "Kanban", "Como analista quiero filtrar acciones por texto y fechas.", "Acciones con titulos y fechas distintas.", "1) Aplicar busqueda. 2) Aplicar Desde/Hasta. 3) Validar conteos.", "Solo se muestran acciones que cumplen busqueda y rango de fecha limite.", "Buscar: cierre; rango semanal", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["KAN-06", "Kanban", "Como analista quiero filtrar por estado, prioridad, area, creador y responsable.", "Acciones variadas y catalogos cargados.", "1) Aplicar cada filtro uno por uno. 2) Combinar dos filtros. 3) Limpiar filtros.", "Los resultados coinciden con los criterios y se limpian correctamente.", "Catalogos activos", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["KAN-07", "Kanban", "Como analista quiero revisar el proximo vencimiento.", "Existe accion pendiente con fecha/hora limite cercana.", "1) Abrir Kanban. 2) Revisar bloque de proximo limite. 3) Abrir accion desde ese bloque.", "Se muestra la accion pendiente mas cercana y abre su detalle.", "Accion con vencimiento proximo", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["KAN-08", "Kanban", "Como analista quiero validar prioridades desde catalogo.", "Prioridades activas en catalogo.", "1) Abrir formulario de accion. 2) Revisar select Prioridad. 3) Abrir filtro Prioridad.", "Crear/editar y filtro usan las mismas prioridades activas del catalogo.", "Catalogo de prioridades", "Scrum Master", "", "Pendiente", "", "Alta", "", ""],
  ["ACA-01", "Academia", "Como analista quiero entrar a la Academia.", "Usuario Analista autenticado.", "1) Abrir /academia. 2) Esperar carga de ruta.", "La pagina carga modulos, progreso y detalle del primer modulo desbloqueado.", "Usuario analista", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["ACA-02", "Academia", "Como analista quiero ver mi progreso.", "Usuario con progreso inicial o existente.", "1) Revisar barra de progreso. 2) Revisar lista de modulos.", "El progreso refleja modulos completados del usuario actual.", "Progreso de prueba", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["ACA-03", "Academia", "Como analista quiero seleccionar un modulo desbloqueado.", "Existe al menos un modulo desbloqueado.", "1) Clic en modulo desbloqueado. 2) Revisar detalle, pasos y quiz.", "El detalle del modulo se muestra y permite interactuar con pasos.", "Modulo 1", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["ACA-04", "Academia", "Como analista quiero marcar pasos completados.", "Modulo desbloqueado abierto.", "1) Marcar un paso. 2) Desmarcarlo. 3) Marcarlo nuevamente.", "El estado del paso cambia y se guarda sin error.", "Paso de modulo", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["ACA-05", "Academia", "Como analista quiero saber si falle el quiz.", "Modulo con quiz abierto.", "1) Seleccionar respuestas incorrectas. 2) Enviar quiz.", "El sistema indica que no esta aprobado y no desbloquea el siguiente modulo.", "Quiz con respuesta incorrecta", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["ACA-06", "Academia", "Como analista quiero avanzar con quiz correcto.", "Modulo con quiz abierto.", "1) Seleccionar respuestas correctas. 2) Enviar quiz.", "El modulo queda completado y el siguiente modulo se desbloquea si aplica.", "Quiz correcto", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["ACA-07", "Academia", "Como analista quiero que mi progreso persista.", "Modulo con pasos o quiz completado.", "1) Recargar pagina. 2) Cerrar y volver a abrir /academia.", "El progreso, pasos y quiz aprobados se conservan para el usuario.", "Progreso guardado", "Analista piloto", "", "Pendiente", "", "Critica", "", ""],
  ["CAL-01", "Calendario", "Como analista quiero entrar al calendario.", "Usuario Analista autenticado.", "1) Abrir /calendario. 2) Esperar carga mensual.", "El calendario carga mes actual sin error.", "Usuario analista", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["CAL-02", "Calendario", "Como analista quiero navegar meses.", "Calendario abierto.", "1) Clic mes siguiente. 2) Clic mes anterior. 3) Volver al mes actual.", "La grilla cambia de mes y conserva formato de dias.", "Vista mensual", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["CAL-03", "Calendario", "Como analista quiero seleccionar un dia y ver mis acciones.", "Existen acciones visibles para el usuario.", "1) Seleccionar un dia con acciones. 2) Revisar panel de detalle.", "El panel muestra acciones visibles del usuario para ese dia.", "Dia con acciones", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["CAL-04", "Calendario", "Como analista quiero filtrar por tipo de elemento.", "Existen acciones, recordatorios o minutas.", "1) Abrir filtros. 2) Elegir acciones. 3) Elegir recordatorios. 4) Elegir minutas.", "El calendario muestra solo el tipo seleccionado.", "Tipos de calendario", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["CAL-05", "Calendario", "Como analista quiero filtrar por area, responsable y estado.", "Existen acciones variadas.", "1) Seleccionar area. 2) Seleccionar responsable. 3) Seleccionar estado.", "La vista mensual y detalle reflejan los filtros aplicados.", "Catalogos activos", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["CAL-06", "Calendario", "Como analista quiero crear un recordatorio.", "Dia seleccionado en calendario.", "1) Seleccionar dia. 2) Clic nuevo recordatorio. 3) Capturar titulo, fecha/hora y descripcion. 4) Guardar.", "El recordatorio aparece en el dia seleccionado.", "Recordatorio de prueba", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["CAL-07", "Calendario", "Como analista quiero crear una minuta.", "Dia seleccionado en calendario.", "1) Seleccionar dia. 2) Clic nueva minuta/nota. 3) Capturar titulo y texto. 4) Guardar.", "La minuta aparece en el dia seleccionado y es visible en el detalle.", "Minuta de seguimiento", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["CAL-08", "Calendario", "Como analista quiero editar una accion desde calendario.", "Accion visible en un dia seleccionado.", "1) Seleccionar dia. 2) Abrir accion desde detalle. 3) Editar prioridad o fecha. 4) Guardar.", "La accion se actualiza y el cambio se refleja en Calendario y Kanban.", "Accion existente", "Analista piloto", "", "Pendiente", "", "Critica", "", ""],
  ["DIS-01", "Disciplina", "Como analista quiero entrar a mi dia operativo.", "Usuario Analista autenticado.", "1) Abrir /disciplina. 2) Esperar carga de header y tarjetas.", "La pagina muestra Tu dia operativo, Mis acciones, Asignadas y Comentarios sin error.", "Usuario analista", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["DIS-02", "Disciplina", "Como analista quiero ver mis acciones del dia.", "Existen acciones creadas, asignadas o etiquetadas al usuario.", "1) Abrir Disciplina. 2) Revisar tarjeta Acciones del dia. 3) Comparar Total, En curso, Cerradas y Riesgo.", "Los conteos reflejan las acciones visibles para el usuario.", "Acciones de prueba", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["DIS-03", "Disciplina", "Como analista quiero distinguir Creaste, Te asignaron y Te etiquetaron.", "Acciones de prueba en las tres categorias.", "1) Expandir cada categoria. 2) Revisar acciones listadas. 3) Abrir tooltip de ayuda.", "Cada accion aparece en la categoria correcta y el tooltip explica el criterio.", "Acciones creadas/asignadas/etiquetadas", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["DIS-04", "Disciplina", "Como analista quiero abrir Kanban desde una accion del dia.", "Existe accion visible en Disciplina.", "1) Clic en una accion. 2) Confirmar navegacion a Kanban con accion/fecha. 3) Abrir detalle.", "Kanban abre con contexto de la accion y permite revisar/editar detalle.", "Accion visible", "Analista piloto", "", "Pendiente", "", "Alta", "", ""],
  ["DIS-05", "Disciplina", "Como analista quiero continuar mi Academia desde Disciplina.", "Academia disponible para el usuario.", "1) Revisar tarjeta Academia O2C. 2) Clic Ver Academia o Continuar formacion.", "Se muestra progreso compacto y el enlace abre /academia.", "Progreso academia", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["DIS-06", "Disciplina", "Como analista quiero revisar recordatorios y minutas recientes.", "Existen recordatorios o minutas del usuario.", "1) Revisar seccion Recordatorios y minutas. 2) Alternar pestañas en mobile si aplica. 3) Abrir elemento.", "Los elementos recientes se muestran y llevan al calendario con fecha/tipo correcto.", "Recordatorio y minuta reciente", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
  ["DIS-07", "Disciplina", "Como analista quiero entender mis indicadores de 90 dias.", "Usuario con historial de acciones/comentarios.", "1) Revisar Indicadores de acciones. 2) Validar cerradas en tiempo, generadas, comentarios y etiquetado.", "Los indicadores cargan sin error y son comprensibles para seguimiento personal.", "Historial 90 dias", "Analista piloto", "", "Pendiente", "", "Media", "", ""],
];
setValues(uat, "A1:N1", uatHeaders);
setValues(uat, `A2:N${uatRows.length + 1}`, uatRows);
styleHeader(uat, "A1:N1");
styleBody(uat, `A2:N${uatRows.length + 1}`);
addTable(uat, `A1:N${uatRows.length + 1}`, "MatrizUAT");
uat.freezePanes.freezeRows(1);
uat.getRange("J2:J200").dataValidation = { rule: { type: "list", values: ["Pendiente", "Aprobado", "Fallido", "Bloqueado", "No aplica"] } };
uat.getRange("L2:L200").dataValidation = { rule: { type: "list", values: ["Critica", "Alta", "Media", "Baja"] } };
uat.getRange("I2:I200").format.numberFormat = "yyyy-mm-dd";
setWidths(uat, { A: 85, B: 135, C: 310, D: 230, E: 330, F: 320, G: 170, H: 160, I: 120, J: 110, K: 210, L: 90, M: 280, N: 140 });

const sesiones = ws("Sesiones");
const sesHeaders = [["ID", "Sesion", "Audiencia", "Objetivo", "Duracion", "Facilitador", "Estado", "Evidencia", "Notas"]];
const sesRows = [
  ["S01", "Kickoff UAT Analistas", "Analistas piloto, Owner", "Alinear alcance, reglas y calendario UAT", "45 min", "Scrum Master", "Pendiente", "", ""],
  ["S02", "Capacitacion Dashboard y filtros", "Analistas piloto", "Leer Vision general, Pulso operativo y filtros del dashboard", "60 min", "Scrum Master", "Pendiente", "", ""],
  ["S03", "Capacitacion Kanban acciones RUN", "Analistas piloto", "Crear, editar, asignar, filtrar y cerrar acciones RUN", "75 min", "Scrum Master", "Pendiente", "", ""],
  ["S04", "Capacitacion Academia", "Analistas piloto", "Completar pasos, quiz y validar progreso persistente", "45 min", "Scrum Master", "Pendiente", "", ""],
  ["S05", "Capacitacion Calendario", "Analistas piloto", "Navegar calendario, filtrar elementos, crear recordatorios y minutas", "60 min", "Scrum Master", "Pendiente", "", ""],
  ["S06", "Capacitacion Disciplina operativa", "Analistas piloto", "Usar Disciplina como home personal: acciones del dia, academia, calendario e indicadores", "60 min", "Scrum Master", "Pendiente", "", ""],
  ["S07", "UAT guiado por modulo", "Analistas piloto", "Ejecutar casos Dashboard, Kanban, Academia, Calendario y Disciplina", "150 min", "Scrum Master", "Pendiente", "", ""],
  ["S08", "Reprueba y cierre", "Analistas piloto, Owner", "Validar correcciones y acordar salida por modulo", "60 min", "Scrum Master", "Pendiente", "", ""],
];
setValues(sesiones, "A1:I1", sesHeaders);
setValues(sesiones, `A2:I${sesRows.length + 1}`, sesRows);
styleHeader(sesiones, "A1:I1");
styleBody(sesiones, `A2:I${sesRows.length + 1}`);
addTable(sesiones, `A1:I${sesRows.length + 1}`, "SesionesUAT");
sesiones.freezePanes.freezeRows(1);
sesiones.getRange("G2:G100").dataValidation = { rule: { type: "list", values: ["Pendiente", "Programada", "Completada", "Reprogramada", "Cancelada"] } };
setWidths(sesiones, { A: 70, B: 230, C: 210, D: 340, E: 90, F: 150, G: 120, H: 220, I: 260 });

const riesgos = ws("Riesgos");
const riskHeaders = [["ID", "Tipo", "Riesgo / Impedimento", "Impacto", "Probabilidad", "Mitigacion", "Estado", "Responsable", "Fecha objetivo"]];
const riskRows = [
  ["R01", "Adopcion", "Usuarios no capturan acciones en el tablero y siguen usando seguimiento manual.", "Alta", "Media", "Usar tablero en junta diaria/semanal y revisar acciones reales.", "Abierto", "Scrum Master", ""],
  ["R02", "Datos", "Catalogos de areas, prioridades o usuarios incompletos.", "Alta", "Media", "Validar catalogos antes del UAT y nombrar responsable de mantenimiento.", "Abierto", "Admin", ""],
  ["R03", "Permisos", "Rol Analista ve mas o menos modulos de los esperados.", "Alta", "Baja", "Ejecutar casos SEC antes del piloto amplio.", "Abierto", "Equipo tecnico", ""],
  ["R04", "Proceso", "No hay acuerdo sobre responsable de cumplimiento.", "Media", "Media", "Definir regla operativa: responsable es quien debe cerrar la accion.", "Abierto", "Scrum Master", ""],
  ["R05", "Calidad", "Defectos criticos aparecen cerca del cierre.", "Alta", "Baja", "Bloquear salida si hay criticos abiertos y hacer reprueba dirigida.", "Abierto", "Owner / Tecnico", ""],
];
setValues(riesgos, "A1:I1", riskHeaders);
setValues(riesgos, `A2:I${riskRows.length + 1}`, riskRows);
styleHeader(riesgos, "A1:I1");
styleBody(riesgos, `A2:I${riskRows.length + 1}`);
addTable(riesgos, `A1:I${riskRows.length + 1}`, "RiesgosUAT");
riesgos.freezePanes.freezeRows(1);
riesgos.getRange("D2:D100").dataValidation = { rule: { type: "list", values: ["Critica", "Alta", "Media", "Baja"] } };
riesgos.getRange("E2:E100").dataValidation = { rule: { type: "list", values: ["Alta", "Media", "Baja"] } };
riesgos.getRange("G2:G100").dataValidation = { rule: { type: "list", values: ["Abierto", "En mitigacion", "Cerrado"] } };
riesgos.getRange("I2:I100").format.numberFormat = "yyyy-mm-dd";
setWidths(riesgos, { A: 65, B: 110, C: 360, D: 105, E: 115, F: 360, G: 120, H: 170, I: 120 });

const salida = ws("Checklist salida");
const checklistHeaders = [["ID", "Criterio", "Validacion", "Responsable", "Estado", "Evidencia / Comentario"]];
const checklistRows = [
  ["C01", "Permisos de Analista validados", "No ve Exportar, O2C restringido ni enlaces a matriz.", "Scrum Master", "Pendiente", ""],
  ["C02", "UAT funcional aprobado", ">= 95% de casos aprobados.", "Scrum Master", "Pendiente", ""],
  ["C03", "0 defectos criticos abiertos", "Todos los criticos cerrados o con workaround aprobado.", "Equipo tecnico", "Pendiente", ""],
  ["C04", "Catalogos base completos", "Usuarios, areas y prioridades activos.", "Admin", "Pendiente", ""],
  ["C05", "Usuarios piloto capacitados", "Sesiones completadas y asistencia registrada.", "Scrum Master", "Pendiente", ""],
  ["C06", "Regla operativa aceptada", "Responsable de cumplimiento, fecha limite y prioridad se usan consistentemente.", "Owner", "Pendiente", ""],
  ["C07", "Canal de soporte definido", "Ruta para reportar errores y mejoras.", "Scrum Master", "Pendiente", ""],
  ["C08", "Go/No-Go documentado", "Decision registrada con pendientes priorizados.", "Owner", "Pendiente", ""],
];
setValues(salida, "A1:F1", checklistHeaders);
setValues(salida, `A2:F${checklistRows.length + 1}`, checklistRows);
styleHeader(salida, "A1:F1");
styleBody(salida, `A2:F${checklistRows.length + 1}`);
addTable(salida, `A1:F${checklistRows.length + 1}`, "ChecklistSalida");
salida.freezePanes.freezeRows(1);
salida.getRange("E2:E100").dataValidation = { rule: { type: "list", values: ["Pendiente", "Cumple", "No cumple", "Bloqueado"] } };
setWidths(salida, { A: 65, B: 260, C: 360, D: 160, E: 120, F: 340 });

const checklistModulo = ws("Checklist por modulo");
const checklistModuloHeaders = [["Modulo", "Objetivo de salida", "Criterios minimos", "Casos UAT esperados", "% Aprobado", "Bloqueadores", "Estado", "Responsable validacion", "Go/No-Go", "Observaciones"]];
const checklistModuloRows = [
  ["Dashboard", "Analista puede usar Vision general para seguimiento operativo.", "Acceso correcto, visibilidad limitada, filtros y resumen funcionando.", '=COUNTIF(UAT!B2:B200,"Dashboard")', '=IFERROR(COUNTIFS(UAT!B2:B200,A2,UAT!J2:J200,"Aprobado")/D2,0)', '=COUNTIFS(UAT!B2:B200,A2,UAT!J2:J200,"Bloqueado")', "No iniciado", "Scrum Master", '=IF(AND(E2>=0.95,F2=0),"Go","No-Go")', ""],
  ["Kanban", "Analista puede operar acciones RUN de punta a punta.", "Crear, editar, cambiar estado, alternar vistas y filtrar acciones.", '=COUNTIF(UAT!B2:B200,"Kanban")', '=IFERROR(COUNTIFS(UAT!B2:B200,A3,UAT!J2:J200,"Aprobado")/D3,0)', '=COUNTIFS(UAT!B2:B200,A3,UAT!J2:J200,"Bloqueado")', "No iniciado", "Scrum Master", '=IF(AND(E3>=0.95,F3=0),"Go","No-Go")', ""],
  ["Academia", "Analista puede avanzar en ruta formativa con progreso persistente.", "Modulos, pasos, quiz, desbloqueo y persistencia funcionando.", '=COUNTIF(UAT!B2:B200,"Academia")', '=IFERROR(COUNTIFS(UAT!B2:B200,A4,UAT!J2:J200,"Aprobado")/D4,0)', '=COUNTIFS(UAT!B2:B200,A4,UAT!J2:J200,"Bloqueado")', "No iniciado", "Scrum Master", '=IF(AND(E4>=0.95,F4=0),"Go","No-Go")', ""],
  ["Calendario", "Analista puede planear y consultar acciones, recordatorios y minutas.", "Navegacion mensual, filtros, detalle por dia, recordatorios, minutas y edicion de accion.", '=COUNTIF(UAT!B2:B200,"Calendario")', '=IFERROR(COUNTIFS(UAT!B2:B200,A5,UAT!J2:J200,"Aprobado")/D5,0)', '=COUNTIFS(UAT!B2:B200,A5,UAT!J2:J200,"Bloqueado")', "No iniciado", "Scrum Master", '=IF(AND(E5>=0.95,F5=0),"Go","No-Go")', ""],
  ["Disciplina", "Analista puede usar su home operativo personal para seguimiento diario.", "Acciones del dia, categorias personales, acceso a Kanban/Academia/Calendario e indicadores funcionando.", '=COUNTIF(UAT!B2:B200,"Disciplina")', '=IFERROR(COUNTIFS(UAT!B2:B200,A6,UAT!J2:J200,"Aprobado")/D6,0)', '=COUNTIFS(UAT!B2:B200,A6,UAT!J2:J200,"Bloqueado")', "No iniciado", "Scrum Master", '=IF(AND(E6>=0.95,F6=0),"Go","No-Go")', ""],
];
setValues(checklistModulo, "A1:J1", checklistModuloHeaders);
setValues(checklistModulo, `A2:J${checklistModuloRows.length + 1}`, checklistModuloRows);
styleHeader(checklistModulo, "A1:J1");
styleBody(checklistModulo, `A2:J${checklistModuloRows.length + 1}`);
addTable(checklistModulo, `A1:J${checklistModuloRows.length + 1}`, "ChecklistPorModulo");
checklistModulo.freezePanes.freezeRows(1);
checklistModulo.getRange("E2:E100").format.numberFormat = "0%";
checklistModulo.getRange("G2:G100").dataValidation = { rule: { type: "list", values: ["No iniciado", "En prueba", "Aprobado", "Aprobado con observaciones", "Bloqueado"] } };
setWidths(checklistModulo, { A: 125, B: 320, C: 360, D: 120, E: 110, F: 110, G: 170, H: 180, I: 100, J: 300 });

const protocolo = ws("Protocolo operativo");
setValues(protocolo, "A1:F1", [["Protocolo operativo para uso del tablero por Analistas", "", "", "", "", ""]]);
styleTitle(protocolo, "A1:F1");
setValues(protocolo, "A3:F3", [["Regla", "Descripcion", "Cuando aplica", "Responsable", "Evidencia esperada", "Decision / salida"]]);
styleHeader(protocolo, "A3:F3");
setValues(protocolo, "A4:F11", [
  ["Captura minima", "Toda accion debe tener titulo, responsable de cumplimiento, fecha/hora limite, prioridad y area cuando aplique.", "Al crear accion", "Analista", "Accion creada", "Accion valida para seguimiento"],
  ["Prioridad", "La prioridad se toma del catalogo vigente y expresa urgencia/impacto operativo.", "Crear/editar accion", "Analista", "Prioridad seleccionada", "Permite ordenar seguimiento"],
  ["Responsable de cumplimiento", "Persona que debe ejecutar o asegurar el cierre de la accion.", "Crear/editar accion", "Analista / Lider area", "Responsable asignado", "Accountability visible"],
  ["Fecha limite", "Compromiso operativo para seguimiento y alertas.", "Toda accion", "Analista", "Dia y hora limite", "Base para filtros y retrasos"],
  ["Filtros", "Las juntas deben usar busqueda, rango de fechas, estado, prioridad, area, creada por y responsable.", "Junta operativa", "Scrum Master", "Vista filtrada", "Foco de conversacion"],
  ["Cambio de estado", "Actualizar estado cuando exista avance real; no esperar al cierre de junta.", "Durante operacion", "Responsable", "Estado actualizado", "Tablero confiable"],
  ["Comentarios / evidencia", "Registrar informacion suficiente para que otra persona entienda el avance.", "Cuando haya avance o bloqueo", "Responsable", "Comentario/evidencia", "Menos seguimiento manual"],
  ["Mejoras futuras", "Todo hallazgo no bloqueante del UAT entra a backlog de mejoras, no detiene salida.", "Durante UAT", "Scrum Master", "Observacion clasificada", "Backlog priorizado"],
]);
styleBody(protocolo, "A4:F11");
setWidths(protocolo, { A: 175, B: 370, C: 180, D: 170, E: 220, F: 220 });

for (const sheet of wb.worksheets.items) {
  const used = sheet.getUsedRange();
  if (used) {
    used.format.wrapText = true;
    used.format.verticalAlignment = "Top";
  }
}

await fs.mkdir(outputDir, { recursive: true });

const summary = await wb.inspect({
  kind: "table",
  range: "Resumen!A1:H16",
  include: "values,formulas",
  tableMaxRows: 16,
  tableMaxCols: 8,
});
console.log(summary.ndjson);

const errors = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

for (const sheetName of ["Resumen", "Guia del workbook", "Plan", "Plan por modulo", "UAT", "Sesiones", "Riesgos", "Checklist salida", "Checklist por modulo", "Protocolo operativo"]) {
  await wb.render({ sheetName, range: "A1:H18", scale: 1 });
}

const xlsx = await SpreadsheetFile.exportXlsx(wb);
try {
  await xlsx.save(outputPath);
  console.log(`SAVED ${outputPath}`);
} catch (error) {
  if (error && typeof error === "object" && error.code === "EBUSY") {
    const fallbackPath = `${outputDir}/Plan_Implementacion_UAT_Tablero_Analistas_Disciplina.xlsx`;
    await xlsx.save(fallbackPath);
    console.log(`SAVED ${fallbackPath}`);
  } else {
    throw error;
  }
}
