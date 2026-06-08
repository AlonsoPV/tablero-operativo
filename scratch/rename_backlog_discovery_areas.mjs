import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/alpev/OneDrive/Desktop/EnvialoMexico/Plan_UAT_Scrumban.xlsx";
const outputDir = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/product-backlog";
const outputPath = path.join(outputDir, "Plan_UAT_Scrumban_backlog_discovery_areas.xlsx");
const desiredName = "Backlog Discovery Areas";

await fs.mkdir(outputDir, { recursive: true });
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

let sheet = workbook.worksheets.getItemOrNullObject?.("Product Backlog");
if (!sheet || sheet.isNullObject) {
  sheet = workbook.worksheets.getItemOrNullObject?.(desiredName);
}
if (!sheet || sheet.isNullObject) {
  throw new Error("No se encontro la hoja Product Backlog para actualizar.");
}

sheet.name = desiredName;

sheet.getRange("A1:L1").merge();
sheet.getRange("A1").values = [["Product Backlog Basado en Discovery por Areas"]];
sheet.getRange("A1").format = {
  fill: "#0F2F45",
  font: { name: "Aptos", bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "center",
};

sheet.getRange("A2:L2").merge();
sheet.getRange("A2").values = [[
  "Historias operativas derivadas del discovery: visibilidad, ownership, seguimiento, SLA, dependencias, adopcion y cierre por areas.",
]];
sheet.getRange("A2").format = {
  fill: "#EAF4FB",
  font: { name: "Aptos", italic: true, color: "#243B53", size: 10 },
  horizontalAlignment: "center",
};

sheet.getRange("A39:L39").merge();
sheet.getRange("A39").values = [["Validacion metodologica"]];
sheet.getRange("A41:L45").values = [
  ["1", "Las historias usan el formato: Como <rol operativo> quiero <accion> para poder <valor>.", null, null, null, null, null, null, null, null, null, null],
  ["2", "Los roles fueron adaptados al contexto operativo del cliente: Direccion, lideres de area, RH, Sistemas, Operaciones, administracion y mejora continua.", null, null, null, null, null, null, null, null, null, null],
  ["3", "Cada historia incluye al menos dos criterios de aceptacion verificables para apoyar Ready/Done.", null, null, null, null, null, null, null, null, null, null],
  ["4", "El backlog se basa en discovery por areas y no se enfoca principalmente en Finanzas.", null, null, null, null, null, null, null, null, null, null],
  ["5", "Cada historia fue revisada contra INVEST: independiente, negociable, valiosa, estimable, pequena y comprobable.", null, null, null, null, null, null, null, null, null, null],
];

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
