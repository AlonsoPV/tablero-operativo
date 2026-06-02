import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const path = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/uat_analistas/Plan_Implementacion_UAT_Tablero_Analistas_Disciplina.xlsx";
const input = await FileBlob.load(path);
const wb = await SpreadsheetFile.importXlsx(input);

const sheets = await wb.inspect({ kind: "workbook", summary: "sheet list" });
console.log(sheets.ndjson);

const resumen = await wb.inspect({
  kind: "table",
  range: "Resumen!A1:H16",
  include: "values,formulas",
  tableMaxRows: 16,
  tableMaxCols: 8,
});
console.log(resumen.ndjson);

const guia = await wb.inspect({
  kind: "table",
  range: "Guia del workbook!A1:F13",
  include: "values",
  tableMaxRows: 13,
  tableMaxCols: 6,
});
console.log(guia.ndjson);

const planModulo = await wb.inspect({
  kind: "table",
  range: "Plan por modulo!A1:J8",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 10,
});
console.log(planModulo.ndjson);

const uat = await wb.inspect({
  kind: "table",
  range: "UAT!A1:N8",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 14,
});
console.log(uat.ndjson);

const checklistModulo = await wb.inspect({
  kind: "table",
  range: "Checklist por modulo!A1:J6",
  include: "values,formulas",
  tableMaxRows: 6,
  tableMaxCols: 10,
});
console.log(checklistModulo.ndjson);

const errors = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
});
console.log(errors.ndjson);
