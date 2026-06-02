import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/uat_analistas";
const outputPath = `${outputDir}/Plan_UAT_Analista_Pantallas_Especificas.xlsx`;

const wb = Workbook.create();
const resumen = wb.worksheets.add("Resumen");

function ws(name) {
  return wb.worksheets.items.find((s) => s.name === name) ?? wb.worksheets.add(name);
}

function setValues(sheet, address, values) {
  sheet.getRange(address).values = values;
}

function title(sheet, range = "A1:H1") {
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

function table(sheet, range, name) {
  const t = sheet.tables.add(range, true, name);
  t.style = "TableStyleMedium2";
  return t;
}

const modules = ["Dashboard", "Kanban", "Academia", "Disciplina", "Calendario", "Notificaciones", "Perfil"];

setValues(resumen, "A1:H1", [["Plan de Implementacion y UAT - Analista - Pantallas especificas", "", "", "", "", "", "", ""]]);
title(resumen);
setValues(resumen, "A3:B10", [
  ["Rol ejecutor", "Analista de operaciones con acceso estandar; sin super_admin, sin configuracion y sin modulos de admin."],
  ["Criterio global", "Cada caso pasa si el analista completa la tarea sin ayuda externa, sin errores visibles y en el tiempo esperado."],
  ["Falla automatica", "Spinner infinito, NaN, undefined, pantalla en blanco o toast de error no explicativo."],
  ["Alcance", "Dashboard, Kanban, Academia, Disciplina, Calendario, Notificaciones y Perfil."],
  ["Fuera de alcance", "Configuracion, admin, cambios tecnicos y funcionalidades no visibles para Analista."],
  ["Responsable del archivo", "Scrum Master / Project Manager."],
  ["Version", "UAT v1 pantallas especificas"],
  ["Fecha", new Date()],
]);
section(resumen, "A3:A10");
body(resumen, "A3:B10");
resumen.getRange("B10").format.numberFormat = "yyyy-mm-dd";

setValues(resumen, "D3:H3", [["Indicador", "Meta", "Actual", "Semaforo", "Comentario"]]);
header(resumen, "D3:H3");
const summaryRows = [
  ["UAT total aprobado", ">= 95%", '=IFERROR(COUNTIF(UAT!J2:J250,"Aprobado")/COUNTA(UAT!A2:A250),0)', '=IF(F4>=0.95,"Verde",IF(F4>=0.85,"Amarillo","Rojo"))', "Todos los casos funcionales y borde."],
  ["Criticos fallidos", "0", '=COUNTIFS(UAT!L2:L250,"Critica",UAT!J2:J250,"Fallido")+COUNTIFS(UAT!L2:L250,"Critica",UAT!J2:J250,"Bloqueado")', '=IF(F5=0,"Verde","Rojo")', "Cualquier critico fallido o bloqueado detiene salida."],
  ["Bloqueados", "0", '=COUNTIF(UAT!J2:J250,"Bloqueado")', '=IF(F6=0,"Verde",IF(F6<=2,"Amarillo","Rojo"))', "Casos sin poder ejecutarse."],
  ["Defectos abiertos", "0", '=COUNTIF(Riesgos!G2:G100,"Abierto")', '=IF(F7=0,"Verde",IF(F7<=2,"Amarillo","Rojo"))', "Riesgos o defectos activos."],
  ...modules.map((m, i) => [
    `UAT ${m} aprobado`,
    ">= 95%",
    `=IFERROR(COUNTIFS(UAT!B2:B250,"${m}",UAT!J2:J250,"Aprobado")/COUNTIF(UAT!B2:B250,"${m}"),0)`,
    `=IF(F${8 + i}>=0.95,"Verde",IF(F${8 + i}>=0.85,"Amarillo","Rojo"))`,
    `Cobertura ${m}.`,
  ]),
  ["Decision Go/No-Go", "Go si cumple criterios", "", "", "Actualizar al cierre."],
];
setValues(resumen, `D4:H${summaryRows.length + 3}`, summaryRows);
resumen.getRange(`F4:F${summaryRows.length + 3}`).format.numberFormat = "0%";
body(resumen, `D4:H${summaryRows.length + 3}`);
widths(resumen, { A: 160, B: 500, D: 190, E: 150, F: 120, G: 110, H: 320 });

const flujo = ws("Flujo y responsables");
setValues(flujo, "A1:G1", [["Orden de uso, responsables y decisiones", "", "", "", "", "", ""]]);
title(flujo, "A1:G1");
setValues(flujo, "A3:G3", [["Orden", "Pestana", "Quien la usa", "Quien la actualiza", "Que hace", "Salida esperada", "Decision"]]);
header(flujo, "A3:G3");
const flujoRows = [
  [1, "Resumen", "Direccion, Owner, Scrum Master", "Scrum Master", "Leer avance, semaforos y bloqueadores.", "Estado ejecutivo confiable.", "Continuar, escalar o detener salida."],
  [2, "Flujo y responsables", "Todos", "Scrum Master", "Aclarar quien hace que y en que orden.", "Reglas de trabajo claras.", "Evitar duplicidad y confusion."],
  [3, "Plan", "Scrum Master", "Scrum Master", "Administrar preparacion, capacitacion, ejecucion y cierre.", "Plan con estado por actividad.", "Saber si UAT puede iniciar."],
  [4, "Plan por modulo", "Scrum Master, lider funcional", "Scrum Master", "Preparar cada modulo antes de probarlo.", "Modulo listo para UAT.", "Abrir pruebas del modulo."],
  [5, "Sesiones", "Scrum Master, Analistas", "Scrum Master", "Ejecutar agenda de pruebas guiadas.", "Asistencia y evidencia.", "Pasar a reprueba o cierre."],
  [6, "UAT", "Analistas piloto", "Analistas registran; Scrum Master consolida", "Ejecutar casos, marcar resultado y observaciones.", "Evidencia por caso.", "Aceptar o rechazar cada caso."],
  [7, "Riesgos", "Scrum Master, equipo tecnico", "Scrum Master", "Convertir fallas relevantes en bloqueadores o riesgos.", "Defectos priorizados.", "Escalar y corregir."],
  [8, "Criterios por modulo", "Scrum Master, lider funcional", "Scrum Master", "Evaluar criticos, fallos medios y bloqueadores por modulo.", "Go/No-Go por modulo.", "Liberar modulo o regresarlo a ajustes."],
  [9, "Reporte bug", "Analistas, Scrum Master", "Quien reporte bug", "Documentar defectos de forma reproducible.", "Bug accionable.", "Corregir sin retrabajo."],
];
setValues(flujo, `A4:G${flujoRows.length + 3}`, flujoRows);
body(flujo, `A4:G${flujoRows.length + 3}`);
table(flujo, `A3:G${flujoRows.length + 3}`, "FlujoResponsables");
widths(flujo, { A: 65, B: 170, C: 220, D: 220, E: 340, F: 250, G: 260 });

const plan = ws("Plan");
setValues(plan, "A1:I1", [["ID", "Fase", "Semana", "Actividad", "Objetivo", "Responsable", "Participa", "Estado", "Criterio de cierre"]]);
header(plan, "A1:I1");
const planRows = [
  ["P01", "Preparacion", "Semana 1", "Confirmar usuarios Analista", "Validar que todos sean no super_admin.", "Scrum Master", "Owner", "Pendiente", "Lista cerrada de usuarios piloto."],
  ["P02", "Preparacion", "Semana 1", "Confirmar alcance por pantalla", "Evitar probar funcionalidades fuera de alcance.", "Scrum Master", "Lider funcional", "Pendiente", "Pantallas y restricciones aceptadas."],
  ["P03", "Preparacion", "Semana 1", "Preparar datos minimos", "Tener acciones, responsables, fechas y notificaciones de prueba.", "Scrum Master", "Equipo tecnico", "Pendiente", "Datos suficientes para casos UAT."],
  ["P04", "Capacitacion", "Semana 1", "Explicar reglas de UAT", "Alinear criterio global, tiempos y evidencia.", "Scrum Master", "Analistas", "Pendiente", "Analistas saben como registrar resultados."],
  ["P05", "UAT", "Semana 2", "Ejecutar sesion Dashboard y Kanban basico", "Validar entrada operativa y flujo de acciones.", "Analistas piloto", "Scrum Master", "Pendiente", "Casos de sesion 1 ejecutados."],
  ["P06", "UAT", "Semana 2", "Ejecutar sesion Kanban avanzado", "Validar vistas, filtros, estados y comportamiento de tarjetas.", "Analistas piloto", "Scrum Master", "Pendiente", "Casos de sesion 2 ejecutados."],
  ["P07", "UAT", "Semana 2", "Ejecutar Academia, Disciplina y Perfil", "Validar experiencia personal del analista.", "Analistas piloto", "Scrum Master", "Pendiente", "Casos de sesion 3 ejecutados."],
  ["P08", "UAT", "Semana 2", "Ejecutar Calendario y Notificaciones", "Validar seguimiento temporal y avisos.", "Analistas piloto", "Scrum Master", "Pendiente", "Casos de sesion 4 ejecutados."],
  ["P09", "UAT", "Semana 2", "Ejecutar casos borde", "Confirmar empty states, errores claros y datos sin NaN.", "Analistas piloto", "Scrum Master", "Pendiente", "Casos borde ejecutados."],
  ["P10", "Cierre", "Semana 3", "Clasificar bugs", "Separar criticos, altos, medios, bajos y no aplica.", "Scrum Master", "Equipo tecnico", "Pendiente", "Backlog UAT priorizado."],
  ["P11", "Cierre", "Semana 3", "Reprueba dirigida", "Confirmar correcciones sin romper flujos base.", "Analistas piloto", "Scrum Master", "Pendiente", "Casos fallidos reaprobados o aceptados con observacion."],
  ["P12", "Salida", "Semana 3", "Decision Go/No-Go", "Tomar decision por modulo y global.", "Owner", "Scrum Master", "Pendiente", "Decision documentada."],
];
setValues(plan, `A2:I${planRows.length + 1}`, planRows);
body(plan, `A2:I${planRows.length + 1}`);
table(plan, `A1:I${planRows.length + 1}`, "PlanImplementacion");
plan.freezePanes.freezeRows(1);
plan.getRange("H2:H100").dataValidation = { rule: { type: "list", values: ["Pendiente", "En progreso", "Hecho", "Bloqueado"] } };
widths(plan, { A: 65, B: 115, C: 95, D: 260, E: 340, F: 170, G: 170, H: 120, I: 320 });

const planModulo = ws("Plan por modulo");
setValues(planModulo, "A1:I1", [["ID", "Modulo", "Actividad previa", "Objetivo", "Responsable", "Participa", "Estado", "Criterio de cierre", "Notas"]]);
header(planModulo, "A1:I1");
const planModuloRows = [
  ["PM-DASH-01", "Dashboard", "Validar acceso y datos", "Confirmar carga inicial, score, KPI, filtros y acciones.", "Scrum Master", "Analistas", "Pendiente", "Dashboard listo para UAT sin elementos restringidos.", ""],
  ["PM-KAN-01", "Kanban", "Validar flujo RUN", "Confirmar columnas, cambio de estado, edicion, filtros y vistas.", "Scrum Master", "Analistas", "Pendiente", "Kanban listo para ejecutar casos funcionales.", ""],
  ["PM-ACA-01", "Academia", "Validar contenido y navegacion", "Confirmar que contenido estatico/interactivo carga sin romperse.", "Scrum Master", "Analistas", "Pendiente", "Academia lista para UAT de lectura y avance.", ""],
  ["PM-DIS-01", "Disciplina", "Validar home operativo personal", "Confirmar acciones del dia, categorias personales, links e indicadores.", "Scrum Master", "Analistas", "Pendiente", "Disciplina lista para UAT diario.", ""],
  ["PM-CAL-01", "Calendario", "Validar vista mensual", "Confirmar acciones por fecha, navegacion, detalle y edicion.", "Scrum Master", "Analistas", "Pendiente", "Calendario listo para UAT.", ""],
  ["PM-NOT-01", "Notificaciones", "Preparar eventos de prueba", "Tener asignaciones y comentarios que generen notificaciones.", "Scrum Master", "Equipo tecnico", "Pendiente", "Notificaciones listas para UAT.", "Tiempo real requiere dos sesiones."],
  ["PM-PRF-01", "Perfil", "Validar acceso personal", "Confirmar datos del usuario, edicion permitida y cierre de sesion.", "Scrum Master", "Analistas", "Pendiente", "Perfil listo para UAT.", ""],
];
setValues(planModulo, `A2:I${planModuloRows.length + 1}`, planModuloRows);
body(planModulo, `A2:I${planModuloRows.length + 1}`);
table(planModulo, `A1:I${planModuloRows.length + 1}`, "PlanPorModulo");
planModulo.freezePanes.freezeRows(1);
planModulo.getRange("G2:G100").dataValidation = { rule: { type: "list", values: ["Pendiente", "En progreso", "Hecho", "Bloqueado"] } };
widths(planModulo, { A: 105, B: 135, C: 260, D: 360, E: 170, F: 160, G: 120, H: 330, I: 240 });

const cases = [
  ["UAT-DASH-01", "Dashboard", "Funcional", "Carga inicial sin spinner infinito", "Analista autenticado.", "Navegar a /dashboard.", "Todos los bloques renderizan en menos de 3s.", "3s", "Analista piloto", "Critica"],
  ["UAT-DASH-02", "Dashboard", "Funcional", "Score global visible con porcentaje", "Dashboard abierto.", "Abrir dashboard y revisar score global.", "Numero y simbolo % visibles; no aparece NaN.", "-", "Analista piloto", "Critica"],
  ["UAT-DASH-03", "Dashboard", "Funcional", "Semaforo KPI carga datos reales", "Dashboard abierto con datos.", "Esperar carga y revisar cards KPI.", "Cards con nombre, porcentaje y barra de color.", "3s", "Analista piloto", "Alta"],
  ["UAT-DASH-04", "Dashboard", "Funcional", "Filtro de fecha cambia acciones", "Existen acciones en distintas fechas.", "Cambiar fecha en toolbar.", "Lista de acciones se actualiza en menos de 2s.", "2s", "Analista piloto", "Critica"],
  ["UAT-DASH-05", "Dashboard", "Funcional", "Limpiar filtros vuelve a hoy", "Filtro aplicado.", "Clic en Limpiar filtros.", "Fecha vuelve a hoy y acciones del dia.", "1s", "Analista piloto", "Alta"],
  ["UAT-DASH-06", "Dashboard", "Funcional", "Cadena operativa con datos", "Dashboard con datos vinculados.", "Ver seccion de cadena causa-efecto.", "Cards con valores numericos; sin guiones por error ni NaN.", "-", "Analista piloto", "Alta"],
  ["UAT-DASH-07", "Dashboard", "Funcional", "Top impacto solo pendientes", "Existen acciones abiertas y cerradas.", "Ver seccion Mayor impacto pendiente.", "Solo aparecen acciones no finalizadas.", "-", "Analista piloto", "Media"],
  ["UAT-DASH-08", "Dashboard", "Funcional", "Pulso operativo calcula bien", "Acciones con estados distintos.", "Ver tarjetas de eficiencia.", "Total, completadas y bloqueadas son coherentes.", "-", "Analista piloto", "Alta"],
  ["UAT-DASH-09", "Dashboard", "Funcional", "Crear accion desde dashboard", "Dashboard abierto.", "Clic en Nueva accion.", "Dialog abre en modo creacion en menos de 500ms.", "500ms", "Analista piloto", "Critica"],
  ["UAT-DASH-10", "Dashboard", "Permisos", "Matriz de impacto restringida para Analista", "Sesion de Analista.", "Buscar enlace o boton Matriz de impacto en dashboard.", "No aparece enlace restringido; si aparece, se registra falla de permisos.", "2s", "Scrum Master", "Critica"],
  ["UAT-DASH-E01", "Dashboard", "Borde", "Sin acciones para la fecha", "Fecha sin acciones.", "Seleccionar fecha sin acciones.", "Empty state con mensaje claro; no tabla vacia.", "-", "Analista piloto", "Media"],
  ["UAT-DASH-E02", "Dashboard", "Borde", "Sin datos activos", "No hay datos vinculados para cadena.", "Abrir dashboard con datos minimos.", "Muestra 0% o empty state; no NaN.", "-", "Analista piloto", "Alta"],
  ["UAT-DASH-E03", "Dashboard", "Borde", "Sin conexion", "Simular error de red o servicio.", "Abrir dashboard o reintentar carga.", "Mensaje claro de error y boton reintentar.", "-", "Scrum Master", "Alta"],

  ["UAT-KAN-01", "Kanban", "Funcional", "Columnas en orden correcto", "Analista autenticado.", "Abrir /kanban.", "Columnas Pendiente, Hoy, En ejecucion, Bloqueado, Retraso, Hecho, Verificado.", "3s", "Analista piloto", "Critica"],
  ["UAT-KAN-02", "Kanban", "Funcional", "Skeleton durante carga", "Sesion lenta o recarga inicial.", "Navegar a /kanban.", "Columnas skeleton visibles antes de datos.", "100ms", "Analista piloto", "Media"],
  ["UAT-KAN-03", "Kanban", "Funcional", "Arrastrar card cambia estado", "Accion en Pendiente.", "Arrastrar card de Pendiente a Hoy.", "Card aparece en Hoy y desaparece de Pendiente.", "1s", "Analista piloto", "Critica"],
  ["UAT-KAN-04", "Kanban", "Funcional", "Toast al mover estado", "Movimiento valido.", "Arrastrar una card a otro estado permitido.", "Toast de Estado actualizado aparece.", "500ms", "Analista piloto", "Media"],
  ["UAT-KAN-05", "Kanban", "Permisos", "Columna restringida rechaza drop", "Analista sin permiso de verificacion.", "Arrastrar card a Verificado.", "Se rechaza movimiento con feedback visual y toast de denegacion.", "-", "Analista piloto", "Critica"],
  ["UAT-KAN-06", "Kanban", "Funcional", "Mover estado por dropdown", "Card visible.", "Clic en menu de card y elegir estado permitido.", "Estado cambia igual que por drag.", "1s", "Analista piloto", "Alta"],
  ["UAT-KAN-07", "Kanban", "Funcional", "Editar card abre dialog", "Card visible.", "Clic en editar card.", "Dialog abre con datos precargados.", "500ms", "Analista piloto", "Critica"],
  ["UAT-KAN-08", "Kanban", "Funcional", "Filtro de estado muestra columna esperada", "Existen acciones bloqueadas.", "Filtrar por Bloqueado.", "Solo columna o lista de Bloqueado visible segun vista.", "1s", "Analista piloto", "Alta"],
  ["UAT-KAN-09", "Kanban", "Funcional", "Ver mas y Ver menos", "Columna con mas de 3 cards.", "Usar Ver mas y despues Ver menos.", "Expande y colapsa correctamente.", "-", "Analista piloto", "Media"],
  ["UAT-KAN-10", "Kanban", "Funcional", "Scroll horizontal con flechas", "Pantalla con columnas fuera de vista.", "Click en flechas izquierda/derecha.", "Desplaza columnas suavemente.", "-", "Analista piloto", "Media"],
  ["UAT-KAN-11", "Kanban", "Funcional", "Vista lista mismas acciones", "Kanban con acciones visibles.", "Cambiar a vista lista.", "Mismo conteo que vista kanban con mismos filtros.", "-", "Analista piloto", "Alta"],
  ["UAT-KAN-E01", "Kanban", "Borde", "Sin acciones para el filtro", "Filtro sin coincidencias.", "Aplicar filtro sin resultados.", "Empty state por columna o vista con icono y texto.", "-", "Analista piloto", "Media"],
  ["UAT-KAN-E02", "Kanban", "Borde", "Card con 0 story points", "Accion con 0 puntos.", "Ver card en tablero/lista.", "Badge de puntos no aparece o muestra guion controlado.", "-", "Analista piloto", "Baja"],
  ["UAT-KAN-E03", "Kanban", "Borde", "Mobile touch scroll", "Viewport mobile.", "Desplazar horizontal y verticalmente.", "Scroll horizontal no interfiere con scroll vertical.", "-", "Analista piloto", "Media"],

  ["UAT-ACA-01", "Academia", "Funcional", "Carga sin error", "Analista autenticado.", "Navegar a /academia.", "Pagina carga con contenido visible.", "3s", "Analista piloto", "Critica"],
  ["UAT-ACA-02", "Academia", "Funcional", "Navegacion entre secciones", "Academia abierta.", "Clic en cada seccion del menu.", "Contenido cambia sin recargar pagina.", "500ms", "Analista piloto", "Critica"],
  ["UAT-ACA-03", "Academia", "Funcional", "Glosario busca termino", "Glosario disponible.", "Escribir termino en buscador.", "Resultado relevante aparece.", "500ms", "Analista piloto", "Media"],
  ["UAT-ACA-04", "Academia", "Borde", "Glosario sin coincidencia", "Glosario disponible.", "Buscar texto sin coincidencia.", "Empty state claro; no pantalla rota.", "-", "Analista piloto", "Media"],
  ["UAT-ACA-05", "Academia", "Funcional", "Guia de ceremonias legible", "Academia abierta.", "Abrir guia de ceremonias.", "Agenda y preguntas guia visibles.", "-", "Analista piloto", "Media"],
  ["UAT-ACA-06", "Academia", "Funcional", "Links a tablero funcionan", "Contenido con links internos.", "Clic en cualquier link interno visible.", "Navega a la seccion correcta sin error.", "1s", "Analista piloto", "Alta"],
  ["UAT-ACA-07", "Academia", "Borde", "Contenido en mobile", "Viewport menor a 640px.", "Abrir /academia.", "Texto legible sin desborde horizontal.", "-", "Analista piloto", "Media"],
  ["UAT-ACA-E01", "Academia", "Borde", "Sin datos historicos", "Usuario nuevo o sin historial.", "Abrir seccion con datos dependientes de uso.", "Muestra empty state claro si aplica.", "-", "Analista piloto", "Baja"],
  ["UAT-ACA-E02", "Academia", "Borde", "Primer uso del sistema", "Usuario sin datos previos.", "Abrir academia completa.", "Contenido estatico carga aunque no haya datos.", "-", "Analista piloto", "Alta"],

  ["UAT-DIS-01", "Disciplina", "Funcional", "Carga sin spinner infinito", "Analista autenticado.", "Navegar a /disciplina.", "Contenido visible en menos de 3s.", "3s", "Analista piloto", "Critica"],
  ["UAT-DIS-02", "Disciplina", "Funcional", "Metricas personales coherentes", "Usuario con acciones reales.", "Ver tarjetas y metricas de disciplina.", "Numeros coherentes con acciones creadas, asignadas o etiquetadas.", "-", "Analista piloto", "Critica"],
  ["UAT-DIS-03", "Disciplina", "Funcional", "Acciones del dia visibles", "Existen acciones del dia.", "Revisar Acciones del dia.", "Muestra total, en curso, cerradas y riesgo sin NaN.", "1s", "Analista piloto", "Alta"],
  ["UAT-DIS-04", "Disciplina", "Funcional", "Categorias personales claras", "Acciones creadas/asignadas/etiquetadas.", "Revisar Creaste, Te asignaron y Te etiquetaron.", "Cada accion aparece en la categoria correcta.", "1s", "Analista piloto", "Alta"],
  ["UAT-DIS-05", "Disciplina", "Funcional", "Abrir Kanban desde accion", "Accion visible en Disciplina.", "Clic en accion o acceso a Kanban.", "Navega a Kanban con contexto util.", "1s", "Analista piloto", "Alta"],
  ["UAT-DIS-06", "Disciplina", "Funcional", "Acceso a Academia desde Disciplina", "Academia disponible.", "Clic en Ver Academia o continuar formacion.", "Abre /academia sin error.", "1s", "Analista piloto", "Media"],
  ["UAT-DIS-07", "Disciplina", "Funcional", "Calendario reciente visible", "Recordatorios o minutas existentes.", "Revisar bloque de calendario reciente.", "Muestra elementos y link a /calendario con contexto.", "1s", "Analista piloto", "Media"],
  ["UAT-DIS-E01", "Disciplina", "Borde", "Sin acciones en periodo", "Usuario sin acciones visibles.", "Abrir /disciplina.", "Empty state con mensaje; indicadores no crashean.", "-", "Analista piloto", "Alta"],
  ["UAT-DIS-E02", "Disciplina", "Borde", "Usuario sin acciones", "Responsable sin acciones.", "Abrir disciplina con usuario sin datos.", "Muestra guion o empty state; no NaN.", "-", "Analista piloto", "Media"],

  ["UAT-CAL-01", "Calendario", "Funcional", "Carga sin error", "Analista autenticado.", "Navegar a /calendario.", "Vista de calendario visible.", "3s", "Analista piloto", "Critica"],
  ["UAT-CAL-02", "Calendario", "Funcional", "Acciones aparecen en fecha correcta", "Acciones con fecha limite.", "Ver acciones del dia.", "Coincide con fecha de la accion.", "-", "Analista piloto", "Alta"],
  ["UAT-CAL-03", "Calendario", "Funcional", "Navegar mes anterior/siguiente", "Calendario abierto.", "Clic en flechas anterior/siguiente.", "Cambia mes y acciones correctas.", "500ms", "Analista piloto", "Alta"],
  ["UAT-CAL-04", "Calendario", "Funcional", "Clic en dia muestra acciones", "Dia con acciones.", "Clic en dia.", "Lista de acciones de ese dia.", "500ms", "Analista piloto", "Critica"],
  ["UAT-CAL-05", "Calendario", "Funcional", "Clic en accion abre dialog", "Accion visible en calendario.", "Clic en accion.", "Dialog de edicion con datos correctos.", "500ms", "Analista piloto", "Critica"],
  ["UAT-CAL-06", "Calendario", "Borde", "Dia con muchas acciones", "Dia con 10 o mas acciones.", "Ver dia en calendario.", "No desborda el bloque del dia.", "-", "Analista piloto", "Media"],
  ["UAT-CAL-07", "Calendario", "Funcional", "Hoy destacado visualmente", "Calendario en mes actual.", "Ver calendario.", "Dia actual con estilo diferenciado.", "-", "Analista piloto", "Media"],
  ["UAT-CAL-08", "Calendario", "Funcional", "Acciones vencidas visibles", "Dias pasados con acciones abiertas.", "Ver dias pasados.", "Acciones no completadas marcadas como vencidas o en riesgo.", "-", "Analista piloto", "Alta"],
  ["UAT-CAL-E01", "Calendario", "Borde", "Mes sin acciones", "Mes sin acciones visibles.", "Navegar a mes sin acciones.", "Calendario vacio sin error.", "-", "Analista piloto", "Media"],
  ["UAT-CAL-E02", "Calendario", "Borde", "Accion sin hora limite", "Accion con fecha sin hora.", "Ver accion en calendario.", "Aparece en el dia sin hora invalida.", "-", "Analista piloto", "Media"],

  ["UAT-NOT-01", "Notificaciones", "Funcional", "Badge de conteo visible", "Usuario con notificaciones.", "Abrir app.", "Numero en icono de notificaciones.", "-", "Analista piloto", "Alta"],
  ["UAT-NOT-02", "Notificaciones", "Funcional", "Abrir panel de notificaciones", "Usuario autenticado.", "Clic en icono de notificaciones.", "Lista sin spinner infinito.", "1s", "Analista piloto", "Critica"],
  ["UAT-NOT-03", "Notificaciones", "Funcional", "Notificacion de asignacion", "Accion asignada al usuario.", "Ser asignado como responsable.", "Notificacion aparece con accion vinculada.", "-", "Analista piloto", "Alta"],
  ["UAT-NOT-04", "Notificaciones", "Funcional", "Marcar como leida", "Notificacion no leida.", "Clic en notificacion.", "Badge disminuye y queda marcada.", "500ms", "Analista piloto", "Critica"],
  ["UAT-NOT-05", "Notificaciones", "Funcional", "Marcar todas como leidas", "Varias no leidas y boton visible.", "Clic en Marcar todas.", "Badge desaparece.", "500ms", "Analista piloto", "Media"],
  ["UAT-NOT-06", "Notificaciones", "Funcional", "Click navega a accion", "Notificacion con accion vinculada.", "Clic en notificacion.", "Abre accion correspondiente.", "1s", "Analista piloto", "Critica"],
  ["UAT-NOT-07", "Notificaciones", "Borde", "Sin notificaciones", "Usuario sin notificaciones.", "Abrir panel.", "Empty state con texto; no lista vacia.", "-", "Analista piloto", "Media"],
  ["UAT-NOT-08", "Notificaciones", "Condicional", "Notificaciones en tiempo real", "Dos sesiones abiertas con usuarios distintos.", "Otra sesion asigna accion al analista.", "Badge actualiza sin recargar en menos de 5s.", "5s", "Scrum Master", "Alta"],
  ["UAT-NOT-E01", "Notificaciones", "Borde", "Accion eliminada y notificacion existe", "Notificacion vinculada a accion no disponible.", "Clic en notificacion.", "Muestra mensaje de no encontrada o similar.", "-", "Scrum Master", "Media"],
  ["UAT-NOT-E02", "Notificaciones", "Borde", "50 o mas no leidas", "Usuario con muchas no leidas.", "Abrir header.", "Badge muestra 50+ o formato controlado.", "-", "Scrum Master", "Baja"],

  ["UAT-PRF-01", "Perfil", "Funcional", "Datos del perfil cargan", "Analista autenticado.", "Navegar a /settings/profile.", "Nombre, email y rol visibles.", "2s", "Analista piloto", "Critica"],
  ["UAT-PRF-02", "Perfil", "Funcional", "Editar nombre", "Perfil abierto.", "Cambiar nombre y guardar.", "Nombre actualizado en header/nav.", "1s", "Analista piloto", "Media"],
  ["UAT-PRF-03", "Perfil", "Condicional", "Cambiar avatar si existe", "Control de avatar visible.", "Subir imagen.", "Avatar actualizado sin recargar.", "2s", "Analista piloto", "Baja"],
  ["UAT-PRF-04", "Perfil", "Permisos", "Rol visible y no editable", "Perfil abierto.", "Ver campo rol.", "Rol visible y no editable para Analista.", "-", "Analista piloto", "Alta"],
  ["UAT-PRF-05", "Perfil", "Funcional", "Cerrar sesion desde perfil o menu", "Sesion activa.", "Clic en Cerrar sesion.", "Redirige a login y sesion queda limpia.", "1s", "Analista piloto", "Critica"],
  ["UAT-PRF-06", "Perfil", "Condicional", "Cambiar contrasena si existe", "Flujo visible para usuario.", "Completar flujo de cambio de contrasena.", "Confirmacion exitosa y toast claro.", "-", "Analista piloto", "Media"],
  ["UAT-PRF-07", "Perfil", "Funcional", "Preferencias o area guardadas", "Campo editable visible.", "Cambiar preferencia o area y guardar.", "Persiste al recargar pagina.", "-", "Analista piloto", "Media"],
  ["UAT-PRF-E01", "Perfil", "Borde", "Nombre con caracteres especiales", "Perfil editable.", "Guardar nombre con caracteres especiales.", "Se guarda y muestra correctamente.", "-", "Analista piloto", "Baja"],
  ["UAT-PRF-E02", "Perfil", "Borde", "Cerrar sesion con dialog abierto", "Dialog de perfil abierto.", "Cerrar sesion desde menu si esta disponible.", "Dialog se cierra y sesion limpia sin error.", "-", "Analista piloto", "Media"],
];

const uat = ws("UAT");
setValues(uat, "A1:M1", [["ID Caso", "Modulo", "Tipo", "Caso", "Precondicion", "Pasos", "Resultado esperado", "Tiempo max", "Responsable", "Resultado", "Evidencia / URL", "Severidad", "Observacion"]]);
const uatRows = cases.map(([id, mod, tipo, caso, pre, pasos, esperado, tiempo, responsable, severidad]) => [
  id,
  mod,
  tipo,
  caso,
  pre,
  pasos,
  esperado,
  tiempo,
  responsable,
  "Pendiente",
  "",
  severidad,
  "",
]);
setValues(uat, `A2:M${uatRows.length + 1}`, uatRows);
header(uat, "A1:M1");
body(uat, `A2:M${uatRows.length + 1}`);
table(uat, `A1:M${uatRows.length + 1}`, "MatrizUAT");
uat.freezePanes.freezeRows(1);
uat.getRange("J2:J250").dataValidation = { rule: { type: "list", values: ["Pendiente", "Aprobado", "Fallido", "Bloqueado", "No aplica"] } };
uat.getRange("L2:L250").dataValidation = { rule: { type: "list", values: ["Critica", "Alta", "Media", "Baja"] } };
widths(uat, { A: 120, B: 135, C: 105, D: 260, E: 240, F: 330, G: 330, H: 90, I: 160, J: 110, K: 210, L: 90, M: 280 });

const sesiones = ws("Sesiones");
setValues(sesiones, "A1:H1", [["Sesion", "Duracion", "Modulos", "Casos", "Objetivo", "Ejecutor", "Facilitador", "Estado"]]);
header(sesiones, "A1:H1");
const sesRows = [
  ["Sesion 1", "90 min", "Dashboard + Kanban basico", "UAT-DASH-01 al 10; UAT-KAN-01 al 08", "Validar entrada operativa y flujo base de acciones.", "Analistas piloto", "Scrum Master", "Pendiente"],
  ["Sesion 2", "60 min", "Kanban avanzado", "UAT-KAN-09 al 11; casos borde Kanban", "Validar vistas, scroll, filtros y empty states.", "Analistas piloto", "Scrum Master", "Pendiente"],
  ["Sesion 3", "60 min", "Academia + Disciplina + Perfil", "Todos los casos de estos modulos", "Validar experiencia personal del Analista.", "Analistas piloto", "Scrum Master", "Pendiente"],
  ["Sesion 4", "60 min", "Calendario + Notificaciones", "Todos los casos de estos modulos", "Validar seguimiento temporal y avisos.", "Analistas piloto", "Scrum Master", "Pendiente"],
  ["Sesion 5", "30 min", "Casos borde", "Todos los UAT-XXX-E0N pendientes", "Confirmar empty states, errores y datos extremos.", "Analistas piloto", "Scrum Master", "Pendiente"],
];
setValues(sesiones, `A2:H${sesRows.length + 1}`, sesRows);
body(sesiones, `A2:H${sesRows.length + 1}`);
table(sesiones, `A1:H${sesRows.length + 1}`, "SesionesUAT");
sesiones.getRange("H2:H100").dataValidation = { rule: { type: "list", values: ["Pendiente", "Programada", "Completada", "Reprogramada", "Cancelada"] } };
widths(sesiones, { A: 100, B: 85, C: 240, D: 280, E: 360, F: 170, G: 150, H: 120 });

const criterios = ws("Criterios por modulo");
setValues(criterios, "A1:J1", [["Modulo", "Criticos 0 fallos", "Aceptables", "Casos UAT", "% Aprobado", "Criticos fallidos", "Fallos medios", "Bloqueados", "Estado", "Go/No-Go"]]);
header(criterios, "A1:J1");
const critRows = [
  ["Dashboard", "DASH-01, 02, 04, 09, 10", "DASH-03, 06, 07, 08", '=COUNTIF(UAT!B2:B250,A2)', '=IFERROR(COUNTIFS(UAT!B2:B250,A2,UAT!J2:J250,"Aprobado")/D2,0)', '=COUNTIFS(UAT!B2:B250,A2,UAT!L2:L250,"Critica",UAT!J2:J250,"Fallido")+COUNTIFS(UAT!B2:B250,A2,UAT!L2:L250,"Critica",UAT!J2:J250,"Bloqueado")', '=COUNTIFS(UAT!B2:B250,A2,UAT!L2:L250,"Media",UAT!J2:J250,"Fallido")', '=COUNTIFS(UAT!B2:B250,A2,UAT!J2:J250,"Bloqueado")', "No iniciado", '=IF(AND(E2>=0.95,F2=0,G2<2,H2=0),"Go","No-Go")'],
  ["Kanban", "KAN-01, 03, 05, 07", "KAN-04, 06, 09, 11", '=COUNTIF(UAT!B2:B250,A3)', '=IFERROR(COUNTIFS(UAT!B2:B250,A3,UAT!J2:J250,"Aprobado")/D3,0)', '=COUNTIFS(UAT!B2:B250,A3,UAT!L2:L250,"Critica",UAT!J2:J250,"Fallido")+COUNTIFS(UAT!B2:B250,A3,UAT!L2:L250,"Critica",UAT!J2:J250,"Bloqueado")', '=COUNTIFS(UAT!B2:B250,A3,UAT!L2:L250,"Media",UAT!J2:J250,"Fallido")', '=COUNTIFS(UAT!B2:B250,A3,UAT!J2:J250,"Bloqueado")', "No iniciado", '=IF(AND(E3>=0.95,F3=0,G3<2,H3=0),"Go","No-Go")'],
  ["Academia", "ACA-01, 02", "ACA-03, 04, 06", '=COUNTIF(UAT!B2:B250,A4)', '=IFERROR(COUNTIFS(UAT!B2:B250,A4,UAT!J2:J250,"Aprobado")/D4,0)', '=COUNTIFS(UAT!B2:B250,A4,UAT!L2:L250,"Critica",UAT!J2:J250,"Fallido")+COUNTIFS(UAT!B2:B250,A4,UAT!L2:L250,"Critica",UAT!J2:J250,"Bloqueado")', '=COUNTIFS(UAT!B2:B250,A4,UAT!L2:L250,"Media",UAT!J2:J250,"Fallido")', '=COUNTIFS(UAT!B2:B250,A4,UAT!J2:J250,"Bloqueado")', "No iniciado", '=IF(AND(E4>=0.95,F4=0,G4<2,H4=0),"Go","No-Go")'],
  ["Disciplina", "DIS-01, 02", "DIS-03, 04, 06", '=COUNTIF(UAT!B2:B250,A5)', '=IFERROR(COUNTIFS(UAT!B2:B250,A5,UAT!J2:J250,"Aprobado")/D5,0)', '=COUNTIFS(UAT!B2:B250,A5,UAT!L2:L250,"Critica",UAT!J2:J250,"Fallido")+COUNTIFS(UAT!B2:B250,A5,UAT!L2:L250,"Critica",UAT!J2:J250,"Bloqueado")', '=COUNTIFS(UAT!B2:B250,A5,UAT!L2:L250,"Media",UAT!J2:J250,"Fallido")', '=COUNTIFS(UAT!B2:B250,A5,UAT!J2:J250,"Bloqueado")', "No iniciado", '=IF(AND(E5>=0.95,F5=0,G5<2,H5=0),"Go","No-Go")'],
  ["Calendario", "CAL-01, 04, 05", "CAL-02, 03, 07", '=COUNTIF(UAT!B2:B250,A6)', '=IFERROR(COUNTIFS(UAT!B2:B250,A6,UAT!J2:J250,"Aprobado")/D6,0)', '=COUNTIFS(UAT!B2:B250,A6,UAT!L2:L250,"Critica",UAT!J2:J250,"Fallido")+COUNTIFS(UAT!B2:B250,A6,UAT!L2:L250,"Critica",UAT!J2:J250,"Bloqueado")', '=COUNTIFS(UAT!B2:B250,A6,UAT!L2:L250,"Media",UAT!J2:J250,"Fallido")', '=COUNTIFS(UAT!B2:B250,A6,UAT!J2:J250,"Bloqueado")', "No iniciado", '=IF(AND(E6>=0.95,F6=0,G6<2,H6=0),"Go","No-Go")'],
  ["Notificaciones", "NOT-01, 02, 04, 06", "NOT-03, 05, 08", '=COUNTIF(UAT!B2:B250,A7)', '=IFERROR(COUNTIFS(UAT!B2:B250,A7,UAT!J2:J250,"Aprobado")/D7,0)', '=COUNTIFS(UAT!B2:B250,A7,UAT!L2:L250,"Critica",UAT!J2:J250,"Fallido")+COUNTIFS(UAT!B2:B250,A7,UAT!L2:L250,"Critica",UAT!J2:J250,"Bloqueado")', '=COUNTIFS(UAT!B2:B250,A7,UAT!L2:L250,"Media",UAT!J2:J250,"Fallido")', '=COUNTIFS(UAT!B2:B250,A7,UAT!J2:J250,"Bloqueado")', "No iniciado", '=IF(AND(E7>=0.95,F7=0,G7<2,H7=0),"Go","No-Go")'],
  ["Perfil", "PRF-01, 05", "PRF-02, 03, 06", '=COUNTIF(UAT!B2:B250,A8)', '=IFERROR(COUNTIFS(UAT!B2:B250,A8,UAT!J2:J250,"Aprobado")/D8,0)', '=COUNTIFS(UAT!B2:B250,A8,UAT!L2:L250,"Critica",UAT!J2:J250,"Fallido")+COUNTIFS(UAT!B2:B250,A8,UAT!L2:L250,"Critica",UAT!J2:J250,"Bloqueado")', '=COUNTIFS(UAT!B2:B250,A8,UAT!L2:L250,"Media",UAT!J2:J250,"Fallido")', '=COUNTIFS(UAT!B2:B250,A8,UAT!J2:J250,"Bloqueado")', "No iniciado", '=IF(AND(E8>=0.95,F8=0,G8<2,H8=0),"Go","No-Go")'],
];
setValues(criterios, `A2:J${critRows.length + 1}`, critRows);
body(criterios, `A2:J${critRows.length + 1}`);
table(criterios, `A1:J${critRows.length + 1}`, "CriteriosModulo");
criterios.getRange("E2:E100").format.numberFormat = "0%";
criterios.getRange("I2:I100").dataValidation = { rule: { type: "list", values: ["No iniciado", "En prueba", "Aprobado", "Aprobado con observaciones", "Bloqueado"] } };
widths(criterios, { A: 135, B: 210, C: 220, D: 90, E: 100, F: 120, G: 110, H: 100, I: 170, J: 100 });

const riesgos = ws("Riesgos");
setValues(riesgos, "A1:I1", [["ID", "Tipo", "Riesgo / defecto", "Impacto", "Probabilidad", "Mitigacion", "Estado", "Responsable", "Fecha objetivo"]]);
header(riesgos, "A1:I1");
const riskRows = [
  ["R01", "Permisos", "Analista ve opciones restringidas o no ve pantallas incluidas.", "Alta", "Media", "Ejecutar casos de permisos antes de UAT amplio.", "Abierto", "Scrum Master", ""],
  ["R02", "Datos", "No hay datos suficientes para probar fechas, estados o notificaciones.", "Alta", "Media", "Preparar acciones y eventos minimos antes de sesiones.", "Abierto", "Scrum Master", ""],
  ["R03", "Calidad", "Aparecen NaN, undefined o pantalla en blanco.", "Critica", "Baja", "Bloquear salida hasta corregir y repruebar.", "Abierto", "Equipo tecnico", ""],
  ["R04", "Prueba", "Notificacion en tiempo real no se puede probar por falta de dos sesiones.", "Media", "Media", "Agendar dos navegadores o dos usuarios.", "Abierto", "Scrum Master", ""],
  ["R05", "Adopcion", "Analistas no registran evidencia o resultado en UAT.", "Media", "Media", "Ejecutar UAT guiado y revisar al cierre de cada sesion.", "Abierto", "Scrum Master", ""],
];
setValues(riesgos, `A2:I${riskRows.length + 1}`, riskRows);
body(riesgos, `A2:I${riskRows.length + 1}`);
table(riesgos, `A1:I${riskRows.length + 1}`, "RiesgosUAT");
riesgos.getRange("G2:G100").dataValidation = { rule: { type: "list", values: ["Abierto", "En mitigacion", "Cerrado"] } };
widths(riesgos, { A: 65, B: 110, C: 380, D: 100, E: 115, F: 360, G: 120, H: 160, I: 120 });

const bug = ws("Reporte bug");
setValues(bug, "A1:F1", [["Plantilla de reporte de bug", "", "", "", "", ""]]);
title(bug, "A1:F1");
setValues(bug, "A3:F3", [["Campo", "Descripcion", "Ejemplo", "Obligatorio", "Responsable", "Notas"]]);
header(bug, "A3:F3");
const bugRows = [
  ["ID", "Identificador unico", "UAT-BUG-001", "Si", "Scrum Master", "Consecutivo."],
  ["Modulo", "Pantalla donde ocurre", "Dashboard / Kanban / Academia / Disciplina / Calendario / Notificaciones / Perfil", "Si", "Analista", ""],
  ["Caso relacionado", "ID de UAT", "UAT-DASH-01", "Si", "Analista", ""],
  ["Severidad", "Critico / Alto / Medio / Bajo", "Critico", "Si", "Scrum Master", "Critico bloquea salida."],
  ["Pasos para reproducir", "Pasos numerados", "1) Abrir... 2) Clic...", "Si", "Analista", "Debe ser reproducible."],
  ["Resultado obtenido", "Que paso realmente", "Spinner infinito", "Si", "Analista", ""],
  ["Resultado esperado", "Que debia pasar", "Carga en menos de 3s", "Si", "Analista", ""],
  ["Frecuencia", "Siempre / intermitente / una vez", "Siempre", "Si", "Analista", ""],
];
setValues(bug, `A4:F${bugRows.length + 3}`, bugRows);
body(bug, `A4:F${bugRows.length + 3}`);
table(bug, `A3:F${bugRows.length + 3}`, "ReporteBug");
widths(bug, { A: 160, B: 280, C: 320, D: 110, E: 150, F: 260 });

for (const sheet of wb.worksheets.items) {
  const used = sheet.getUsedRange();
  if (used) {
    used.format.wrapText = true;
    used.format.verticalAlignment = "Top";
  }
  sheet.showGridLines = false;
}

await fs.mkdir(outputDir, { recursive: true });

console.log((await wb.inspect({
  kind: "table",
  range: "Resumen!A1:H15",
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 8,
})).ndjson);

console.log((await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
})).ndjson);

for (const sheetName of ["Resumen", "Flujo y responsables", "Plan", "Plan por modulo", "UAT", "Sesiones", "Criterios por modulo", "Riesgos", "Reporte bug"]) {
  await wb.render({ sheetName, range: "A1:H18", scale: 1 });
}

const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outputPath);
console.log(`SAVED ${outputPath}`);
